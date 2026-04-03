import path from 'path'
import fs from 'fs'
import P from 'pino'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
  downloadMediaMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { prisma } from '../prisma/client'
import { logger } from '../utils/logger'
import type { Server as SocketServer } from 'socket.io'

type WhatsAppStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'QR_READY'

interface ManagedClient {
  socket:    ReturnType<typeof makeWASocket>
  userId:    string
  sessionId: string
  status:    WhatsAppStatus
  retries:   number
}

const clients = new Map<string, ManagedClient>()
let io: SocketServer | null = null

export function setSocketServer(server: SocketServer): void {
  io = server
}

export function getSocketServer(): SocketServer | null {
  return io
}

function emitToUser(userId: string, event: string, data: unknown): void {
  if (io) {
    io.of('/whatsapp').to(`user:${userId}`).emit(event, data)
  }
}

async function persistStatus(
  sessionId: string,
  status: WhatsAppStatus,
  phone?: string,
  displayName?: string
): Promise<void> {
  await prisma.whatsAppSession.updateMany({
    where: { sessionId },
    data: {
      status,
      ...(phone       ? { phoneNumber: phone } : {}),
      ...(displayName ? { displayName }        : {}),
    },
  })
}

function getSessionDir(sessionId: string): string {
  const dir = path.resolve('./sessions', sessionId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function initSession(userId: string, sessionId: string): Promise<void> {
  if (clients.has(sessionId)) {
    logger.info('Session already initializing or active', { sessionId })
    return
  }

  await prisma.whatsAppSession.upsert({
    where:  { sessionId },
    update: { status: 'CONNECTING' },
    create: { userId, sessionId, status: 'CONNECTING' },
  })

  const sessionDir = getSessionDir(sessionId)
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }) as unknown as ReturnType<typeof P>),
    },
    printQRInTerminal: false,
    logger: P({ level: 'silent' }) as unknown as ReturnType<typeof P>,
    browser: ['NEXUS', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60_000,
    retryRequestDelayMs: 2_000,
  })

  const managed: ManagedClient = { socket: sock, userId, sessionId, status: 'CONNECTING', retries: 0 }
  clients.set(sessionId, managed)

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      managed.status = 'QR_READY'
      await persistStatus(sessionId, 'QR_READY')
      emitToUser(userId, 'qr', { sessionId, qr })
      logger.info('QR code generated', { sessionId })
    }

    if (connection === 'open') {
      managed.status  = 'CONNECTED'
      managed.retries = 0
      const phone       = sock.user?.id?.split(':')[0] ?? sock.user?.id ?? ''
      const displayName = sock.user?.name ?? ''
      await persistStatus(sessionId, 'CONNECTED', phone, displayName)
      emitToUser(userId, 'ready', { sessionId, phoneNumber: phone, displayName })
      logger.info('WhatsApp session ready', { sessionId, phone })
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const loggedOut  = statusCode === DisconnectReason.loggedOut

      managed.status = 'DISCONNECTED'
      await persistStatus(sessionId, 'DISCONNECTED')
      emitToUser(userId, 'disconnected', { sessionId, reason: statusCode })
      logger.warn('WhatsApp session disconnected', { sessionId, statusCode })

      clients.delete(sessionId)

      if (loggedOut) {
        // Remove saved credentials so next init starts fresh
        fs.rmSync(sessionDir, { recursive: true, force: true })
        logger.info('Credentials cleared after logout', { sessionId })
      } else if (managed.retries < 5) {
        // Auto-reconnect with exponential backoff
        const delay = Math.pow(2, managed.retries) * 2000
        managed.retries++
        logger.info(`Reconnecting in ${delay}ms`, { sessionId, attempt: managed.retries })
        setTimeout(() => initSession(userId, sessionId), delay)
      } else {
        logger.warn('Max reconnect retries reached', { sessionId })
        emitToUser(userId, 'disconnected', { sessionId, reason: 'max_retries' })
      }
    }
  })
}

export async function disconnectSession(sessionId: string): Promise<void> {
  const managed = clients.get(sessionId)
  if (managed) {
    try {
      await managed.socket.logout()
    } catch { /* already disconnected */ }
    clients.delete(sessionId)
  }

  // Remove session credentials
  const sessionDir = getSessionDir(sessionId)
  fs.rmSync(sessionDir, { recursive: true, force: true })

  await prisma.whatsAppSession.updateMany({
    where: { sessionId },
    data:  { status: 'DISCONNECTED', encryptedData: null },
  })
}

export async function getUserSessions(userId: string) {
  return prisma.whatsAppSession.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id:          true,
      sessionId:   true,
      status:      true,
      phoneNumber: true,
      displayName: true,
      createdAt:   true,
      updatedAt:   true,
    },
  })
}

