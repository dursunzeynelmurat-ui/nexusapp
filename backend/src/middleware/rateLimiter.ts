import rateLimit from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import { redis } from '../whatsapp/session.registry'

// Shared Redis store — rate limit state survives restarts and is shared
// across all API server processes (required for horizontal scaling).
// Without this, each container has its own counter and the effective limit
// is max × number_of_containers.
function makeRedisStore(prefix: string) {
  return new RedisStore({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendCommand: (...args: string[]) => (redis as any).call(...args),
    prefix: `rl:${prefix}:`,
  })
}

export const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  store:           makeRedisStore('auth'),
  message:         { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders:   false,
})

export const apiLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             100,
  store:           makeRedisStore('api'),
  message:         { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders:   false,
})

export const campaignStartLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             5,
  store:           makeRedisStore('campaign-start'),
  message:         { error: 'Campaign start limit reached (5/hour), please wait' },
  standardHeaders: true,
  legacyHeaders:   false,
})
