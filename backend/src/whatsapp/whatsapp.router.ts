import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../auth/auth.middleware'
import { rlsMiddleware } from '../middleware/rls'
import {
  initSession,
  disconnectSession,
  getUserSessions,
  syncContacts,
  getGroups,
} from './whatsapp.service'
import { validate } from '../middleware/validate'
import { redis } from './session.registry'

export const whatsappRouter = Router()
whatsappRouter.use(requireAuth)
whatsappRouter.use(rlsMiddleware)

const initSchema = z.object({
  sessionId: z.string().min(1).max(64),
})

const disconnectSchema = z.object({
  sessionId: z.string().min(1),
})

whatsappRouter.post('/init', validate(initSchema), async (req: AuthRequest, res, next) => {
  const userId = req.user!.id
  const lockKey = `session-init-lock:${userId}`

  // Acquire per-user lock (NX = only set if not exists, EX = auto-expire after 15s)
  // Prevents duplicate sessions from concurrent requests racing through the findFirst check.
  const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 15)
  if (!acquired) {
    res.status(429).json({ error: 'Session initialization already in progress, please wait' })
    return
  }

  try {
    const { sessionId } = req.body
    const { prisma } = await import('../prisma/client')

    // Enforce 1-session-per-user limit (inside lock — no TOCTOU window)
    const existing = await prisma.whatsAppSession.findFirst({
      where: { userId, status: { in: ['CONNECTING', 'CONNECTED', 'QR_READY'] } },
    })
    if (existing) {
      res.status(409).json({
        error: 'SESSION_LIMIT_REACHED',
        message: 'You already have an active session. Disconnect it before creating a new one.',
      })
      return
    }

    await initSession(userId, sessionId)
    res.status(202).json({ message: 'Session initialization started', sessionId })
  } catch (err) {
    next(err)
  } finally {
    // Release lock regardless of outcome so the user can retry immediately on error
    await redis.del(lockKey)
  }
})

whatsappRouter.get('/sessions', async (req: AuthRequest, res, next) => {
  try {
    const sessions = await getUserSessions(req.user!.id)
    res.json(sessions)
  } catch (err) {
    next(err)
  }
})

whatsappRouter.post('/disconnect', validate(disconnectSchema), async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id
    const { sessionId } = req.body
    const { prisma } = await import('../prisma/client')
    const session = await prisma.whatsAppSession.findFirst({ where: { sessionId, userId } })
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    await disconnectSession(sessionId)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

whatsappRouter.post('/sync-contacts', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id
    const { sessionId } = req.body as { sessionId: string }
    if (!sessionId) { res.status(400).json({ error: 'sessionId required' }); return }
    const { prisma } = await import('../prisma/client')
    const session = await prisma.whatsAppSession.findFirst({ where: { sessionId, userId } })
    if (!session) { res.status(404).json({ error: 'Session not found' }); return }
    const count = await syncContacts(sessionId, userId)
    res.json({ synced: count })
  } catch (err) {
    next(err)
  }
})

whatsappRouter.get('/groups', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id
    const { sessionId } = req.query as { sessionId?: string }
    if (!sessionId) { res.status(400).json({ error: 'sessionId required' }); return }
    const { prisma } = await import('../prisma/client')
    const session = await prisma.whatsAppSession.findFirst({ where: { sessionId, userId } })
    if (!session) { res.status(404).json({ error: 'Session not found' }); return }
    const groups = await getGroups(sessionId)
    res.json(groups)
  } catch (err) {
    next(err)
  }
})
