import type { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message })
    return
  }

  // Known user-facing errors (service layer throws plain Error)
  const knownMessages = [
    'Email already in use',
    'Invalid credentials',
    'Invalid or expired refresh token',
    'Refresh token revoked or expired',
    'User not found',
  ]
  if (knownMessages.includes(err.message)) {
    res.status(400).json({ error: err.message })
    return
  }

  logger.error('Unhandled error', {
    message: err.message,
    stack:   err.stack,
    url:     req.url,
    method:  req.method,
  })

  res.status(500).json({ error: 'Internal server error' })
}
