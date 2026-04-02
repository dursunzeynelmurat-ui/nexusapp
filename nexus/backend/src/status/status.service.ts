import { prisma } from '../prisma/client'
import { statusQueue } from './status.queue'
import { logger } from '../utils/logger'

export interface CreatePostInput {
  content:   string
  mediaUrl?: string
  mediaType?: string
}

export interface CreateScheduleInput {
  postId:           string
  sessionId:        string
  frequency:        'ONCE' | 'DAILY' | 'WEEKLY' | 'CUSTOM_INTERVAL'
  scheduledAt:      Date
  customIntervalMs?: number
}

export async function createPost(userId: string, input: CreatePostInput) {
  const post = await prisma.statusPost.create({
    data: {
      userId,
      content:   input.content,
      mediaUrl:  input.mediaUrl,
      mediaType: input.mediaType,
    },
  })
  logger.info('Status post created', { postId: post.id, userId })
  return post
}

export async function getPosts(userId: string) {
  return prisma.statusPost.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    include: { schedules: true },
  })
}

export async function updatePost(id: string, userId: string, input: Partial<CreatePostInput>) {
  const post = await prisma.statusPost.findFirst({ where: { id, userId } })
  if (!post) throw new Error('Post not found')
  return prisma.statusPost.update({ where: { id }, data: input })
}

export async function deletePost(id: string, userId: string): Promise<void> {
  const post = await prisma.statusPost.findFirst({ where: { id, userId } })
  if (!post) throw new Error('Post not found')
  await prisma.statusPost.delete({ where: { id } })
}

export async function createSchedule(userId: string, input: CreateScheduleInput) {
  const post = await prisma.statusPost.findFirst({ where: { id: input.postId, userId } })
  if (!post) throw new Error('Post not found')

  const schedule = await prisma.statusSchedule.create({
    data: {
      postId:          input.postId,
      sessionId:       input.sessionId,
      frequency:       input.frequency,
      nextRun:         input.scheduledAt,
      customIntervalMs: input.customIntervalMs,
    },
  })

  const delay = Math.max(0, input.scheduledAt.getTime() - Date.now())
  await statusQueue.add(
    { scheduleId: schedule.id },
    { delay, jobId: `schedule-${schedule.id}-${input.scheduledAt.getTime()}` }
  )

  logger.info('Status schedule created', { scheduleId: schedule.id, delay })
  return schedule
}

export async function getSchedules(userId: string) {
  return prisma.statusSchedule.findMany({
    where:   { post: { userId } },
    orderBy: { nextRun: 'asc' },
    include: { post: true },
  })
}

export async function toggleSchedule(id: string, userId: string, isActive: boolean) {
  const schedule = await prisma.statusSchedule.findFirst({
    where:   { id },
    include: { post: true },
  })
  if (!schedule || schedule.post.userId !== userId) throw new Error('Schedule not found')

  return prisma.statusSchedule.update({
    where: { id },
    data:  { isActive },
  })
}

export async function deleteSchedule(id: string, userId: string): Promise<void> {
  const schedule = await prisma.statusSchedule.findFirst({
    where:   { id },
    include: { post: true },
  })
  if (!schedule || schedule.post.userId !== userId) throw new Error('Schedule not found')
  await prisma.statusSchedule.delete({ where: { id } })
}
