import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../prisma/client'
import { env } from '../utils/env'
import { logger } from '../utils/logger'
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
  const ms = env.JWT_REFRESH_EXPIRES_IN === '7d' ? 7 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  return new Date(Date.now() + ms)
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
  if (existing) throw new Error('Email already in use')

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
  if (!user) throw new Error('Invalid credentials')

  const valid = await comparePassword(input.password, user.passwordHash)
  if (!valid) throw new Error('Invalid credentials')

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
    throw new Error('Invalid or expired refresh token')
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: rawToken },
    include: { user: true },
  })
  if (!stored || stored.expiresAt < new Date()) {
    throw new Error('Refresh token revoked or expired')
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
  // Cascade: delete refresh tokens, whatsapp sessions, contacts, lists, campaigns, status posts
  await prisma.refreshToken.deleteMany({ where: { userId: id } })
  await prisma.whatsAppSession.deleteMany({ where: { userId: id } })

  // Campaign contacts via campaigns
  const campaigns = await prisma.campaign.findMany({ where: { userId: id }, select: { id: true } })
  const campaignIds = campaigns.map((c) => c.id)
  if (campaignIds.length) {
    await prisma.campaignContact.deleteMany({ where: { campaignId: { in: campaignIds } } })
  }
  await prisma.campaign.deleteMany({ where: { userId: id } })

  // List contacts via lists
  const lists = await prisma.list.findMany({ where: { userId: id }, select: { id: true } })
  const listIds = lists.map((l) => l.id)
  if (listIds.length) {
    await prisma.listContact.deleteMany({ where: { listId: { in: listIds } } })
  }
  await prisma.list.deleteMany({ where: { userId: id } })

  await prisma.contact.deleteMany({ where: { userId: id } })

  // Status schedules via status posts
  const posts = await prisma.statusPost.findMany({ where: { userId: id }, select: { id: true } })
  const postIds = posts.map((p) => p.id)
  if (postIds.length) {
    await prisma.statusSchedule.deleteMany({ where: { postId: { in: postIds } } })
  }
  await prisma.statusPost.deleteMany({ where: { userId: id } })

  await prisma.user.delete({ where: { id } })
  logger.info('Account deleted', { userId: id })
}
