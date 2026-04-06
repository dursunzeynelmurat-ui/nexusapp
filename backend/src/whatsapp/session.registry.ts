/**
 * session.registry.ts
 *
 * Redis-backed session registry. Replaces the in-memory `clients` Map in
 * whatsapp.service.ts so session state is visible to all API processes and
 * worker processes without sharing memory.
 *
 * Key schema:
 *   session:{sessionId}:meta   → Hash  { userId, workerId, status, phone, riskScore }
 *   session:{sessionId}:lock   → String (workerId that owns this session, TTL 35s)
 *   worker:{workerId}:sessions → Set   of sessionIds owned by that worker
 *   worker:{workerId}:alive    → String (heartbeat, TTL 35s)
 *   session:{sessionId}:hourly:{hour}  → Integer counter (expires end of hour)
 *   session:{sessionId}:daily:{day}   → Integer counter (expires end of day)
 */

import Redis from 'ioredis'
import { env } from '../utils/env'
import { logger } from '../utils/logger'

// Singleton Redis client used only by the registry (not Bull)
export const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 })

redis.on('error', (err) => logger.error('Redis registry error', { err: err.message }))

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionMeta {
  userId:    string
  workerId:  string
  status:    'CONNECTING' | 'QR_READY' | 'CONNECTED' | 'DISCONNECTED'
  phone:     string
  riskScore: string  // stored as string in Redis hash, parse with parseFloat()
}

// ── Key helpers ───────────────────────────────────────────────────────────────

export const keys = {
  sessionMeta:   (sessionId: string) => `session:${sessionId}:meta`,
  sessionLock:   (sessionId: string) => `session:${sessionId}:lock`,
  workerSessions:(workerId: string)  => `worker:${workerId}:sessions`,
  workerAlive:   (workerId: string)  => `worker:${workerId}:alive`,
  hourlyRate:    (sessionId: string) => {
    const h = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '')
    return `rate:session:${sessionId}:hourly:${h}`
  },
  dailyRate:     (sessionId: string) => {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return `rate:session:${sessionId}:daily:${d}`
  },
  userDailyQuota:(userId: string) => {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return `quota:user:${userId}:daily:${d}`
  },
  // Campaign-level counters (flushed to DB every 30s by campaign.queue.ts)
  campaignSent:  (campaignId: string) => `campaign:${campaignId}:sent`,
  campaignFailed:(campaignId: string) => `campaign:${campaignId}:failed`,
}

// ── Session registration ──────────────────────────────────────────────────────

/**
 * Register or update a session in Redis when a worker takes ownership.
 * Called from session.worker.ts when Baileys connects or the status changes.
 */
export async function registerSession(
  sessionId: string,
  meta: Omit<SessionMeta, 'riskScore'> & { riskScore?: number }
): Promise<void> {
  const metaKey  = keys.sessionMeta(sessionId)
  const lockKey  = keys.sessionLock(sessionId)
  const workerKey= keys.workerSessions(meta.workerId)

  const pipeline = redis.pipeline()
  pipeline.hset(metaKey, {
    userId:    meta.userId,
    workerId:  meta.workerId,
    status:    meta.status,
    phone:     meta.phone ?? '',
    riskScore: String(meta.riskScore ?? 0),
  })
  // TTL 90s — worker must heartbeat every 30s, detect staleness after 3 missed beats
  pipeline.expire(metaKey, 90)
  // Lock key tells routing layer which worker owns this session
  pipeline.set(lockKey, meta.workerId, 'EX', 90)
  // Track sessions owned by this worker (for orphan detection)
  pipeline.sadd(workerKey, sessionId)
  await pipeline.exec()
}

/**
 * Called from session.worker.ts heartbeat. Refreshes TTL on all session keys
 * so they don't expire while the worker is alive.
 */
export async function refreshSessionLock(sessionId: string, workerId: string): Promise<void> {
  const pipeline = redis.pipeline()
  pipeline.expire(keys.sessionMeta(sessionId),  90)
  pipeline.set(keys.sessionLock(sessionId), workerId, 'EX', 90)
  await pipeline.exec()
}

/**
 * Remove a session from the registry (called on logout or permanent disconnect).
 */
export async function unregisterSession(sessionId: string, workerId: string): Promise<void> {
  const pipeline = redis.pipeline()
  pipeline.del(keys.sessionMeta(sessionId))
  pipeline.del(keys.sessionLock(sessionId))
  pipeline.srem(keys.workerSessions(workerId), sessionId)
  await pipeline.exec()
}

