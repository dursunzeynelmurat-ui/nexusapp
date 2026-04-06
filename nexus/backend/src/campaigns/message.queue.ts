/**
 * message.queue.ts
 *
 * One Bull job per message. Replaces the loop-inside-one-job pattern in
 * the old campaign.queue.ts which caused duplicate sends on retry.
 *
 * Each job:
 *   1. Idempotency check — skip if CampaignContact.status === 'SENT'
 *   2. Rate limit check — per-session hourly/daily (warmup schedule)
 *   3. User quota check — per-user daily limit (plan enforcement)
 *   4. Route send command to the correct session worker via Redis pub/sub
 *   5. Wait for RPC reply from session worker (with timeout)
 *   6. Update CampaignContact.status in DB
 *   7. Increment campaign counters in Redis (flushed to DB every 30s separately)
 *   8. Emit Socket.IO progress (via Redis pub/sub → API servers)
 *
 * Job payload uses campaignContactId as the Bull jobId for deduplication:
 * if the orchestrator enqueues the same contact twice, Bull skips the second.
 */

import Bull, { type Job } from 'bull'
import Redis from 'ioredis'
import { env } from '../utils/env'
import { workerPrisma as prisma } from '../prisma/client'
import { logger } from '../utils/logger'
import {
  redis,
  getSessionMeta,
  isSessionConnected,
  incrementRiskScore,
  keys,
} from '../whatsapp/session.registry'
import {
  checkAndIncrementSessionLimits,
  checkAndIncrementUserQuota,
  incrementCampaignSent,
  incrementCampaignFailed,
  getCampaignCounters,
} from '../whatsapp/rate-limit.service'

// ── Job payload ───────────────────────────────────────────────────────────────

export interface MessageJobPayload {
  campaignContactId: string  // Primary key — used as Bull jobId for deduplication
  campaignId:        string
  userId:            string
  sessionId:         string
  phone:             string
  message:           string
  mediaUrl?:         string
}

// ── Queue definition ──────────────────────────────────────────────────────────

export const messageSendQueue = new Bull<MessageJobPayload>('campaign:messages', {
  redis: env.REDIS_URL,
  defaultJobOptions: {
    // 5 attempts with custom backoff (see failed handler below)
    attempts:         5,
    backoff:          { type: 'exponential', delay: 10_000 },
    removeOnComplete: true,
    removeOnFail:     false,
  },
})

// Dedicated Redis client for publishing send commands and events
const pubRedis = new Redis(env.REDIS_URL)
// Dedicated Redis client for subscribing to RPC replies
const subRedis = new Redis(env.REDIS_URL)

// ── RPC: send message via session worker ─────────────────────────────────────

const SEND_TIMEOUT_MS = 45_000  // 45s — allows for Baileys network round-trip
const EVENT_CHANNEL   = 'nexus:events'

/**
 * Publish a SEND_MESSAGE command to the session worker that owns the session,
 * then wait for the reply on a per-job ephemeral Redis channel.
 * Throws on timeout or failure so Bull can retry the job.
 */
async function rpcSendMessage(
  sessionId: string,
  phone:     string,
  message:   string,
  mediaUrl:  string | undefined,
  jobId:     string
): Promise<void> {
  const meta = await getSessionMeta(sessionId)
  if (!meta) throw new Error(`Session ${sessionId} not found in registry`)
  if (meta.status !== 'CONNECTED') throw new Error(`Session ${sessionId} is not connected`)

  // One-time reply channel per job — prevents reply from going to wrong listener
  const replyChannel = `reply:send:${jobId}`

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      subRedis.unsubscribe(replyChannel).catch(() => {})
      reject(new Error(`Send timeout for job ${jobId}`))
    }, SEND_TIMEOUT_MS)

    subRedis.subscribe(replyChannel, (err) => {
      if (err) {
        clearTimeout(timeout)
        return reject(err)
      }

      subRedis.once('message', (_channel, raw) => {
        clearTimeout(timeout)
        subRedis.unsubscribe(replyChannel).catch(() => {})
        const reply = JSON.parse(raw)
        if (reply.ok) {
          resolve()
        } else {
          reject(new Error(reply.err ?? 'Unknown send error'))
        }
      })

      // Publish send command AFTER subscribing to reply channel (avoid race)
      pubRedis.publish(`worker:${meta.workerId}:commands`, JSON.stringify({
        type:      'SEND_MESSAGE',
        sessionId, phone, message, mediaUrl,
        replyTo:   replyChannel,
      })).catch((e) => {
        clearTimeout(timeout)
        reject(e)
      })
    })
  })
}

