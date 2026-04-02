import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/auth.middleware'
import { validate } from '../middleware/validate'
import { checkGrammar } from './grammar.service'

export const grammarRouter = Router()
grammarRouter.use(requireAuth)

const checkSchema = z.object({
  text: z.string().min(1).max(10000),
  lang: z.enum(['en', 'tr', 'ar']).default('en'),
})

grammarRouter.post('/check', validate(checkSchema), async (req, res, next) => {
  try {
    const { text, lang } = req.body as { text: string; lang: string }
    const result = await checkGrammar(text, lang)
    res.json(result)
  } catch (err) {
    next(err)
  }
})
