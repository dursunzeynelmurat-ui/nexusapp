/**
 * rls.ts — Row Level Security middleware
 *
 * Injects `app.current_user_id` as a PostgreSQL session variable at the
 * start of every database transaction for authenticated requests.
 *
 * The RLS policies in migration 20260406000001_row_level_security read this
 * variable via the `current_app_user_id()` function. If it is not set (e.g.,
 * background worker requests), RLS falls through to deny for nexus_app role.
 *
 * Usage in routers:
 *   All routes already use `requireAuth` which populates `req.user`.
 *   This middleware wraps Prisma calls in a transaction that sets the variable
 *   via `prisma.$transaction` with `SET LOCAL`.
 *
 * Implementation strategy:
 *   We attach a `getRlsPrisma(userId)` factory to `res.locals` so each
 *   request gets a Prisma client pre-scoped to the authenticated user.
 *   The factory opens a transaction, runs SET LOCAL, then runs the callback.
 *
 * Why SET LOCAL instead of SET?
 *   SET LOCAL only lasts for the current transaction. This is critical for
 *   connection pooling — the variable resets when the transaction ends so
 *   a recycled connection cannot carry over a previous user's context.
 */

import type { Request, Response, NextFunction } from 'express'
import { prisma } from '../prisma/client'
import type { AuthRequest } from '../auth/auth.middleware'
import type { PrismaClient } from '@prisma/client'

// Type for the scoped Prisma client factory attached to res.locals
export type RlsTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export type WithRls = <T>(
  fn: (tx: RlsTransaction) => Promise<T>
) => Promise<T>

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      withRls: WithRls
    }
  }
}

/**
 * Express middleware. Must be applied AFTER `requireAuth` so `req.user` is set.
 *
 * Attaches `res.locals.withRls` — a function that wraps any Prisma operation
 * in a transaction with `SET LOCAL app.current_user_id = '<userId>'`.
 *
 * Example usage in a router:
 *
 *   router.get('/contacts', requireAuth, rlsMiddleware, async (req, res, next) => {
 *     const contacts = await res.locals.withRls((tx) =>
 *       tx.contact.findMany()   // RLS automatically filters to req.user.id
 *     )
 *     res.json(contacts)
 *   })
 */
export function rlsMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const userId = req.user?.id

  if (!userId) {
    // Not authenticated — withRls will reject all queries (no userId set)
    res.locals.withRls = async <T>(fn: (tx: RlsTransaction) => Promise<T>): Promise<T> => {
      return prisma.$transaction(async (tx) => {
        // Do NOT set app.current_user_id — RLS will deny all row access
        return fn(tx)
      })
    }
    next()
    return
  }

  /**
   * withRls: wraps a Prisma callback in a transaction with the user's ID set.
   * RLS policies use current_app_user_id() which reads this session variable.
   */
  res.locals.withRls = async <T>(fn: (tx: RlsTransaction) => Promise<T>): Promise<T> => {
    return prisma.$transaction(async (tx) => {
      // SET LOCAL: scoped to this transaction only — safe for connection pooling
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, TRUE)`
      return fn(tx)
    })
  }

  next()
}

/**
 * Standalone helper for use outside of Express request context
 * (e.g., in service functions called from routers that already have RLS set).
 * Pass userId explicitly.
 */
export async function withRlsContext<T>(
  userId: string,
  fn: (tx: RlsTransaction) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, TRUE)`
    return fn(tx)
  })
}

/**
 * For background workers (Bull processors, session workers) that use the
 * `nexus_worker` DB role which has BYPASSRLS — they can use prisma directly
 * without this middleware.
 *
 * If a worker needs to act ON BEHALF of a user (e.g., reading user settings),
 * use withRlsContext(userId, ...) explicitly.
 */
