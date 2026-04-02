import winston from 'winston'
import { env } from './env'

const { combine, timestamp, errors, json, colorize, simple } = winston.format

export const logger = winston.createLogger({
  level: env.isDev ? 'debug' : 'info',
  format: combine(
    timestamp(),
    errors({ stack: true }),
    json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
})

if (env.isDev) {
  logger.add(
    new winston.transports.Console({
      format: combine(colorize(), simple()),
    })
  )
}

export default logger
