import rateLimit from 'express-rate-limit'

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      10,
  message:  { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders:   false,
})

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      100,
  message:  { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders:   false,
})

export const campaignStartLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max:      5,
  message:  { error: 'Campaign start limit reached (5/hour), please wait' },
  standardHeaders: true,
  legacyHeaders:   false,
})
