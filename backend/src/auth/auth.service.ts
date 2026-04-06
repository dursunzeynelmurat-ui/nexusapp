import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { prisma, workerPrisma } from '../prisma/client'
import { env } from '../utils/env'
import { logger } from '../utils/logger'
import { redis } from '../whatsapp/session.registry'
import { AppError } from '../middleware/errorHandler'
import type { RegisterInput, LoginInput } from './auth.schema'

const BCRYPT_ROUNDS = 12

export interface TokenPair {
  accessToken:  string
  refreshToken: string
}

export interface AuthUser {
  id:    string
  email: string
  name:  string
  role:  string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

function signAccess(userId: string, role: string): string {
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

function signRefresh(tokenId: string, userId: string): string {
  return jwt.sign({ sub: userId, jti: tokenId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  })
}

function refreshExpiresAt(): Date {
  const raw = env.JWT_REFRESH_EXPIRES_IN  // e.g. '7d', '30d', '24h'
  const match = raw.match(/^(\d+)([smhd])$/)
  if (!match) throw new Error(`Invalid JWT_REFRESH_EXPIRES_IN format: ${raw}`)
  const amount = parseInt(match[1], 10)
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
  return new Date(Date.now() + amount * multipliers[match[2]])
}

async function createTokenPair(userId: string, role: string): Promise<TokenPair> {
  const tokenId    = uuidv4()
  const refreshRaw = signRefresh(tokenId, userId)

  await prisma.refreshToken.create({
    data: {
      id:        tokenId,
      token:     refreshRaw,
      userId,
      expiresAt: refreshExpiresAt(),
    },
  })

  return {
    accessToken:  signAccess(userId, role),
    refreshToken: refreshRaw,
  }
}

export async function register(input: RegisterInput): Promise<{ user: AuthUser; tokens: TokenPair }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new AppError(409, 'Email already in use')

  const passwordHash = await hashPassword(input.password)
  const user = await prisma.user.create({
    data: { email: input.email, passwordHash, name: input.name },
  })

  const tokens = await createTokenPair(user.id, user.role)
  logger.info('User registered', { userId: user.id })

  return {
    user:   { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens,
  }
}

export async function login(input: LoginInput): Promise<{ user: AuthUser; tokens: TokenPair }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } })
  if (!user) throw new AppError(401, 'Invalid credentials')

  const valid = await comparePassword(input.password, user.passwordHash)
  if (!valid) throw new AppError(401, 'Invalid credentials')

  const tokens = await createTokenPair(user.id, user.role)
  logger.info('User logged in', { userId: user.id })

  return {
    user:   { id: user.id, email: user.email, name: user.name, role: user.role },
    tokens,
  }
}

export async function refreshTokens(rawToken: string): Promise<TokenPair> {
  let payload: jwt.JwtPayload
  try {
    payload = jwt.verify(rawToken, env.JWT_REFRESH_SECRET) as jwt.JwtPayload
  } catch {
    throw new AppError(401, 'Invalid or expired refresh token')
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: rawToken },
    include: { user: true },
  })
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError(401, 'Refresh token revoked or expired')
  }

  // Rotate: delete old, create new
  await prisma.refreshToken.delete({ where: { id: stored.id } })
  return createTokenPair(stored.userId, stored.user.role)
}

export async function logout(rawToken: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token: rawToken } })
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return null
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

export async function deleteAccount(id: string): Promise<void> {
  // Blacklist the userId so any live JWT for this account is rejected immediately,
  // without waiting for the 15-minute access token expiry window.
  // TTL matches JWT_ACCESS_EXPIRES_IN (15 minutes) — after that the token is
  // expired anyway and the blacklist key is no longer needed.
  const accessTtlSeconds = 15 * 60
  await redis.set(`user:blacklist:${id}`, '1', 'EX', accessTtlSeconds)

  // Single delete — Postgres CASCADE handles all child rows automatically.
  // Uses workerPrisma (nexus_worker role, BYPASSRLS) because this operation
  // crosses all user-owned tables and must not be blocked by RLS policies.
  await workerPrisma.user.delete({ where: { id } })
  logger.info('Account deleted', { userId: id })
}
