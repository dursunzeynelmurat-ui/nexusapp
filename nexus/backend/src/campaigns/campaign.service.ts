import { prisma } from '../prisma/client'
import { campaignQueue } from './campaign.queue'
import { logger } from '../utils/logger'

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
  if (!list) throw new Error('List not found')

  const contacts = list.contacts.map((lc) => lc.contact)
  if (contacts.length === 0) throw new Error('List has no contacts')

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
  if (!campaign) throw new Error('Campaign not found')
  if (!['DRAFT', 'PAUSED'].includes(campaign.status)) {
    throw new Error(`Campaign cannot be started from status: ${campaign.status}`)
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data:  { status: 'QUEUED' },
  })

  await campaignQueue.add({ campaignId }, { jobId: campaignId })
  logger.info('Campaign queued', { campaignId })
  return { status: 'QUEUED' }
}

export async function pauseCampaign(campaignId: string, userId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
  })
  if (!campaign) throw new Error('Campaign not found')
  if (campaign.status !== 'RUNNING' && campaign.status !== 'QUEUED') {
    throw new Error(`Campaign cannot be paused from status: ${campaign.status}`)
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
  if (!campaign) throw new Error('Campaign not found')
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
  if (!campaign) throw new Error('Campaign not found')
  if (campaign.status === 'RUNNING') throw new Error('Cannot delete a running campaign')
  await prisma.campaign.delete({ where: { id: campaignId } })
}
