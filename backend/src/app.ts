import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import path from 'path'
import { env } from './utils/env'
import { apiLimiter, authLimiter } from './middleware/rateLimiter'
import { errorHandler } from './middleware/errorHandler'
import { authRouter }      from './auth/auth.router'
import { whatsappRouter }  from './whatsapp/whatsapp.router'
import { contactsRouter }  from './contacts/contacts.router'
import { listsRouter }     from './lists/lists.router'
import { campaignRouter }  from './campaigns/campaign.router'
import { statusRouter }    from './status/status.router'
import { grammarRouter }   from './grammar/grammar.router'
import { mediaRouter }     from './media/media.router'

const app = express()

// Trust nginx reverse proxy
app.set('trust proxy', 1)

// ── Security ───────────────────────────────────────────────────────────────
app.use(helmet())
app.use(cors({
  origin:      env.CORS_ORIGIN.split(',').map((o) => o.trim()),
  credentials: true,
}))

// ── Body parsing + cookies ────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))
app.use(cookieParser())  // Required for httpOnly refresh token cookie

// ── Static uploads (local storage) ────────────────────────────────────────
app.use('/uploads', express.static(path.resolve(env.LOCAL_UPLOAD_DIR)))

// ── Rate limiting ──────────────────────────────────────────────────────────
app.use('/api/', apiLimiter)
app.use('/api/auth/', authLimiter)

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRouter)
app.use('/api/whatsapp',  whatsappRouter)
app.use('/api/contacts',  contactsRouter)
app.use('/api/lists',     listsRouter)
app.use('/api/campaigns', campaignRouter)
app.use('/api/status',    statusRouter)
app.use('/api/grammar',   grammarRouter)
app.use('/api/media',     mediaRouter)

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Error handler ──────────────────────────────────────────────────────────
app.use(errorHandler)

export default app
