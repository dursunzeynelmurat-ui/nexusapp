/**
 * rate-limit.service.ts
 *
 * Redis-based rate limiting for:
 *   1. Per-session hourly and daily message limits (anti-ban warmup schedule)
 *   2. Per-user daily message quota (SaaS plan enforcement)
 *
 * All counters use Redis INCR with TTL so they auto-expire — no cleanup needed.
 *
 * Warmup schedule (session age → limits):
 *   Day 1–3  : 20/day,  5/hour
 *   Day 4–7  : 50/day, 10/hour
 *   Day 8–14 : 100/day, 20/hour
 *   Day 15–30: 200/day, 40/hour
 *   Day 30+  : 500/day, 80/hour
 */

import { redis, keys } from './session.registry'
import { logger } from '../utils/logger'

// ── Warmup schedule ───────────────────────────────────────────────────────────

interface WarmupTier {
  maxAgeDays: number   // upper bound (exclusive). Use Infinity for "30+ days"
  dailyLimit: number
  hourlyLimit: number
}

// Tiers ordered ascending by maxAgeDays
const WARMUP_TIERS: WarmupTier[] = [
  { maxAgeDays: 3,        dailyLimit: 20,  hourlyLimit: 5  },
  { maxAgeDays: 7,        dailyLimit: 50,  hourlyLimit: 10 },
  { maxAgeDays: 14,       dailyLimit: 100, hourlyLimit: 20 },
  { maxAgeDays: 30,       dailyLimit: 200, hourlyLimit: 40 },
  { maxAgeDays: Infinity, dailyLimit: 500, hourlyLimit: 80 },
]

/** Return daily and hourly limits for a session based on its age. */
export function getWarmupLimits(sessionCreatedAt: Date): { daily: number; hourly: number } {
  const ageMs   = Date.now() - sessionCreatedAt.getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)

  for (const tier of WARMUP_TIERS) {
    if (ageDays < tier.maxAgeDays) {
      return { daily: tier.dailyLimit, hourly: tier.hourlyLimit }
    }
  }

  // Should never reach here (Infinity tier catches everything)
  return { daily: 500, hourly: 80 }
}

// ── Session rate checking ─────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed:          boolean
  reason?:          'HOURLY_LIMIT' | 'DAILY_LIMIT' | 'USER_QUOTA' | 'HIGH_RISK'
  retryAfterMs?:    number
}

/**
 * Check and increment session send counters.
 * Returns { allowed: false } if any limit is exceeded.
 * Increments the counter only if allowed (no phantom increments).
 */
export async function checkAndIncrementSessionLimits(
  sessionId:        string,
  sessionCreatedAt: Date,
  riskScore:        number
): Promise<RateLimitResult> {
  // Anti-ban: refuse to send if session risk is too high
  if (riskScore >= 0.9) {
    return { allowed: false, reason: 'HIGH_RISK' }
  }

  const { daily: dailyLimit, hourly: hourlyLimit } = getWarmupLimits(sessionCreatedAt)

  const hourKey  = keys.hourlyRate(sessionId)
  const dayKey   = keys.dailyRate(sessionId)

  // Read current counts atomically
  const [rawHourly, rawDaily] = await redis.mget(hourKey, dayKey)
  const hourlyCount = parseInt(rawHourly ?? '0')
  const dailyCount  = parseInt(rawDaily  ?? '0')

  if (hourlyCount >= hourlyLimit) {
    // Calculate ms until the current hour ends
    const now          = new Date()
    const msUntilHour  = (60 - now.getMinutes()) * 60_000 - now.getSeconds() * 1000
    logger.warn('Session hourly limit reached', { sessionId, hourlyCount, hourlyLimit })
    return { allowed: false, reason: 'HOURLY_LIMIT', retryAfterMs: msUntilHour }
  }

  if (dailyCount >= dailyLimit) {
    const now          = new Date()
    const msUntilDay   = (24 - now.getHours()) * 3_600_000 - now.getMinutes() * 60_000
    logger.warn('Session daily limit reached', { sessionId, dailyCount, dailyLimit })
    return { allowed: false, reason: 'DAILY_LIMIT', retryAfterMs: msUntilDay }
  }

  // All checks passed — atomically increment both counters
  const pipe = redis.pipeline()
  pipe.incr(hourKey).expire(hourKey, 3600)
  pipe.incr(dayKey).expire(dayKey,  86400)
  await pipe.exec()

  return { allowed: true }
}

// ── User quota checking ───────────────────────────────────────────────────────

// Default limits per plan (replace with DB plan lookup when billing is implemented)
const PLAN_DAILY_LIMITS: Record<string, number> = {
  free:     50,
  starter:  500,
  pro:      5_000,
  business: 50_000,
}

/**
 * Check and increment per-user daily message quota.
 * Plan defaults to 'free' until subscription system is implemented.
 */
export async function checkAndIncrementUserQuota(
  userId: string,
  plan = 'free'
): Promise<RateLimitResult> {
  const dailyLimit = PLAN_DAILY_LIMITS[plan] ?? PLAN_DAILY_LIMITS.free
  const quotaKey   = keys.userDailyQuota(userId)

  // INCR + check pattern (atomic — no TOCTOU race)
  const count = await redis.incr(quotaKey)
  if (count === 1) {
    // First use today — set TTL to end of UTC day
    const now        = new Date()
    const secondsLeft= (24 - now.getUTCHours()) * 3600 - now.getUTCMinutes() * 60
    await redis.expire(quotaKey, secondsLeft)
  }

  if (count > dailyLimit) {
    // Over limit — decrement to undo (don't phantom-count)
    await redis.decr(quotaKey)
    const now         = new Date()
    const msUntilDay  = ((24 - now.getUTCHours()) * 3600 - now.getUTCMinutes() * 60) * 1000
    return { allowed: false, reason: 'USER_QUOTA', retryAfterMs: msUntilDay }
  }

  return { allowed: true }
}

// ── Campaign counter batching ────────────────────────────────────────────────

/** Increment in-Redis campaign sent counter (not written to DB yet). */
export async function incrementCampaignSent(campaignId: string): Promise<number> {
  return redis.incr(keys.campaignSent(campaignId))
}

/** Increment in-Redis campaign failed counter. */
export async function incrementCampaignFailed(campaignId: string): Promise<number> {
  return redis.incr(keys.campaignFailed(campaignId))
}

/**
 * Read current in-memory campaign counters.
 * Used by the counter-flush job to persist to PostgreSQL.
 */
export async function getCampaignCounters(
  campaignId: string
): Promise<{ sent: number; failed: number }> {
  const [rawSent, rawFailed] = await redis.mget(
    keys.campaignSent(campaignId),
    keys.campaignFailed(campaignId)
  )
  return {
    sent:   parseInt(rawSent   ?? '0'),
    failed: parseInt(rawFailed ?? '0'),
  }
}

/** Delete Redis counters after they've been flushed to DB. */
export async function clearCampaignCounters(campaignId: string): Promise<void> {
  await redis.del(keys.campaignSent(campaignId), keys.campaignFailed(campaignId))
}
