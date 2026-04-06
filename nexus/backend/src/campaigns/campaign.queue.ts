/**
 * campaign.queue.ts
 *
 * Campaign ORCHESTRATOR queue — one job per campaign (not per message).
 *
 * This job does NOT send messages. Its only job is to:
 *   1. Load all PENDING CampaignContacts for the campaign
 *   2. Compute staggered human-like delays for each contact
 *   3. Enqueue one message job per contact into messageSendQueue
 *      with Bull jobId = campaignContactId (deduplication)
 *
 * The actual sending happens in message.queue.ts.
 *
 * Anti-ban delay model (replaces the old uniform 3–8s sleep):
 *   - Base delay: ~50ms per character (simulated typing speed)
 *   - Jitter: ±20% random variation so timing is never uniform
 *   - Burst pattern: every N messages (N = random 5–20), add a 20–50s rest
 *   - Off-hours multiplier: 2× slower between 22:00–06:00 UTC
 *   - Warmup multiplier: new sessions send slower
 *   - Risk multiplier: higher risk score = slower sending
 */

import Bull, { type Job } from 'bull'
import { env } from '../utils/env'
import { workerPrisma as prisma } from '../prisma/client'
import { logger } from '../utils/logger'
import { messageSendQueue, type MessageJobPayload } from './message.queue'
import { getWarmupLimits } from '../whatsapp/rate-limit.service'
import { getSessionMeta } from '../whatsapp/session.registry'

export const campaignQueue = new Bull<{ campaignId: string }>('campaigns', {
  redis: env.REDIS_URL,
  defaultJobOptions: {
    // Orchestrator should only run once — no retries (safe, idempotent via jobId)
    attempts:         1,
    removeOnComplete: true,
    removeOnFail:     false,
  },
})

// ── Human-like delay computation ──────────────────────────────────────────────

interface DelayContext {
  message:          string
  sessionCreatedAt: Date
  riskScore:        number       // 0.0 (safe) – 1.0 (danger)
  contactIndex:     number       // position in current campaign batch
  burstBoundary:    number       // next index where a long rest occurs
}

/**
 * Compute the delay (ms) before sending the message at `contactIndex`.
 *
 * Anti-ban design decisions:
 *   - Message length drives base delay (longer message = more typing time)
 *   - Jitter ensures no two inter-message gaps are identical
 *   - Burst boundary injects a long pause after a burst of messages,
 *     mimicking human behavior (type several messages, take a break)
 *   - Off-hours multiplier slows all sending after 10pm / before 6am UTC
 *   - New session warmup multiplier: fresh accounts send slower
 *   - Risk multiplier: if risk score elevated, slow down before WhatsApp bans
 */
function computeDelay(ctx: DelayContext): number {
  const { message, sessionCreatedAt, riskScore, contactIndex, burstBoundary } = ctx

  // ── Base: typing speed simulation ────────────────────────────────────────
  // 50ms per character ≈ 200 characters/minute ≈ typical adult typing speed
  const typingBase = message.length * 50

  // Reading/thinking time before hitting send (0.5–3s)
  const thinkingMs = 500 + Math.random() * 2500

  let base = typingBase + thinkingMs

  // ── Warmup multiplier ─────────────────────────────────────────────────────
  // New sessions send slower to avoid triggering WhatsApp's new-account heuristics
  const ageMs   = Date.now() - sessionCreatedAt.getTime()
  const ageDays = ageMs / (86_400_000)
  const warmup  = ageDays < 3  ? 3.0   // Day 1–3: 3× slower
                : ageDays < 7  ? 2.0   // Day 4–7: 2× slower
                : ageDays < 14 ? 1.5   // Day 8–14: 1.5× slower
                : 1.0                  // Mature session: no penalty

  // ── Risk multiplier ───────────────────────────────────────────────────────
  // Higher risk score means we slow down significantly before WhatsApp bans us
  const riskMultiplier = 1 + riskScore * 4  // 0 risk = 1×, 0.5 risk = 3×, 1.0 risk = 5×

  base = base * warmup * riskMultiplier

  // ── Off-hours multiplier ──────────────────────────────────────────────────
  // Humans send fewer messages between 22:00–06:00 UTC
  const hour = new Date().getUTCHours()
  const offHours = hour >= 22 || hour < 6
  if (offHours) base *= 2.0

  // ── Burst boundary (long rest after N messages) ───────────────────────────
  // Every 5–20 messages we simulate a human "taking a break"
  // contactIndex === burstBoundary means this message starts a new burst
  if (contactIndex > 0 && contactIndex === burstBoundary) {
    const restMs = 20_000 + Math.random() * 30_000  // 20–50s rest between bursts
    base += restMs
    logger.debug('Anti-ban burst pause', { contactIndex, restMs: Math.round(restMs) })
  }

  // ── ±20% jitter ───────────────────────────────────────────────────────────
  // Prevents any detectable uniform pattern in inter-message timing
  const jitter = base * (0.8 + Math.random() * 0.4)

  // Clamp: minimum 3s (human floor), maximum 2 minutes (practical ceiling)
  return Math.max(3_000, Math.min(jitter, 120_000))
}

