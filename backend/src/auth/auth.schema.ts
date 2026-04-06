import { z } from 'zod'

export const registerSchema = z.object({
  email:    z.string().email('Invalid email address'),
  // max 128 to prevent bcrypt DoS (bcrypt silently truncates at 72 bytes)
  password: z.string().min(8, 'Password must be at least 8 characters').max(128, 'Password must be at most 128 characters'),
  name:     z.string().min(1, 'Name is required').max(100),
})

export const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required').max(128, 'Password must be at most 128 characters'),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

export type RegisterInput  = z.infer<typeof registerSchema>
export type LoginInput     = z.infer<typeof loginSchema>
export type RefreshInput   = z.infer<typeof refreshSchema>
