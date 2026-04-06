/**
 * session.worker.ts
 *
 * Standalone worker process that owns Baileys WebSocket connections.
 * Runs as a SEPARATE process from the Express API (via Docker or PM2).
 * The API and message workers communicate with this process via Redis pub/sub.
 *
 * Responsibilities:
 *   - Own up to MAX_SESSIONS_PER_WORKER Baileys connections
 *   - Register sessions in Redis registry
 *   - Heartbeat every 30s (detect dead workers = orphaned sessions)
 *   - Listen for SEND_MESSAGE, INIT_SESSION, DISCONNECT_SESSION commands on Redis
 *   - Publish QR/ready/disconnected events back to the API via Redis
 *   - Encrypt Baileys credentials before persisting to PostgreSQL
 *
 * Start this file directly: `node dist/whatsapp/session.worker.js`
 * Set WORKER_ID env var to uniquely identify this instance (e.g., "worker-1")
 */

import path from 'path'
import fs from 'fs'
import P from 'pino'
import { encrypt as encryptStr, decrypt as decryptStr } from '../utils/crypto'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import Redis from 'ioredis'
import { workerPrisma as prisma } from '../prisma/client'
import { logger } from '../utils/logger'
import { env } from '../utils/env'
import {
  redis as registryRedis,
  registerSession,
  unregisterSession,
  registerWorker,
  deregisterWorker,
  workerHeartbeat,
  findOrphanedSessions,
  incrementRiskScore,
  resetRiskScore,
  keys,
} from './session.registry'

// ── Worker identity ───────────────────────────────────────────────────────────

const WORKER_ID = process.env.WORKER_ID ?? `worker-${process.pid}`

// Maximum Baileys sockets this worker process will own.
// Each connection uses ~50–100MB RSS. 50 × 75MB = 3.75GB — fits comfortably on 8GB RAM.
const MAX_SESSIONS_PER_WORKER = parseInt(process.env.MAX_SESSIONS ?? '50')

// ── Local session map ─────────────────────────────────────────────────────────
// This Map is local to THIS worker process only.
// The Redis registry makes it globally visible to other processes.

interface ManagedClient {
  socket:    ReturnType<typeof makeWASocket>
  userId:    string
  sessionId: string
  retries:   number
}

const clients = new Map<string, ManagedClient>()

// ── Redis pub/sub channels ────────────────────────────────────────────────────
// Commands arrive on: worker:{WORKER_ID}:commands
// Events published to: nexus:events (all API servers subscribe via Socket.IO adapter)

const subRedis = new Redis(env.REDIS_URL)  // dedicated subscribe connection
const pubRedis = new Redis(env.REDIS_URL)  // dedicated publish connection

const COMMAND_CHANNEL = `worker:${WORKER_ID}:commands`
const EVENT_CHANNEL   = 'nexus:events'

// ── Session credential encryption ────────────────────────────────────────────
// Delegates to utils/crypto.ts (AES-256-GCM) — single implementation shared
// across the codebase instead of duplicating crypto logic here.

function encryptCreds(data: object): string {
  return encryptStr(JSON.stringify(data))
}

function decryptCreds(encoded: string): object {
  return JSON.parse(decryptStr(encoded))
}

// ── Temporary credential directory (in-memory or tmpfs) ──────────────────────

