import crypto from 'crypto'
import { env } from './env'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES  = 12
const AUTH_TAG_BYTES = 16

function getKey(): Buffer {
  const hex = env.SESSION_ENCRYPTION_KEY
  if (hex.length !== 64) {
    throw new Error('SESSION_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv  = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag   = cipher.getAuthTag()

  // Format: iv(12) + authTag(16) + ciphertext — all as hex
  return Buffer.concat([iv, authTag, encrypted]).toString('hex')
}

export function decrypt(ciphertext: string): string {
  const key  = getKey()
  const data = Buffer.from(ciphertext, 'hex')

  const iv       = data.slice(0, IV_BYTES)
  const authTag  = data.slice(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES)
  const payload  = data.slice(IV_BYTES + AUTH_TAG_BYTES)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')
}
