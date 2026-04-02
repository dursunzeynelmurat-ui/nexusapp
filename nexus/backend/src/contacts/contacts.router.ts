import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../auth/auth.middleware'
import { validate } from '../middleware/validate'
import { prisma } from '../prisma/client'

export const contactsRouter = Router()
contactsRouter.use(requireAuth)

const createSchema = z.object({
  phone: z.string().min(7).max(20),
  name:  z.string().min(1).max(200),
  isGroup: z.boolean().optional(),
})

contactsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { search, isGroup, page = '1', limit = '50' } = req.query as Record<string, string>
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const where: Record<string, unknown> = { userId: req.user!.id }
    if (search)  where.name  = { contains: search,   mode: 'insensitive' }
    if (isGroup !== undefined) where.isGroup = isGroup === 'true'

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({ where, skip, take: parseInt(limit), orderBy: { name: 'asc' } }),
      prisma.contact.count({ where }),
    ])

    res.json({ contacts, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) { next(err) }
})

contactsRouter.post('/', validate(createSchema), async (req: AuthRequest, res, next) => {
  try {
    const contact = await prisma.contact.upsert({
      where:  { userId_phone: { userId: req.user!.id, phone: req.body.phone } },
      update: { name: req.body.name },
      create: { userId: req.user!.id, ...req.body },
    })
    res.status(201).json(contact)
  } catch (err) { next(err) }
})

contactsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const contact = await prisma.contact.findFirst({ where: { id: req.params.id, userId: req.user!.id } })
    if (!contact) { res.status(404).json({ error: 'Contact not found' }); return }
    await prisma.contact.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (err) { next(err) }
})