function getTempDir(sessionId: string): string {
  // Use /tmp so credentials never touch the persistent sessions volume
  const dir = path.join('/tmp', 'nexus-sessions', sessionId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cleanTempDir(sessionId: string): void {
  const dir = path.join('/tmp', 'nexus-sessions', sessionId)
  fs.rmSync(dir, { recursive: true, force: true })
}

// ── Persist credentials to PostgreSQL (encrypted) ────────────────────────────

async function persistCreds(sessionId: string, tempDir: string): Promise<void> {
  // Read all files Baileys wrote (creds.json, keys/*.json, etc.)
  const files: Record<string, string> = {}
  const entries = fs.readdirSync(tempDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isFile()) {
      files[entry.name] = fs.readFileSync(path.join(tempDir, entry.name), 'utf8')
    } else if (entry.isDirectory()) {
      const subDir = path.join(tempDir, entry.name)
      for (const sub of fs.readdirSync(subDir)) {
        files[`${entry.name}/${sub}`] = fs.readFileSync(path.join(subDir, sub), 'utf8')
      }
    }
  }

  const encryptedData = encryptCreds(files)
  await prisma.whatsAppSession.updateMany({
    where: { sessionId },
    data:  { encryptedData },
  })
}

/** Load credentials from DB and write to tempDir so Baileys can read them. */
async function loadCreds(sessionId: string, tempDir: string): Promise<boolean> {
  const session = await prisma.whatsAppSession.findFirst({ where: { sessionId } })
  if (!session?.encryptedData) return false  // no saved creds — will show QR

  let files: Record<string, string>
  try {
    files = decryptCreds(session.encryptedData) as Record<string, string>
  } catch {
    logger.warn('Could not decrypt session creds — starting fresh', { sessionId })
    return false
  }

  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(tempDir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf8')
  }
  return true
}

// ── Core: initialize a Baileys session ───────────────────────────────────────

async function initSession(userId: string, sessionId: string): Promise<void> {
  if (clients.has(sessionId)) {
    logger.info('Session already active on this worker', { sessionId })
    return
  }

  if (clients.size >= MAX_SESSIONS_PER_WORKER) {
    // Anti-distributed scaling: reject if at capacity so scheduler picks another worker
    logger.warn('Worker at capacity, rejecting session init', { sessionId, WORKER_ID })
    await pubRedis.publish(EVENT_CHANNEL, JSON.stringify({
      type: 'SESSION_ERROR', userId, sessionId,
      error: 'Worker at capacity',
    }))
    return
  }

  logger.info('Initializing session', { sessionId, WORKER_ID })

  await prisma.whatsAppSession.upsert({
    where:  { sessionId },
    update: { status: 'CONNECTING' },
    create: { userId, sessionId, status: 'CONNECTING' },
  })

  const tempDir = getTempDir(sessionId)
  await loadCreds(sessionId, tempDir)

  const { state, saveCreds } = await useMultiFileAuthState(tempDir)
  const { version }          = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }) as unknown as ReturnType<typeof P>),
    },
    printQRInTerminal: false,
    logger:            P({ level: 'silent' }) as unknown as ReturnType<typeof P>,
    // Browser string must be stable across reconnects (changing it triggers re-ban checks)
    browser:           ['NEXUS', 'Chrome', '120.0.0'],
    syncFullHistory:   false,
    // Anti-ban: don't appear permanently online
    markOnlineOnConnect: false,
    connectTimeoutMs:  60_000,
    retryRequestDelayMs: 2_000,
  })

  const managed: ManagedClient = { socket: sock, userId, sessionId, retries: 0 }
  clients.set(sessionId, managed)

  // Register in Redis registry (visible to all API processes)
  await registerSession(sessionId, {
    userId,
    workerId:  WORKER_ID,
    status:    'CONNECTING',
    phone:     '',
    riskScore: 0,
  })

  // Persist creds every time Baileys updates them (key rotation, session refresh)
  sock.ev.on('creds.update', async () => {
    await saveCreds()
    await persistCreds(sessionId, tempDir)
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      // QR generated — emit to API servers via Redis pub/sub
      // API servers pick this up and forward to the user's Socket.IO connection
      await prisma.whatsAppSession.updateMany({ where: { sessionId }, data: { status: 'QR_READY' } })
      await registerSession(sessionId, { userId, workerId: WORKER_ID, status: 'QR_READY', phone: '', riskScore: 0 })
      await pubRedis.publish(EVENT_CHANNEL, JSON.stringify({ type: 'QR', userId, sessionId, qr }))
      logger.info('QR generated', { sessionId })
    }

    if (connection === 'open') {
      const phone       = sock.user?.id?.split(':')[0] ?? ''
      const displayName = sock.user?.name ?? ''

      managed.retries = 0
      await prisma.whatsAppSession.updateMany({
        where: { sessionId },
        data:  { status: 'CONNECTED', phoneNumber: phone, displayName },
      })
      await registerSession(sessionId, { userId, workerId: WORKER_ID, status: 'CONNECTED', phone, riskScore: 0 })
      // Reset risk score on successful connection
      await resetRiskScore(sessionId)

      await pubRedis.publish(EVENT_CHANNEL, JSON.stringify({
        type: 'READY', userId, sessionId, phoneNumber: phone, displayName,
      }))
      logger.info('Session connected', { sessionId, phone })
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const loggedOut  = statusCode === DisconnectReason.loggedOut

      clients.delete(sessionId)
      cleanTempDir(sessionId)

      await prisma.whatsAppSession.updateMany({ where: { sessionId }, data: { status: 'DISCONNECTED' } })
      await unregisterSession(sessionId, WORKER_ID)

      await pubRedis.publish(EVENT_CHANNEL, JSON.stringify({
        type: 'DISCONNECTED', userId, sessionId, reason: statusCode,
      }))
      logger.warn('Session disconnected', { sessionId, statusCode })

      if (loggedOut) {
        // WhatsApp explicitly logged out — clear credentials, don't auto-reconnect
        await prisma.whatsAppSession.updateMany({
          where: { sessionId },
          data:  { encryptedData: null },
        })
        logger.info('Session logged out, credentials cleared', { sessionId })
        return
      }

      // Exponential backoff reconnect (max 5 attempts)
      if (managed.retries < 5) {
        const delay = Math.pow(2, managed.retries) * 3000
        managed.retries++
        // Increment risk score on unexpected disconnect (could be WhatsApp throttling)
        const newRisk = await incrementRiskScore(sessionId, 0.05)
        logger.info('Auto-reconnecting', { sessionId, attempt: managed.retries, delay, newRisk })
        setTimeout(() => initSession(userId, sessionId), delay)
      } else {
        // Max retries reached — mark risk high and notify user
        await incrementRiskScore(sessionId, 0.3)
        logger.warn('Max reconnect attempts reached', { sessionId })
        await pubRedis.publish(EVENT_CHANNEL, JSON.stringify({
          type: 'SESSION_ERROR', userId, sessionId, error: 'max_retries',
        }))
      }
    }
  })
}