export function getClient(sessionId: string): ReturnType<typeof makeWASocket> | null {
  return clients.get(sessionId)?.socket ?? null
}

export async function sendMessage(
  sessionId: string,
  phone: string,
  message: string,
  mediaUrl?: string
): Promise<void> {
  const managed = clients.get(sessionId)
  if (!managed || managed.status !== 'CONNECTED') {
    throw new Error(`Session ${sessionId} is not connected`)
  }

  const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`

  if (mediaUrl) {
    // Fetch media and send as image/video/document
    const response = await fetch(mediaUrl)
    const buffer   = Buffer.from(await response.arrayBuffer())
    const mime     = response.headers.get('content-type') ?? 'application/octet-stream'

    if (mime.startsWith('image/')) {
      await managed.socket.sendMessage(jid, { image: buffer, caption: message })
    } else if (mime.startsWith('video/')) {
      await managed.socket.sendMessage(jid, { video: buffer, caption: message })
    } else {
      await managed.socket.sendMessage(jid, {
        document: buffer,
        mimetype: mime,
        fileName: 'attachment',
        caption:  message,
      })
    }
  } else {
    await managed.socket.sendMessage(jid, { text: message })
  }
}

export async function syncContacts(sessionId: string, userId: string): Promise<number> {
  const managed = clients.get(sessionId)
  if (!managed || managed.status !== 'CONNECTED') {
    throw new Error(`Session ${sessionId} is not connected`)
  }

  let count = 0

  // Baileys exposes contacts via store — get all known chats/contacts
  // We use the onWhatsApp check approach or rely on cached contacts
  // For now read from the session's contact store if available
  const rawContacts = Object.values((managed.socket as unknown as { contacts?: Record<string, { id: string; name?: string; notify?: string }> }).contacts ?? {})

  for (const c of rawContacts) {
    if (!c.id || c.id.endsWith('@g.us') || c.id === 'status@broadcast') continue
    const phone = c.id.split('@')[0]
    const name  = c.name || c.notify || phone

    await prisma.contact.upsert({
      where:  { userId_phone: { userId, phone } },
      update: { name, isGroup: false },
      create: { userId, phone, name, isGroup: false },
    })
    count++
  }

  // Sync groups
  const groups = await managed.socket.groupFetchAllParticipating()
  for (const [jid, meta] of Object.entries(groups)) {
    const phone = jid
    const name  = meta.subject || jid

    await prisma.contact.upsert({
      where:  { userId_phone: { userId, phone } },
      update: { name, isGroup: true },
      create: { userId, phone, name, isGroup: true },
    })
    count++
  }

  logger.info(`Synced ${count} contacts+groups`, { sessionId, userId })
  return count
}

export async function getGroups(sessionId: string): Promise<{ id: string; name: string; participants: number }[]> {
  const managed = clients.get(sessionId)
  if (!managed || managed.status !== 'CONNECTED') {
    throw new Error(`Session ${sessionId} is not connected`)
  }

  const groups = await managed.socket.groupFetchAllParticipating()
  return Object.entries(groups).map(([jid, meta]) => ({
    id:           jid,
    name:         meta.subject,
    participants: meta.participants?.length ?? 0,
  }))
}

export async function publishStatus(
  sessionId: string,
  content: string,
  mediaUrl?: string
): Promise<void> {
  const managed = clients.get(sessionId)
  if (!managed || managed.status !== 'CONNECTED') {
    throw new Error(`Session ${sessionId} is not connected`)
  }

  if (mediaUrl) {
    const response = await fetch(mediaUrl)
    const buffer   = Buffer.from(await response.arrayBuffer())
    const mime     = response.headers.get('content-type') ?? 'image/jpeg'

    if (mime.startsWith('image/')) {
      await managed.socket.sendMessage('status@broadcast', {
        image:   buffer,
        caption: content,
      })
    } else if (mime.startsWith('video/')) {
      await managed.socket.sendMessage('status@broadcast', {
        video:   buffer,
        caption: content,
      })
    }
  } else {
    await managed.socket.sendMessage('status@broadcast', { text: content })
  }
}

/**
 * Called at server startup — re-initializes any sessions that were
 * CONNECTED or QR_READY when the server last shut down.
 */
export async function restoreActiveSessions(): Promise<void> {
  const sessions = await prisma.whatsAppSession.findMany({
    where: { status: { in: ['CONNECTED', 'QR_READY', 'CONNECTING'] } },
  })

  for (const s of sessions) {
    logger.info('Restoring session on startup', { sessionId: s.sessionId })
    // Mark as DISCONNECTED first so the router allows re-init
    await persistStatus(s.sessionId, 'DISCONNECTED')
    initSession(s.userId, s.sessionId).catch((err) =>
      logger.error('Failed to restore session', { sessionId: s.sessionId, err })
    )
  }
}
