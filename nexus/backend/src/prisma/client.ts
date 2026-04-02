import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: [
      { level: 'warn',  emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  })

prisma.$on('warn' as never,  (e: unknown) => logger.warn('Prisma warn',  { e }))
prisma.$on('error' as never, (e: unknown) => logger.error('Prisma error', { e }))

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}

export default prisma
