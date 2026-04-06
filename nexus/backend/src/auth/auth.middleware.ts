import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../utils/env'
import { redis } from '../whatsapp/session.registry'

export interface AuthRequest extends Request {
  user?: {
    id:   string
    role: string
  }
}

/**
 * requireAuth — verifies the Bearer JWT and populates req.user.
 *
 * JWT claims contain `sub` (userId) and `role` — both signed at token issue
 * time and tamper-proof. We trust them directly instead of hitting Postgres
 * on every request (the old pattern was one DB round-trip per API call).
 *
 * Deleted/suspended users: checked via a Redis blacklist key set at account
 * deletion or suspension. A single Redis GET is <1ms vs a DB query.
 *
 * Key `user:blacklist:{userId}` is set by deleteAccount (auth.service.ts)
 * with TTL = JWT access token lifetime (15 minutes). After that window the
 * token has expired anyway so the key is no longer needed.
 */
export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No authorization token provided' })
    return
  }

  const token = authHeader.slice(7)
  let payload: jwt.JwtPayload

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  const userId = payload.sub as string
  const role   = payload.role as string

  // Fast blacklist check (deleted/suspended accounts)
  const blacklisted = await redis.get(`user:blacklist:${userId}`)
  if (blacklisted) {
    res.status(401).json({ error: 'Account no longer active' })
    return
  }

  req.user = { id: userId, role }
  next()
}

export function requireRole(role: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }
    next()
  }
}