/** Generate next burst boundary: random 5–20 messages from current index. */
function nextBurstBoundary(currentIndex: number): number {
  return currentIndex + 5 + Math.floor(Math.random() * 15)
}

// ── Orchestrator processor ────────────────────────────────────────────────────

campaignQueue.process(async (job: Job<{ campaignId: string }>) => {
  const { campaignId } = job.data

  const campaign = await prisma.campaign.findUnique({
    where:   { id: campaignId },
    include: {
      campaignContacts: {
        where:   { status: 'PENDING' },
        include: { contact: true },
        orderBy: { id: 'asc' },  // stable order for resumable campaigns
      },
    },
  })

  if (!campaign) {
    logger.error('Campaign not found in orchestrator', { campaignId })
    return
  }

  if (campaign.status === 'PAUSED' || campaign.status === 'COMPLETED') {
    logger.info('Campaign skipped by orchestrator', { campaignId, status: campaign.status })
    return
  }

  if (!campaign.sessionId) {
    throw new Error(`Campaign ${campaignId} has no sessionId`)
  }

  // Load session to compute warmup-aware delays
  const sessionRow = await prisma.whatsAppSession.findFirst({
    where:  { sessionId: campaign.sessionId },
    select: { createdAt: true },
  })
  const sessionCreatedAt = sessionRow?.createdAt ?? new Date()

  // Load current risk score from Redis (0.0 if session not in registry yet)
  const meta      = await getSessionMeta(campaign.sessionId)
  const riskScore = parseFloat(meta?.riskScore ?? '0')

  await prisma.campaign.update({
    where: { id: campaignId },
    data:  { status: 'RUNNING', startedAt: campaign.startedAt ?? new Date() },
  })

  // ── Enqueue one job per contact with staggered delays ────────────────────
  // Delays are pre-computed here so jobs fire at the right time via Bull's
  // delay option — NO sleeping inside the message worker.

  const pending = campaign.campaignContacts
  let cumulativeDelayMs = 0
  let burstBoundary     = nextBurstBoundary(0)  // first rest point

  for (let i = 0; i < pending.length; i++) {
    const cc = pending[i]

    const delayMs = computeDelay({
      message:          campaign.message,
      sessionCreatedAt,
      riskScore,
      contactIndex:     i,
      burstBoundary,
    })
    cumulativeDelayMs += delayMs

    // Update burst boundary after it's passed
    if (i >= burstBoundary) {
      burstBoundary = nextBurstBoundary(i)
    }

    const payload: MessageJobPayload = {
      campaignContactId: cc.id,           // ← Bull jobId = deduplication key
      campaignId,
      userId:    campaign.userId,
      sessionId: campaign.sessionId!,
      phone:     cc.contact.phone,
      message:   campaign.message,
      mediaUrl:  campaign.mediaUrl ?? undefined,
    }

    await messageSendQueue.add(payload, {
      jobId:    `msg:${cc.id}`,          // Bull dedup: same id = not re-enqueued
      delay:    cumulativeDelayMs,        // fire at computed human-time offset
      attempts: 5,
      backoff:  { type: 'exponential', delay: 10_000 },
    })
  }

  logger.info('Campaign orchestrated', {
    campaignId,
    contactCount:      pending.length,
    estimatedDuration: `${Math.round(cumulativeDelayMs / 60_000)}min`,
  })
})

campaignQueue.on('failed', (job, err) => {
  logger.error('Campaign orchestrator job failed', {
    jobId:      job.id,
    campaignId: job.data.campaignId,
    err:        err.message,
  })
})