// ── Progress emission ─────────────────────────────────────────────────────────

async function emitProgress(campaignId: string, totalCount: number): Promise<void> {
  const { sent, failed } = await getCampaignCounters(campaignId)
  await pubRedis.publish(EVENT_CHANNEL, JSON.stringify({
    type: 'CAMPAIGN_PROGRESS',
    campaignId,
    sentCount:  sent,
    failedCount: failed,
    totalCount,
    percent: Math.round(((sent + failed) / totalCount) * 100),
  }))
}

// ── Main job processor ────────────────────────────────────────────────────────

messageSendQueue.process(async (job: Job<MessageJobPayload>) => {
  const { campaignContactId, campaignId, userId, sessionId, phone, message, mediaUrl } = job.data

  // ── Step 1: Idempotency guard ─────────────────────────────────────────────
  // If this job was retried after a crash that already sent the message,
  // the DB status will be SENT — skip to avoid duplicate delivery.
  const cc = await prisma.campaignContact.findUnique({
    where:  { id: campaignContactId },
    select: { status: true, campaign: { select: { totalCount: true, userId: true } } },
  })
  if (!cc) {
    logger.warn('CampaignContact not found, skipping', { campaignContactId })
    return
  }
  if (cc.status === 'SENT') {
    logger.info('Already sent, skipping (idempotency)', { campaignContactId })
    return
  }

  // ── Step 2: User quota check ──────────────────────────────────────────────
  // Enforce per-user daily message limit (plan-based — defaults to 'free')
  const quotaResult = await checkAndIncrementUserQuota(userId)
  if (!quotaResult.allowed) {
    // Don't retry — re-enqueue later when quota resets
    logger.warn('User daily quota exceeded', { userId, campaignId })
    await prisma.campaignContact.update({
      where: { id: campaignContactId },
      data:  { status: 'FAILED', error: 'USER_QUOTA_EXCEEDED' },
    })
    await incrementCampaignFailed(campaignId)
    return
  }

  // ── Step 3: Session rate limit check (warmup schedule) ───────────────────
  // Check hourly and daily limits based on session age
  const sessionRow = await prisma.whatsAppSession.findFirst({
    where:  { sessionId },
    select: { createdAt: true },
  })
  if (!sessionRow) throw new Error(`Session ${sessionId} not in DB`)

  const riskMeta   = await getSessionMeta(sessionId)
  const riskScore  = parseFloat(riskMeta?.riskScore ?? '0')

  const limitResult = await checkAndIncrementSessionLimits(
    sessionId,
    sessionRow.createdAt,
    riskScore
  )
  if (!limitResult.allowed) {
    // Throw so Bull retries — but with appropriate delay
    const err = new RateLimitError(limitResult.reason!, limitResult.retryAfterMs ?? 3_600_000)
    throw err
  }

  // ── Step 4: Send via session worker RPC ──────────────────────────────────
  try {
    await rpcSendMessage(sessionId, phone, message, mediaUrl, String(job.id))

    await prisma.campaignContact.update({
      where: { id: campaignContactId },
      data:  { status: 'SENT', sentAt: new Date() },
    })
    await incrementCampaignSent(campaignId)
    logger.info('Message sent', { campaignContactId, phone, campaignId })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)

    await prisma.campaignContact.update({
      where: { id: campaignContactId },
      data:  { status: 'FAILED', error: errMsg },
    })
    await incrementCampaignFailed(campaignId)
    await incrementRiskScore(sessionId, 0.05)
    logger.warn('Message failed', { campaignContactId, phone, err: errMsg })
    throw err  // Re-throw so Bull applies backoff and retries
  }

  // ── Step 5: Emit progress ─────────────────────────────────────────────────
  // API servers subscribed to EVENT_CHANNEL forward this to Socket.IO rooms
  await emitProgress(campaignId, cc.campaign.totalCount)

  // ── Step 6: Check for campaign completion ─────────────────────────────────
  const remaining = await prisma.campaignContact.count({
    where: { campaignId, status: 'PENDING' },
  })
  if (remaining === 0) {
    const { sent, failed } = await getCampaignCounters(campaignId)
    await prisma.campaign.updateMany({
      where: { id: campaignId },
      data:  { status: 'COMPLETED', completedAt: new Date(), sentCount: sent, failedCount: failed },
    })
    await pubRedis.publish(EVENT_CHANNEL, JSON.stringify({
      type: 'CAMPAIGN_COMPLETE', campaignId,
      sentCount: sent, failedCount: failed,
    }))
    logger.info('Campaign completed', { campaignId, sent, failed })
  }
})

