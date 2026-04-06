/**
 * whatsapp.service.ts
 *
 * API-facing WhatsApp service. In the distributed architecture this file
 * runs in the API process — it does NOT hold Baileys connections directly.
 *
 * Session workers (session.worker.ts) own the Baileys sockets.
 * This file routes commands to them via Redis pub/sub and reads state
 * from the Redis session registry.
 *
 * What changed from the old in-memory Map design:
 *   - No `clients` Map — sessions live in Redis registry
 *   - No `useMultiFileAuthState` — workers handle credentials
 *   - `initSession` publishes INIT_SESSION command to best available worker
 *   - `sendMessage` routes via RPC to the owning worker
 *   - `restoreActiveSessions` assigns sessions to workers on startup
 */

import Redis from 'ioredis'
import { workerPrisma as prisma } from '../prisma/client'
import { logger } from '../utils/logger'
import { env } from '../utils/env'
import type { Server as SocketServer } from 'socket.io'
import {
  redis,
  registerSession,
  unregisterSession,
  findAvailableWorker,
  getSessionMeta,
  keys,
} from './session.registry'
import { AppError } from '../middleware/errorHandler'

// ── Redis clients for pub/sub ─────────────────────────────────────────────────

const pubRedis = new Redis(env.REDIS_URL, { lazyConnect: true })
const subRedis = new Redis(env.REDIS_URL, { lazyConnect: true })

const EVENT_CHANNEL = 'nexus:events'

// ── Socket.IO reference (set by server.ts) ────────────────────────────────────

let io: SocketServer | null = null

export function setSocketServer(server: SocketServer): void {
  io = server
  // Subscribe to the global event channel published by session workers.
  // All API server instances run this subscription — Socket.IO redis-adapter
  // ensures events reach the right client even if on a different API server.
  subRedis.connect().then(() => {
    subRedis.subscribe(EVENT_CHANNEL)
    subRedis.on('message', (_channel, raw) => handleWorkerEvent(raw))
    logger.info('API server subscribed to session event channel')
  }).catch((err) => logger.error('Event channel subscribe failed', { err: err.message }))
}

export function getSocketServer(): SocketServer | null {
  return io
}

// ── Route session worker events to Socket.IO ──────────────────────────────────

interface WorkerEvent {
  type:         string
  userId:       string
  sessionId:    string
  qr?:          string
  phoneNumber?: string
  displayName?: string
  reason?:      string | number
  error?:       string
  // Campaign progress events
  campaignId?:  string
  sentCount?:   number
  failedCount?: number
  totalCount?:  number
  percent?:     number
}

function handleWorkerEvent(raw: string): void {
  if (!io) return
  let event: WorkerEvent
  try { event = JSON.parse(raw) } catch { return }

  switch (event.type) {
    case 'QR':
      io.of('/whatsapp').to(`user:${event.userId}`).emit('qr', {
        sessionId: event.sessionId, qr: event.qr,
      })
      break

    case 'READY':
      io.of('/whatsapp').to(`user:${event.userId}`).emit('ready', {
        sessionId:   event.sessionId,
        phoneNumber: event.phoneNumber,
        displayName: event.displayName,
      })
      break

    case 'DISCONNECTED':
    case 'SESSION_ERROR':
      io.of('/whatsapp').to(`user:${event.userId}`).emit('disconnected', {
        sessionId: event.sessionId,
        reason:    event.reason ?? event.error,
      })
      break

    case 'CAMPAIGN_PROGRESS':
      io.of('/campaigns').to(`campaign:${event.campaignId}`).emit('progress', {
        campaignId:  event.campaignId,
        sentCount:   event.sentCount,
        failedCount: event.failedCount,
        totalCount:  event.totalCount,
        percent:     event.percent,
      })
      break

    case 'CAMPAIGN_COMPLETE':
      io.of('/campaigns').to(`campaign:${event.campaignId}`).emit('complete', {
        campaignId:  event.campaignId,
        sentCount:   event.sentCount,
        failedCount: event.failedCount,
      })
      break
  }
}

// ── Public API functions (called by routers) ──────────────────────────────────

/**
 * Initialize a WhatsApp session.
 * Finds the least-loaded session worker and sends it an INIT_SESSION command.
 */
export async function initSession(userId: string, sessionId: string): Promise<void> {
  const workerId = await findAvailableWorker()
  if (!workerId) {
    throw new AppError(503, 'No session workers available. Please try again shortly.')
  }

  await prisma.whatsAppSession.upsert({
    where:  { sessionId },
    update: { status: 'CONNECTING' },
    create: { userId, sessionId, status: 'CONNECTING' },
  })

  // Tell the selected worker to init this session
  await pubRedis.connect().catch(() => {})
  await pubRedis.publish(`worker:${workerId}:commands`, JSON.stringify({
    type: 'INIT_SESSION', userId, sessionId,
  }))

  logger.info('Session init dispatched to worker', { sessionId, workerId })
}

/**
 * Disconnect a session.
 * Routes to the owning worker if known; also clears DB state.
 */
