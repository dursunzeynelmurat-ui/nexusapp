import { Server as SocketServer, type Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'
import type { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import { env } from '../utils/env'
import { logger } from '../utils/logger'

let io: SocketServer | null = null

function authMiddleware(socket: Socket, next: (err?: Error) => void): void {
  const token =
    (socket.handshake.auth?.token as string | undefined) ??
    (socket.handshake.headers?.authorization as string | undefined)?.replace('Bearer ', '')

  if (!token) {
    return next(new Error('Authentication required'))
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload
    socket.data.userId = payload.sub as string
    socket.data.role   = payload.role as string
    next()
  } catch {
    next(new Error('Invalid or expired token'))
  }
}

export async function createSocketServer(httpServer: HttpServer): Promise<SocketServer> {
  io = new SocketServer(httpServer, {
    cors: {
      origin:      env.CORS_ORIGIN.split(','),
      methods:     ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })

  // Redis adapter enables Socket.IO events to propagate across multiple API
  // server instances — required for horizontal scaling
  const pubClient = new Redis(env.REDIS_URL)
  const subClient = new Redis(env.REDIS_URL)
  io.adapter(createAdapter(pubClient, subClient))
  logger.info('Socket.IO Redis adapter connected')

  // ── /whatsapp namespace ────────────────────────────────────────────────────
  const whatsappNs = io.of('/whatsapp')
  whatsappNs.use(authMiddleware)
  whatsappNs.on('connection', (socket) => {
    const userId = socket.data.userId as string
    socket.join(`user:${userId}`)
    logger.info('Socket connected to /whatsapp', { userId, socketId: socket.id })

    socket.on('disconnect', () => {
      logger.info('Socket disconnected from /whatsapp', { userId, socketId: socket.id })
    })
  })

  // ── /campaigns namespace ───────────────────────────────────────────────────
  const campaignNs = io.of('/campaigns')
  campaignNs.use(authMiddleware)
  campaignNs.on('connection', (socket) => {
    const userId = socket.data.userId as string
    logger.info('Socket connected to /campaigns', { userId, socketId: socket.id })

    // Verify ownership before joining room — prevents users from
    // receiving another user's campaign progress events
    socket.on('join', async (campaignId: string) => {
      const { prisma } = await import('../prisma/client')
      const campaign = await prisma.campaign.findFirst({
        where:  { id: campaignId, userId: socket.data.userId },
        select: { id: true },
      })
      if (!campaign) return  // silently reject unauthorized join
      socket.join(`campaign:${campaignId}`)
    })

    socket.on('leave', (campaignId: string) => {
      socket.leave(`campaign:${campaignId}`)
    })

    socket.on('disconnect', () => {
      logger.info('Socket disconnected from /campaigns', { userId, socketId: socket.id })
    })
  })

  // ── /status namespace ──────────────────────────────────────────────────────
  const statusNs = io.of('/status')
  statusNs.use(authMiddleware)
  statusNs.on('connection', (socket) => {
    const userId = socket.data.userId as string
    socket.join(`user:${userId}`)
    logger.info('Socket connected to /status', { userId, socketId: socket.id })

    socket.on('disconnect', () => {
      logger.info('Socket disconnected from /status', { userId, socketId: socket.id })
    })
  })

  logger.info('Socket.IO server initialized')
  return io
}

export function getIO(): SocketServer {
  if (!io) throw new Error('Socket.IO server not initialized')
  return io
}
