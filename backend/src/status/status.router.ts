import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../auth/auth.middleware'
import { rlsMiddleware } from '../middleware/rls'
import { validate } from '../middleware/validate'
import {
  createPost, getPosts, updatePost, deletePost,
  createSchedule, getSchedules, toggleSchedule, deleteSchedule,
} from './status.service'

export const statusRouter = Router()
statusRouter.use(requireAuth)
statusRouter.use(rlsMiddleware)

const postSchema = z.object({
  content:   z.string().min(1).max(700),
  mediaUrl:  z.string().url().optional(),
  mediaType: z.string().optional(),
})

const scheduleSchema = z.object({
  postId:           z.string().min(1),
  sessionId:        z.string().min(1),
  frequency:        z.enum(['ONCE', 'DAILY', 'WEEKLY', 'CUSTOM_INTERVAL']),
  scheduledAt:      z.string().datetime(),
  // Minimum 1 hour (3_600_000 ms) to prevent spammy schedules
  customIntervalMs: z.number().int().min(3_600_000, 'Minimum interval is 1 hour').optional(),
}).refine(
  (d) => d.frequency !== 'CUSTOM_INTERVAL' || d.customIntervalMs !== undefined,
  { message: 'customIntervalMs is required for CUSTOM_INTERVAL frequency', path: ['customIntervalMs'] }
)

// Posts
statusRouter.get('/posts', async (req: AuthRequest, res, next) => {
  try { res.json(await getPosts(req.user!.id)) } catch (err) { next(err) }
})

statusRouter.post('/posts', validate(postSchema), async (req: AuthRequest, res, next) => {
  try {
    const post = await createPost(req.user!.id, req.body)
    res.status(201).json(post)
  } catch (err) { next(err) }
})

statusRouter.patch('/posts/:id', validate(postSchema.partial()), async (req: AuthRequest, res, next) => {
  try {
    const post = await updatePost(req.params.id, req.user!.id, req.body)
    res.json(post)
  } catch (err) { next(err) }
})

statusRouter.delete('/posts/:id', async (req: AuthRequest, res, next) => {
  try {
    await deletePost(req.params.id, req.user!.id)
    res.status(204).send()
  } catch (err) { next(err) }
})

// Schedules
statusRouter.get('/schedules', async (req: AuthRequest, res, next) => {
  try { res.json(await getSchedules(req.user!.id)) } catch (err) { next(err) }
})

statusRouter.post('/schedules', validate(scheduleSchema), async (req: AuthRequest, res, next) => {
  try {
    const schedule = await createSchedule(req.user!.id, {
      ...req.body,
      scheduledAt: new Date(req.body.scheduledAt),
    })
    res.status(201).json(schedule)
  } catch (err) { next(err) }
})

statusRouter.patch('/schedules/:id/toggle', async (req: AuthRequest, res, next) => {
  try {
    const { isActive } = req.body as { isActive: boolean }
    const schedule = await toggleSchedule(req.params.id, req.user!.id, isActive)
    res.json(schedule)
  } catch (err) { next(err) }
})

statusRouter.delete('/schedules/:id', async (req: AuthRequest, res, next) => {
  try {
    await deleteSchedule(req.params.id, req.user!.id)
    res.status(204).send()
  } catch (err) { next(err) }
})
