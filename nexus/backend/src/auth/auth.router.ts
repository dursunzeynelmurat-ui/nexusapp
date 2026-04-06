/**
 * auth.router.ts
 *
 * Security changes vs original:
 *
 * 1. Refresh token moved from JSON body to httpOnly cookie.
 *    - Cookie is httpOnly (JS cannot read it), Secure (HTTPS only in prod),
 *      SameSite=Strict (no cross-site request forgery).
 *    - Access token still returned in JSON response body — frontend stores
 *      it in Zustand memory ONLY (never localStorage).
 *
 * 2. /refresh reads the token from the cookie instead of req.body.
 *    - Frontend sends the request with credentials: true (cookie auto-attached).
 *    - refreshSchema no longer required for this endpoint.
 *
 * 3. /logout clears the cookie in addition to revoking the token in DB.
 *
 * 4. /register and /login both set the cookie on success.
 */

import { Router, type Request, type Response, type NextFunction } from 'express'
import { register, login, refreshTokens, logout, deleteAccount } from './auth.service'
import { registerSchema, loginSchema } from './auth.schema'
import { validate } from '../middleware/validate'
import { requireAuth, type AuthRequest } from './auth.middleware'
import { env } from '../utils/env'

export const authRouter = Router()

// ── Cookie configuration ───────────────────────────────────────────────────────

const REFRESH_COOKIE = 'refreshToken'

const cookieOptions = {
  httpOnly: true,                          // JS cannot read this cookie
  secure:   env.isProd,                    // HTTPS only in production
  sameSite: 'strict' as const,             // No cross-site requests
  maxAge:   7 * 24 * 60 * 60 * 1000,      // 7 days in ms
  path:     '/api/auth',                   // Only sent to auth endpoints
}

// ── Register ──────────────────────────────────────────────────────────────────

authRouter.post('/register', validate(registerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await register(req.body)
    // Set refresh token in httpOnly cookie — never expose in response body
    res.cookie(REFRESH_COOKIE, result.tokens.refreshToken, cookieOptions)
    // Return access token + user info but NOT the refresh token
    res.status(201).json({
      accessToken: result.tokens.accessToken,
      user:        result.user,
    })
  } catch (err) {
    next(err)
  }
})

// ── Login ─────────────────────────────────────────────────────────────────────

authRouter.post('/login', validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await login(req.body)
    res.cookie(REFRESH_COOKIE, result.tokens.refreshToken, cookieOptions)
    res.json({
      accessToken: result.tokens.accessToken,
      user:        result.user,
    })
  } catch (err) {
    next(err)
  }
})

// ── Refresh ───────────────────────────────────────────────────────────────────
// Reads refresh token from cookie (no body parameter needed).
// Frontend calls this on page load if accessToken is missing from Zustand memory.

authRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined
    if (!rawToken) {
      res.status(401).json({ error: 'No refresh token' })
      return
    }
    const tokens = await refreshTokens(rawToken)
    // Rotate: set new cookie, return new access token
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions)
    res.json({ accessToken: tokens.accessToken })
  } catch (err) {
    next(err)
  }
})

// ── Logout ────────────────────────────────────────────────────────────────────

authRouter.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined
    if (token) await logout(token)
    // Clear the cookie on client
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: 0 })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// ── Delete account ────────────────────────────────────────────────────────────

authRouter.delete('/account', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await deleteAccount(req.user!.id)
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: 0 })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