// ── Core: disconnect a session ────────────────────────────────────────────────

async function disconnectSession(sessionId: string): Promise<void> {
  const managed = clients.get(sessionId)
  if (managed) {
    try { await managed.socket.logout() } catch { /* already gone */ }
    clients.delete(sessionId)
    cleanTempDir(sessionId)
  }
  await unregisterSession(sessionId, WORKER_ID)
  await prisma.whatsAppSession.updateMany({
    where: { sessionId },
    data:  { status: 'DISCONNECTED', encryptedData: null },
  })
}

// ── Core: send a message ──────────────────────────────────────────────────────

async function sendMessage(
  sessionId: string,
  phone:     string,
  message:   string,
  mediaUrl?: string
): Promise<void> {
  const managed = clients.get(sessionId)
  if (!managed) throw new Error(`Session ${sessionId} not on this worker`)

  const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`

  // ── Anti-ban: typing + presence simulation ───────────────────────────────
  // Simulate "user is online" before composing
  await managed.socket.sendPresenceUpdate('available', jid)
  await sleep(300 + Math.random() * 700)  // 0.3–1.0s online before typing

  // Show typing indicator for a duration proportional to message length
  // ~50ms per char simulates human typing speed (~200 WPM)
  await managed.socket.sendPresenceUpdate('composing', jid)
  const typingMs = Math.min(message.length * 50, 8000)  // cap at 8s
  await sleep(typingMs + Math.random() * 1000)           // add 0–1s hesitation

  // Pause composing briefly before sending (humans re-read before hitting send)
  await managed.socket.sendPresenceUpdate('paused', jid)
  await sleep(200 + Math.random() * 400)

  if (mediaUrl) {
    const response = await fetch(mediaUrl)
    const buffer   = Buffer.from(await response.arrayBuffer())
    const mime     = response.headers.get('content-type') ?? 'application/octet-stream'

    if (mime.startsWith('image/')) {
      await managed.socket.sendMessage(jid, { image: buffer, caption: message })
    } else if (mime.startsWith('video/')) {
      await managed.socket.sendMessage(jid, { video: buffer, caption: message })
    } else {
      await managed.socket.sendMessage(jid, {
        document: buffer, mimetype: mime, fileName: 'attachment', caption: message,
      })
    }
  } else {
    await managed.socket.sendMessage(jid, { text: message })
  }

  // ── Anti-ban: go back to paused presence after send ──────────────────────
  await managed.socket.sendPresenceUpdate('paused', jid)
}

// ── Core: sync contacts from Baileys to Postgres ──────────────────────────────

async function syncContacts(sessionId: string): Promise<number> {
  const managed = clients.get(sessionId)
  if (!managed) throw new Error(`Session ${sessionId} not on this worker`)

  // Fetch all chats (DMs + groups) from Baileys in-memory store
  // Baileys exposes the contact roster via the underlying store query
  const store = (managed.socket as unknown as { store?: { contacts: Record<string, { id: string; name?: string; notify?: string }> } }).store
  const rawContacts: { id: string; name?: string; notify?: string }[] = store
    ? Object.values(store.contacts)
    : []

  const session = await prisma.whatsAppSession.findFirst({ where: { sessionId }, select: { userId: true } })
  if (!session) throw new Error(`Session ${sessionId} not in DB`)

  const userId = session.userId
  let upserted = 0

  for (const c of rawContacts) {
    if (!c.id) continue
    const isGroup = c.id.endsWith('@g.us')
    const phone   = c.id.split('@')[0]
    const name    = c.name ?? c.notify ?? phone

    await prisma.contact.upsert({
      where:  { userId_phone: { userId, phone: c.id } },
      update: { name, isGroup },
      create: { userId, phone: c.id, name, isGroup },
    })
    upserted++
  }

  logger.info('Contacts synced', { sessionId, count: upserted })
  return upserted
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Redis pub/sub command handler ─────────────────────────────────────────────

interface WorkerCommand {
  type:       'INIT_SESSION' | 'DISCONNECT_SESSION' | 'SEND_MESSAGE' | 'SYNC_CONTACTS'
  sessionId:  string
  userId?:    string
  phone?:     string
  message?:   string
  mediaUrl?:  string
  replyTo?:   string   // Redis key to publish send result to
}

async function handleCommand(raw: string): Promise<void> {
  let cmd: WorkerCommand
  try { cmd = JSON.parse(raw) } catch { return }

  switch (cmd.type) {
    case 'INIT_SESSION':
      await initSession(cmd.userId!, cmd.sessionId)
      break

    case 'DISCONNECT_SESSION':
      await disconnectSession(cmd.sessionId)
      break

    case 'SEND_MESSAGE':
      try {
        await sendMessage(cmd.sessionId, cmd.phone!, cmd.message!, cmd.mediaUrl)
        if (cmd.replyTo) {
          await pubRedis.publish(cmd.replyTo, JSON.stringify({ ok: true }))
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        // Increment risk score on failed send (could be WhatsApp rejection)
        await incrementRiskScore(cmd.sessionId, 0.1)
        logger.warn('Send failed', { sessionId: cmd.sessionId, phone: cmd.phone, err: errMsg })
        if (cmd.replyTo) {
          await pubRedis.publish(cmd.replyTo, JSON.stringify({ ok: false, err: errMsg }))
        }
      }
      break

    case 'SYNC_CONTACTS':
      try {
        const count = await syncContacts(cmd.sessionId)
        if (cmd.replyTo) {
          await pubRedis.publish(cmd.replyTo, JSON.stringify({ ok: true, count }))
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        logger.warn('Contact sync failed', { sessionId: cmd.sessionId, err: errMsg })
        if (cmd.replyTo) {
          await pubRedis.publish(cmd.replyTo, JSON.stringify({ ok: false, err: errMsg }))
        }
      }
      break
  }
}

// ── Worker startup ────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  logger.info('Session worker starting', { WORKER_ID, maxSessions: MAX_SESSIONS_PER_WORKER })

  await registryRedis.connect()
  await registerWorker(WORKER_ID)

  // Find and claim orphaned sessions from dead workers
  const orphans = await findOrphanedSessions()
  for (const sessionId of orphans) {
    logger.info('Claiming orphaned session', { sessionId, WORKER_ID })
    const session = await prisma.whatsAppSession.findFirst({ where: { sessionId } })
    if (session) {
      await initSession(session.userId, sessionId)
    }
  }

  // Subscribe to this worker's command channel
  await subRedis.subscribe(COMMAND_CHANNEL)
  subRedis.on('message', (_channel, message) => {
    handleCommand(message).catch((err) =>
      logger.error('Command handler error', { err: err.message })
    )
  })

  // Heartbeat: refresh session locks every 30s so they don't expire
  setInterval(async () => {
    const ownedSessions = Array.from(clients.keys())
    await workerHeartbeat(WORKER_ID, ownedSessions)
  }, 30_000)

  logger.info('Session worker ready', { WORKER_ID, commandChannel: COMMAND_CHANNEL })
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down session worker`, { WORKER_ID })

  const ownedSessions = Array.from(clients.keys())

  // Disconnect all Baileys sockets cleanly
  for (const [sessionId, managed] of clients.entries()) {
    try { managed.socket.end(undefined) } catch { /* ignore */ }
    cleanTempDir(sessionId)
  }

  await deregisterWorker(WORKER_ID, ownedSessions)
  await subRedis.quit()
  await pubRedis.quit()
  await prisma.$disconnect()
  logger.info('Session worker shut down', { WORKER_ID })
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

start().catch((err) => {
  logger.error('Session worker failed to start', { err: err.message })
  process.exit(1)
})
