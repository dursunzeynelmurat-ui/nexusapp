import Bull from 'bull'
import { env } from '../utils/env'
import { prisma } from '../prisma/client'
import { publishStatus } from '../whatsapp/whatsapp.service'
import { getSocketServer } from '../whatsapp/whatsapp.service'
import { logger } from '../utils/logger'

export const statusQueue = new Bull<{ scheduleId: string }>('status', {
  redis: env.REDIS_URL,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail:     false,
  },
})

function computeNextRun(frequency: string, customIntervalMs?: number | null): Date {
  const now = Date.now()
  switch (frequency) {
    case 'DAILY':           return new Date(now + 24 * 60 * 60 * 1000)
    case 'WEEKLY':          return new Date(now + 7 * 24 * 60 * 60 * 1000)
    case 'CUSTOM_INTERVAL': return new Date(now + (customIntervalMs ?? 60 * 60 * 1000))
    default:                return new Date(now + 9999 * 24 * 60 * 60 * 1000) // ONCE — far future
  }
}

statusQueue.process(async (job) => {
  const { scheduleId } = job.data

  const schedule = await prisma.statusSchedule.findUnique({
    where:   { id: scheduleId },
    include: { post: true },
  })

  if (!schedule || !schedule.isActive) {
    logger.info('Status schedule inactive or not found', { scheduleId })
    return
  }

  const io = getSocketServer()

  try {
    await publishStatus(schedule.sessionId, schedule.post.content, schedule.post.mediaUrl ?? undefined)

    const nextRun = computeNextRun(schedule.frequency, schedule.customIntervalMs)
    const isOnce  = schedule.frequency === 'ONCE'

    await prisma.statusSchedule.update({
      where: { id: scheduleId },
      data:  {
        lastRun:  new Date(),
        nextRun,
        isActive: !isOnce,
      },
    })

    if (!isOnce) {
      const delay = nextRun.getTime() - Date.now()
      await statusQueue.add({ scheduleId }, { delay, jobId: `schedule-${scheduleId}-${nextRun.getTime()}` })
    }

    if (io) {
      io.of('/status').emit('published', { scheduleId, postId: schedule.postId })
    }
    logger.info('Status published', { scheduleId, postId: schedule.postId })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logger.error('Status publish failed', { scheduleId, err: errMsg })
    if (io) {
      io.of('/status').emit('failed', { scheduleId, error: errMsg })
    }
    throw err
  }
})

statusQueue.on('failed', (job, err) => {
  logger.error('Status job failed', { jobId: job.id, scheduleId: job.data.scheduleId, err: err.message })
})
