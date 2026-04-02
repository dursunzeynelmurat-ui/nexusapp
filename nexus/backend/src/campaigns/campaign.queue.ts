import Bull from 'bull'
import { env } from '../utils/env'
import { prisma } from '../prisma/client'
import { sendMessage } from '../whatsapp/whatsapp.service'
import { getSocketServer } from '../whatsapp/whatsapp.service'
import { logger } from '../utils/logger'

export const campaignQueue = new Bull<{ campaignId: string }>('campaigns', {
  redis: env.REDIS_URL,
  defaultJobOptions: {
    attempts:    3,
    backoff:     { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail:     false,
  },
})

const MAX_MESSAGES_PER_CAMPAIGN = 200
const MIN_DELAY_MS = 3000
const MAX_DELAY_MS = 8000

function randomDelay(): number {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function emitProgress(campaignId: string, data: unknown): void {
  const io = getSocketServer()
  if (io) {
    io.of('/campaigns').to(`campaign:${campaignId}`).emit('progress', data)
  }
}

campaignQueue.process(async (job) => {
  const { campaignId } = job.data

  const campaign = await prisma.campaign.findUnique({
    where:   { id: campaignId },
    include: {
      campaignContacts: {
        where:   { status: 'PENDING' },
        include: { contact: true },
        take:    MAX_MESSAGES_PER_CAMPAIGN,
      },
    },
  })

  if (!campaign) {
    logger.error('Campaign not found', { campaignId })
    return
  }

  if (campaign.status === 'PAUSED' || campaign.status === 'COMPLETED') {
    logger.info('Campaign skipped (paused or completed)', { campaignId, status: campaign.status })
    return
  }

  const sessionId = campaign.sessionId
  if (!sessionId) {
    throw new Error('Campaign has no associated WhatsApp session')
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data:  { status: 'RUNNING', startedAt: campaign.startedAt ?? new Date() },
  })

  let sentCount   = campaign.sentCount
  let failedCount = campaign.failedCount

  for (const cc of campaign.campaignContacts) {
    // Re-check campaign status (may have been paused mid-run)
    const current = await prisma.campaign.findUnique({
      where:  { id: campaignId },
      select: { status: true },
    })
    if (current?.status === 'PAUSED') {
      logger.info('Campaign paused mid-run', { campaignId })
      break
    }

    try {
      await sendMessage(sessionId, cc.contact.phone, campaign.message, campaign.mediaUrl ?? undefined)
      await prisma.campaignContact.update({
        where: { id: cc.id },
        data:  { status: 'SENT', sentAt: new Date() },
      })
      sentCount++
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await prisma.campaignContact.update({
        where: { id: cc.id },
        data:  { status: 'FAILED', error: errMsg },
      })
      failedCount++
      logger.warn('Message failed', { campaignId, phone: cc.contact.phone, err: errMsg })
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data:  { sentCount, failedCount },
    })

    emitProgress(campaignId, {
      campaignId,
      sentCount,
      failedCount,
      totalCount: campaign.totalCount,
      percent:    Math.round(((sentCount + failedCount) / campaign.totalCount) * 100),
    })

    // Anti-spam delay between messages
    await sleep(randomDelay())
  }

  // Check if all contacts processed
  const remaining = await prisma.campaignContact.count({
    where: { campaignId, status: 'PENDING' },
  })

  if (remaining === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data:  { status: 'COMPLETED', completedAt: new Date() },
    })
    const io = getSocketServer()
    if (io) {
      io.of('/campaigns').to(`campaign:${campaignId}`).emit('complete', {
        campaignId,
        sentCount,
        failedCount,
        totalCount: campaign.totalCount,
      })
    }
    logger.info('Campaign completed', { campaignId, sentCount, failedCount })
  }
})

campaignQueue.on('failed', (job, err) => {
  logger.error('Campaign job failed', { jobId: job.id, campaignId: job.data.campaignId, err: err.message })
})
