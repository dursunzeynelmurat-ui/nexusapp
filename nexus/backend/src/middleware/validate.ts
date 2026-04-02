import type { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        path:    e.path.join('.'),
        message: e.message,
      }))
      res.status(400).json({ error: 'Validation failed', details: errors })
      return
    }
    req.body = result.data
    next()
  }
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        path:    e.path.join('.'),
        message: e.message,
      }))
      res.status(400).json({ error: 'Query validation failed', details: errors })
      return
    }
    req.query = result.data as Record<string, string>
    next()
  }
}
