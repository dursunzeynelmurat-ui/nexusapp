import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../auth/auth.middleware'
import { rlsMiddleware } from '../middleware/rls'
import { validate } from '../middleware/validate'
import { campaignStartLimiter } from '../middleware/rateLimiter'
import {
  createCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  getCampaignProgress,
  getCampaigns,
  deleteCampaign,
} from './campaign.service'

export const campaignRouter = Router()
campaignRouter.use(requireAuth)
campaignRouter.use(rlsMiddleware)

const createSchema = z.object({
  listId:    z.string().min(1),
  name:      z.string().min(1).max(200),
  message:   z.string().min(1).max(4096),
  mediaUrl:  z.string().url().optional(),
  sessionId: z.string().min(1),
})

campaignRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const campaigns = await getCampaigns(req.user!.id)
    res.json(campaigns)
  } catch (err) { next(err) }
})

campaignRouter.post('/', validate(createSchema), async (req: AuthRequest, res, next) => {
  try {
    const campaign = await createCampaign(req.user!.id, req.body)
    res.status(201).json(campaign)
  } catch (err) { next(err) }
})

campaignRouter.get('/:id/progress', async (req: AuthRequest, res, next) => {
  try {
    const progress = await getCampaignProgress(req.params.id, req.user!.id)
    res.json(progress)
  } catch (err) { next(err) }
})

campaignRouter.post('/:id/start', campaignStartLimiter, async (req: AuthRequest, res, next) => {
  try {
    const result = await startCampaign(req.params.id, req.user!.id)
    res.json(result)
  } catch (err) { next(err) }
})

campaignRouter.post('/:id/pause', async (req: AuthRequest, res, next) => {
  try {
    const result = await pauseCampaign(req.params.id, req.user!.id)
    res.json(result)
  } catch (err) { next(err) }
})

campaignRouter.post('/:id/resume', campaignStartLimiter, async (req: AuthRequest, res, next) => {
  try {
    const result = await resumeCampaign(req.params.id, req.user!.id)
    res.json(result)
  } catch (err) { next(err) }
})

campaignRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    await deleteCampaign(req.params.id, req.user!.id)
    res.status(204).send()
  } catch (err) { next(err) }
})
