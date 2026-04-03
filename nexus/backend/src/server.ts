import http from 'http'
import app from './app'
import { env } from './utils/env'
import { logger } from './utils/logger'
import { prisma } from './prisma/client'
import { createSocketServer } from './socket/socket.server'
import { setSocketServer, restoreActiveSessions } from './whatsapp/whatsapp.service'
import { campaignQueue } from './campaigns/campaign.queue'
import { statusQueue } from './status/status.queue'

async function bootstrap(): Promise<void> {
  // Connect to database
  await prisma.$connect()
  logger.info('Database connected')

  // Create HTTP server
  const httpServer = http.createServer(app)

  // Initialize Socket.IO
  const io = createSocketServer(httpServer)
  setSocketServer(io)

  // Restore any sessions that were active before last shutdown
  await restoreActiveSessions()

  // Ensure Bull queues are listening (processors registered on import)
  logger.info('Campaign queue ready', { name: campaignQueue.name })
  logger.info('Status queue ready',   { name: statusQueue.name })

  // Start server
  httpServer.listen(env.PORT, () => {
    logger.info(`NEXUS backend running on port ${env.PORT}`, {
      env:  env.NODE_ENV,
      port: env.PORT,
    })
  })

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`)
    httpServer.close(async () => {
      await campaignQueue.close()
      await statusQueue.close()
      await prisma.$disconnect()
      logger.info('Server shut down')
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { err })
  process.exit(1)
})
