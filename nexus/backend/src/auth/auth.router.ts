import { Router } from 'express'
import { register, login, refreshTokens, logout } from './auth.service'
import { registerSchema, loginSchema, refreshSchema } from './auth.schema'
import { validate } from '../middleware/validate'

export const authRouter = Router()

authRouter.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const result = await register(req.body)
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
})

authRouter.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const result = await login(req.body)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

authRouter.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const tokens = await refreshTokens(req.body.refreshToken)
    res.json(tokens)
  } catch (err) {
    next(err)
  }
})

authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = req.body.refreshToken as string | undefined
    if (token) await logout(token)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