// ── Custom error class for rate limit retries ─────────────────────────────────

export class RateLimitError extends Error {
  constructor(public reason: string, public retryAfterMs: number) {
    super(`Rate limit: ${reason}`)
    this.name = 'RateLimitError'
  }
}

// ── Failed job handler: custom backoff by error type ─────────────────────────

messageSendQueue.on('failed', async (job: Job<MessageJobPayload>, err: Error) => {
  logger.error('Message job failed', {
    jobId:     job.id,
    phone:     job.data.phone,
    campaignId:job.data.campaignId,
    err:       err.message,
    attempts:  job.attemptsMade,
  })

  if (err instanceof RateLimitError) {
    // Rate limit hit — delay next attempt until the limit resets
    if (job.attemptsMade < 5) {
      await job.retry()
      // Override backoff: delay by retryAfterMs instead of exponential
      await new Promise((r) => setTimeout(r, err.retryAfterMs))
    }
    return
  }

  if (err.message.includes('not connected') || err.message.includes('not found in registry')) {
    // Session is down — pause all jobs for this session to avoid hammering
    // The session worker will re-init and re-register when reconnected
    logger.warn('Session down, pausing message queue', { sessionId: job.data.sessionId })
    await messageSendQueue.pause()
    // Resume after 60s (session worker reconnect window)
    setTimeout(() => messageSendQueue.resume().catch(() => {}), 60_000)
  }
})

// ── Counter flush job (runs every 30s) ───────────────────────────────────────
// Persists Redis campaign counters to PostgreSQL in batch instead of per-message.

export const counterFlushQueue = new Bull('campaign:counter-flush', {
  redis: env.REDIS_URL,
})

counterFlushQueue.process(async () => {
  // Find all campaigns with in-Redis counters
  const sentKeys = await redis.keys('campaign:*:sent')

  for (const sentKey of sentKeys) {
    // Extract campaignId from key pattern "campaign:{id}:sent"
    const campaignId = sentKey.split(':')[1]
    const { sent, failed } = await getCampaignCounters(campaignId)

    await prisma.campaign.updateMany({
      where: { id: campaignId, status: { in: ['RUNNING', 'QUEUED'] } },
      data:  { sentCount: sent, failedCount: failed },
    })
  }
})

// Schedule the flush job to run every 30 seconds
;(async () => {
  // Remove existing repeatable job to avoid duplicates on restart
  const repeatableJobs = await counterFlushQueue.getRepeatableJobs()
  for (const j of repeatableJobs) {
    await counterFlushQueue.removeRepeatableByKey(j.key)
  }
  await counterFlushQueue.add({}, { repeat: { every: 30_000 } })
})()
