import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../auth/auth.middleware'
import {
  initSession,
  disconnectSession,
  getUserSessions,
  syncContacts,
  getGroups,
} from './whatsapp.service'
import { validate } from '../middleware/validate'

export const whatsappRouter = Router()
whatsappRouter.use(requireAuth)

const initSchema = z.object({
  sessionId: z.string().min(1).max(64),
})

const disconnectSchema = z.object({
  sessionId: z.string().min(1),
})

whatsappRouter.post('/init', validate(initSchema), async (req: AuthRequest, res, next) => {
  try {
    const { sessionId } = req.body
    await initSession(req.user!.id, sessionId)
    res.status(202).json({ message: 'Session initialization started', sessionId })
  } catch (err) {
    next(err)
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
    const { sessionId } = req.body
    await disconnectSession(sessionId)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

whatsappRouter.post('/sync-contacts', async (req: AuthRequest, res, next) => {
  try {
    const { sessionId } = req.body as { sessionId: string }
    if (!sessionId) { res.status(400).json({ error: 'sessionId required' }); return }
    const count = await syncContacts(sessionId, req.user!.id)
    res.json({ synced: count })
  } catch (err) {
    next(err)
  }
})

whatsappRouter.get('/groups', async (req: AuthRequest, res, next) => {
  try {
    const { sessionId } = req.query as { sessionId?: string }
    if (!sessionId) { res.status(400).json({ error: 'sessionId required' }); return }
    const groups = await getGroups(sessionId)
    res.json(groups)
  } catch (err) {
    next(err)
  }
})
