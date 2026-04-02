import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../utils/env'
import { getUserById } from './auth.service'

export interface AuthRequest extends Request {
  user?: {
    id:   string
    role: string
  }
}

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
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload
    const user    = await getUserById(payload.sub as string)
    if (!user) {
      res.status(401).json({ error: 'User not found' })
      return
    }
    req.user = { id: user.id, role: user.role }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
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
