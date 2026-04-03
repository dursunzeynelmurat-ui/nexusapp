import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js'
import { prisma } from '../prisma/client'
import { encrypt, decrypt } from '../utils/crypto'
import { logger } from '../utils/logger'
import type { Server as SocketServer } from 'socket.io'

type WhatsAppStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'QR_READY'

interface ManagedClient {
  client:    Client
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

async function persistStatus(sessionId: string, status: WhatsAppStatus, phone?: string, displayName?: string): Promise<void> {
  await prisma.whatsAppSession.updateMany({
    where: { sessionId },
    data:  {
      status,
      ...(phone       ? { phoneNumber: phone } : {}),
      ...(displayName ? { displayName }        : {}),
    },
  })
}

async function scheduleReconnect(managed: ManagedClient, sessionId: string): Promise<void> {
  if (managed.retries >= 5) {
    logger.warn('Max reconnect retries reached', { sessionId })
    await persistStatus(sessionId, 'DISCONNECTED')
    emitToUser(managed.userId, 'disconnected', { sessionId, reason: 'max_retries' })
    clients.delete(sessionId)
    return
  }

  const delay = Math.pow(2, managed.retries) * 2000 // 2s, 4s, 8s, 16s, 32s
  managed.retries++
  logger.info(`Reconnecting in ${delay}ms`, { sessionId, attempt: managed.retries })

  setTimeout(async () => {
    try {
      await managed.client.initialize()
    } catch (err) {
      logger.error('Reconnect failed', { sessionId, err })
      await scheduleReconnect(managed, sessionId)
    }
  }, delay)
}

export async function initSession(userId: string, sessionId: string): Promise<void> {
  if (clients.has(sessionId)) {
    logger.info('Session already initializing or active', { sessionId })
    return
  }

  // Ensure DB record exists
  await prisma.whatsAppSession.upsert({
    where:  { sessionId },
    update: { status: 'CONNECTING' },
    create: { userId, sessionId, status: 'CONNECTING' },
  })

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionId, dataPath: './sessions' }),
    puppeteer: {
      headless:  true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    },
  })

  const managed: ManagedClient = { client, userId, sessionId, status: 'CONNECTING', retries: 0 }
  clients.set(sessionId, managed)

  client.on('qr', (qr) => {
    managed.status = 'QR_READY'
    persistStatus(sessionId, 'QR_READY').catch(() => {})
    emitToUser(userId, 'qr', { sessionId, qr })
    logger.info('QR code generated', { sessionId })
  })

  client.on('ready', async () => {
    managed.status  = 'CONNECTED'
    managed.retries = 0
    const info = client.info
    await persistStatus(sessionId, 'CONNECTED', info?.wid?.user, info?.pushname)
    emitToUser(userId, 'ready', {
      sessionId,
      phoneNumber: info?.wid?.user,
      displayName: info?.pushname,
    })
    logger.info('WhatsApp session ready', { sessionId, phone: info?.wid?.user })
  })

  client.on('disconnected', async (reason) => {
    managed.status = 'DISCONNECTED'
    await persistStatus(sessionId, 'DISCONNECTED')
    emitToUser(userId, 'disconnected', { sessionId, reason })
    logger.warn('WhatsApp session disconnected', { sessionId, reason })
    await scheduleReconnect(managed, sessionId)
  })

  client.on('auth_failure', (msg) => {
    logger.error('Auth failure', { sessionId, msg })
    emitToUser(userId, 'auth_failure', { sessionId, message: msg })
  })

  try {
    await client.initialize()
  } catch (err) {
    logger.error('Failed to initialize WhatsApp client', { sessionId, err })
    clients.delete(sessionId)
    await persistStatus(sessionId, 'DISCONNECTED')
    throw err
  }
}

export async function disconnectSession(sessionId: string): Promise<void> {
  const managed = clients.get(sessionId)
  if (managed) {
    try {
      await managed.client.logout()
    } catch { /* already disconnected */ }
    clients.delete(sessionId)
  }
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

export function getClient(sessionId: string): Client | null {
  return clients.get(sessionId)?.client ?? null
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

  const chatId = phone.includes('@') ? phone : `${phone}@c.us`

  if (mediaUrl) {
    const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true })
    await managed.client.sendMessage(chatId, media, { caption: message })
  } else {
    await managed.client.sendMessage(chatId, message)
  }
}

export async function syncContacts(sessionId: string, userId: string): Promise<number> {
  const managed = clients.get(sessionId)
  if (!managed || managed.status !== 'CONNECTED') {
    throw new Error(`Session ${sessionId} is not connected`)
  }

  let count = 0

  // Sync individual contacts
  const contacts = await managed.client.getContacts()
  for (const c of contacts) {
    if (!c.number || c.isMe) continue
    const phone = c.number
    const name  = c.name || c.pushname || phone

    await prisma.contact.upsert({
      where:  { userId_phone: { userId, phone } },
      update: { name, isGroup: false },
      create: { userId, phone, name, isGroup: false },
    })
    count++
  }

  // Sync groups separately via getChats()
  const chats = await managed.client.getChats()
  for (const chat of chats) {
    if (!chat.isGroup) continue
    const phone = chat.id._serialized
    const name  = chat.name || phone

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

  const chats = await managed.client.getChats()
  return chats
    .filter((c) => c.isGroup)
    .map((c) => ({
      id:           c.id._serialized,
      name:         c.name,
      participants: (c as unknown as { participants?: unknown[] }).participants?.length ?? 0,
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
    const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true })
    await managed.client.setStatus(content)
    // Note: whatsapp-web.js status with media uses sendMessage to status broadcast
    await managed.client.sendMessage('status@broadcast', media, { caption: content })
  } else {
    await managed.client.setStatus(content)
    await managed.client.sendMessage('status@broadcast', content)
  }
}