export async function disconnectSession(sessionId: string): Promise<void> {
  const meta = await getSessionMeta(sessionId)
  if (meta?.workerId) {
    await pubRedis.connect().catch(() => {})
    await pubRedis.publish(`worker:${meta.workerId}:commands`, JSON.stringify({
      type: 'DISCONNECT_SESSION', sessionId,
    }))
  }

  // Also clear DB state immediately (worker will confirm via event)
  await prisma.whatsAppSession.updateMany({
    where: { sessionId },
    data:  { status: 'DISCONNECTED', encryptedData: null },
  })
}

/** Return all sessions for a user (from DB — source of truth). */
export async function getUserSessions(userId: string) {
  return prisma.whatsAppSession.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, sessionId: true, status: true,
      phoneNumber: true, displayName: true,
      createdAt: true, updatedAt: true,
    },
  })
}

/**
 * Send a single message via the owning session worker.
 * Used by campaign processors — not called directly from routers.
 */
export async function sendMessage(
  sessionId: string,
  phone:     string,
  message:   string,
  mediaUrl?: string
): Promise<void> {
  const meta = await getSessionMeta(sessionId)
  if (!meta || meta.status !== 'CONNECTED') {
    throw new AppError(409, `Session ${sessionId} is not connected`)
  }

  await pubRedis.connect().catch(() => {})
  await pubRedis.publish(`worker:${meta.workerId}:commands`, JSON.stringify({
    type: 'SEND_MESSAGE', sessionId, phone, message, mediaUrl,
    // No replyTo — fire-and-forget from this context
    // message.queue.ts uses its own RPC pattern with replyTo for reliability
  }))
}

/** Sync contacts — sends SYNC_CONTACTS command to the owning session worker. */
export async function syncContacts(sessionId: string, userId: string): Promise<number> {
  const meta = await getSessionMeta(sessionId)
  if (!meta || meta.status !== 'CONNECTED') {
    throw new AppError(409, `Session ${sessionId} is not connected`)
  }

  // RPC: publish command, wait for reply on a one-shot Redis key
  const replyTo = `sync-contacts-reply:${sessionId}:${Date.now()}`
  await pubRedis.connect().catch(() => {})
  await pubRedis.publish(`worker:${meta.workerId}:commands`, JSON.stringify({
    type: 'SYNC_CONTACTS', sessionId, replyTo,
  }))

  // Wait up to 30s for the worker to finish syncing
  const subClient = new Redis(env.REDIS_URL)
  return new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      subClient.disconnect()
      reject(new AppError(504, 'Contact sync timed out'))
    }, 30_000)

    subClient.subscribe(replyTo, (err) => {
      if (err) { clearTimeout(timeout); subClient.disconnect(); reject(err) }
    })
    subClient.on('message', (_ch, msg) => {
      clearTimeout(timeout)
      subClient.disconnect()
      try {
        const result = JSON.parse(msg) as { ok: boolean; count?: number; err?: string }
        if (result.ok) resolve(result.count ?? 0)
        else reject(new AppError(500, result.err ?? 'Sync failed'))
      } catch {
        reject(new AppError(500, 'Invalid sync response'))
      }
    })
  })
}

/** Get groups — reads from DB contacts (synced by worker). */
export async function getGroups(
  sessionId: string
): Promise<{ id: string; name: string; participants: number }[]> {
  const session = await prisma.whatsAppSession.findFirst({
    where: { sessionId }, select: { userId: true },
  })
  if (!session) throw new AppError(404, 'Session not found')

  const groups = await prisma.contact.findMany({
    where: { userId: session.userId, isGroup: true },
    orderBy: { name: 'asc' },
    select: { phone: true, name: true },
  })

  return groups.map((g) => ({ id: g.phone, name: g.name, participants: 0 }))
}

/**
 * Called at API server startup. Ensures sessions that were CONNECTED or
 * CONNECTING before the last shutdown get re-initialized by a worker.
 *
 * Marks them DISCONNECTED first so the router's session-limit check doesn't
 * block re-init (the check in whatsapp.router.ts:30 rejects CONNECTING/CONNECTED).
 */
export async function restoreActiveSessions(): Promise<void> {
  const sessions = await prisma.whatsAppSession.findMany({
    where: { status: { in: ['CONNECTED', 'QR_READY', 'CONNECTING'] } },
  })

  for (const s of sessions) {
    logger.info('Restoring session on startup', { sessionId: s.sessionId })
    await prisma.whatsAppSession.update({
      where: { id: s.id },
      data:  { status: 'DISCONNECTED' },
    })
    initSession(s.userId, s.sessionId).catch((err) =>
      logger.error('Failed to restore session', { sessionId: s.sessionId, err: err.message })
    )
  }
}

/** Publish a WhatsApp status (forwarded to session worker). */
export async function publishStatus(
  sessionId: string,
  content:   string,
  mediaUrl?: string
): Promise<void> {
  const meta = await getSessionMeta(sessionId)
  if (!meta || meta.status !== 'CONNECTED') {
    throw new AppError(409, `Session ${sessionId} is not connected`)
  }

  await pubRedis.connect().catch(() => {})
  await pubRedis.publish(`worker:${meta.workerId}:commands`, JSON.stringify({
    type: 'PUBLISH_STATUS', sessionId, content, mediaUrl,
  }))
}
