import { prisma } from '../prisma/client'
import { campaignQueue } from './campaign.queue'
import { logger } from '../utils/logger'
import { checkAndIncrementUserQuota } from '../whatsapp/rate-limit.service'
import { AppError } from '../middleware/errorHandler'

export interface CreateCampaignInput {
  listId:    string
  name:      string
  message:   string
  mediaUrl?: string
  sessionId: string
}

export async function createCampaign(userId: string, input: CreateCampaignInput) {
  const list = await prisma.list.findFirst({
    where:   { id: input.listId, userId },
    include: { contacts: { include: { contact: true } } },
  })
  if (!list) throw new AppError(404, 'List not found')

  const contacts = list.contacts.map((lc) => lc.contact)
  if (contacts.length === 0) throw new AppError(422, 'List has no contacts')

  // Verify the sessionId belongs to this user — prevents using another user's session
  const session = await prisma.whatsAppSession.findFirst({
    where: { sessionId: input.sessionId, userId },
  })
  if (!session) throw new AppError(404, 'Session not found or does not belong to you')
  if (session.status !== 'CONNECTED') {
    throw new AppError(409, `Session is not connected (status: ${session.status})`)
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      listId:     input.listId,
      sessionId:  input.sessionId,
      name:       input.name,
      message:    input.message,
      mediaUrl:   input.mediaUrl,
      totalCount: contacts.length,
      campaignContacts: {
        create: contacts.map((c) => ({ contactId: c.id, status: 'PENDING' as const })),
      },
    },
    include: { campaignContacts: true },
  })

  logger.info('Campaign created', { campaignId: campaign.id, contactCount: contacts.length })
  return campaign
}

export async function startCampaign(campaignId: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
  })
  if (!campaign) throw new AppError(404, 'Campaign not found')
  if (!['DRAFT', 'PAUSED'].includes(campaign.status)) {
    throw new AppError(409, `Campaign cannot be started from status: ${campaign.status}`)
  }

  // Check user's daily quota before allowing campaign launch.
  // Uses 'free' plan default — replace with DB plan lookup when billing is live.
  const quota = await checkAndIncrementUserQuota(userId)
  if (!quota.allowed) {
    throw new AppError(429, 'Daily message quota exceeded. Upgrade your plan or wait until tomorrow.')
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data:  { status: 'QUEUED' },
  })

  // Use campaignId as jobId so re-starting a paused campaign doesn't double-enqueue
  await campaignQueue.add({ campaignId }, { jobId: campaignId })
  logger.info('Campaign queued', { campaignId })
  return { status: 'QUEUED' }
}

export async function pauseCampaign(campaignId: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
  })
  if (!campaign) throw new AppError(404, 'Campaign not found')
  if (campaign.status !== 'RUNNING' && campaign.status !== 'QUEUED') {
    throw new AppError(409, `Campaign cannot be paused from status: ${campaign.status}`)
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data:  { status: 'PAUSED' },
  })

  // Remove from queue if waiting
  const job = await campaignQueue.getJob(campaignId)
  if (job) await job.remove()

  logger.info('Campaign paused', { campaignId })
  return { status: 'PAUSED' }
}

export async function resumeCampaign(campaignId: string, userId: string) {
  return startCampaign(campaignId, userId)
}

export async function getCampaignProgress(campaignId: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({
    where:  { id: campaignId, userId },
    select: {
      id: true, name: true, status: true,
      totalCount: true, sentCount: true, failedCount: true,
      startedAt: true, completedAt: true,
    },
  })
  if (!campaign) throw new AppError(404, 'Campaign not found')
  return campaign
}

export async function getCampaigns(userId: string) {
  return prisma.campaign.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, status: true, message: true,
      totalCount: true, sentCount: true, failedCount: true,
      startedAt: true, completedAt: true, createdAt: true,
      list: { select: { id: true, name: true } },
    },
  })
}

export async function deleteCampaign(campaignId: string, userId: string): Promise<void> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } })
  if (!campaign) throw new AppError(404, 'Campaign not found')
  if (campaign.status === 'RUNNING') throw new AppError(409, 'Cannot delete a running campaign')
  await prisma.campaign.delete({ where: { id: campaignId } })
}
