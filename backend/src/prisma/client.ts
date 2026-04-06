/**
 * prisma/client.ts
 *
 * Two Prisma clients:
 *
 *   `prisma`       — connects as `nexus_app` role (DATABASE_URL).
 *                    Subject to Row Level Security. Used by API routers via
 *                    the `withRls` middleware which sets app.current_user_id.
 *
 *   `workerPrisma` — connects as `nexus_worker` role (DATABASE_WORKER_URL).
 *                    Has BYPASSRLS. Used by Bull queue processors, session
 *                    workers, and any code that operates across multiple users.
 *                    Falls back to DATABASE_URL if WORKER_URL not set (dev only).
 *
 * In production, DATABASE_URL and DATABASE_WORKER_URL must use separate
 * PostgreSQL credentials with the privileges described in the RLS migration.
 */

import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

declare global {
  // eslint-disable-next-line no-var
  var __prisma:       PrismaClient | undefined
  // eslint-disable-next-line no-var
  var __workerPrisma: PrismaClient | undefined
}

function createClient(url?: string): PrismaClient {
  return new PrismaClient({
    datasourceUrl: url,
    log: [
      { level: 'warn',  emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  })
}

// API client — nexus_app role, RLS enforced
export const prisma: PrismaClient =
  global.__prisma ??
  createClient(process.env.DATABASE_URL)

prisma.$on('warn'  as never, (e: unknown) => logger.warn('Prisma warn',  { e }))
prisma.$on('error' as never, (e: unknown) => logger.error('Prisma error', { e }))

// Worker client — nexus_worker role, BYPASSRLS
// Falls back to DATABASE_URL in development (no separate role configured yet)
export const workerPrisma: PrismaClient =
  global.__workerPrisma ??
  createClient(process.env.DATABASE_WORKER_URL ?? process.env.DATABASE_URL)

workerPrisma.$on('warn'  as never, (e: unknown) => logger.warn('WorkerPrisma warn',  { e }))
workerPrisma.$on('error' as never, (e: unknown) => logger.error('WorkerPrisma error', { e }))

if (process.env.NODE_ENV !== 'production') {
  global.__prisma       = prisma
  global.__workerPrisma = workerPrisma
}

export default prisma