/** Read session metadata without modifying it. */
export async function getSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const raw = await redis.hgetall(keys.sessionMeta(sessionId))
  if (!raw || !raw.userId) return null
  return raw as unknown as SessionMeta
}

/** True if session is currently CONNECTED in the registry. */
export async function isSessionConnected(sessionId: string): Promise<boolean> {
  const status = await redis.hget(keys.sessionMeta(sessionId), 'status')
  return status === 'CONNECTED'
}

// ── Worker lifecycle ──────────────────────────────────────────────────────────

/** Worker registers itself on startup. */
export async function registerWorker(workerId: string): Promise<void> {
  await redis.sadd('workers:active', workerId)
  await redis.set(keys.workerAlive(workerId), '1', 'EX', 90)
  logger.info('Worker registered', { workerId })
}

/** Heartbeat — call every 30 seconds from session.worker.ts. */
export async function workerHeartbeat(
  workerId: string,
  ownedSessionIds: string[]
): Promise<void> {
  const pipeline = redis.pipeline()
  pipeline.set(keys.workerAlive(workerId), '1', 'EX', 90)
  // Refresh locks for all owned sessions
  for (const sid of ownedSessionIds) {
    pipeline.expire(keys.sessionMeta(sid), 90)
    pipeline.set(keys.sessionLock(sid), workerId, 'EX', 90)
  }
  await pipeline.exec()
}

/** Deregister a worker on graceful shutdown. */
export async function deregisterWorker(
  workerId: string,
  ownedSessionIds: string[]
): Promise<void> {
  const pipeline = redis.pipeline()
  pipeline.srem('workers:active', workerId)
  pipeline.del(keys.workerAlive(workerId))
  pipeline.del(keys.workerSessions(workerId))
  for (const sid of ownedSessionIds) {
    pipeline.del(keys.sessionMeta(sid))
    pipeline.del(keys.sessionLock(sid))
  }
  await pipeline.exec()
  logger.info('Worker deregistered', { workerId })
}

/**
 * Find sessions owned by workers that are no longer alive (heartbeat expired).
 * Called from new workers on startup and periodically from a maintenance job.
 */
export async function findOrphanedSessions(): Promise<string[]> {
  const allWorkers = await redis.smembers('workers:active')
  const orphaned: string[] = []

  for (const workerId of allWorkers) {
    const alive = await redis.get(keys.workerAlive(workerId))
    if (!alive) {
      // Worker is dead — its sessions are orphaned
      const sessions = await redis.smembers(keys.workerSessions(workerId))
      orphaned.push(...sessions)
      // Clean up dead worker entry
      await redis.pipeline()
        .srem('workers:active', workerId)
        .del(keys.workerSessions(workerId))
        .exec()
      logger.warn('Orphaned worker detected', { workerId, orphanedSessions: sessions.length })
    }
  }

  return orphaned
}

/**
 * Find the worker with the fewest sessions (for session assignment).
 * Returns null if no workers are available or all are at capacity.
 */
export async function findAvailableWorker(maxPerWorker = 50): Promise<string | null> {
  const workers = await redis.smembers('workers:active')
  let bestWorker: string | null = null
  let minLoad = Infinity

  for (const workerId of workers) {
    const alive = await redis.get(keys.workerAlive(workerId))
    if (!alive) continue  // Skip dead workers

    const count = await redis.scard(keys.workerSessions(workerId))
    if (count < maxPerWorker && count < minLoad) {
      minLoad    = count
      bestWorker = workerId
    }
  }

  return bestWorker
}

// ── Risk score management ─────────────────────────────────────────────────────

/** Increment session risk score. Returns new risk score (0.0–1.0). */
export async function incrementRiskScore(sessionId: string, delta: number): Promise<number> {
  const raw    = await redis.hget(keys.sessionMeta(sessionId), 'riskScore')
  const current= parseFloat(raw ?? '0')
  const updated= Math.min(1.0, current + delta)
  await redis.hset(keys.sessionMeta(sessionId), 'riskScore', String(updated))
  return updated
}

/** Reset risk score (e.g., after successful reconnect). */
export async function resetRiskScore(sessionId: string): Promise<void> {
  await redis.hset(keys.sessionMeta(sessionId), 'riskScore', '0')
}
