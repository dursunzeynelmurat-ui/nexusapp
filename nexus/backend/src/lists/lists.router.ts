import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../auth/auth.middleware'
import { validate } from '../middleware/validate'
import { prisma } from '../prisma/client'

export const listsRouter = Router()
listsRouter.use(requireAuth)

const createSchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().max(500).optional(),
})

listsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const lists = await prisma.list.findMany({
      where:   { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { contacts: true, campaigns: true } } },
    })
    res.json(lists)
  } catch (err) { next(err) }
})

listsRouter.post('/', validate(createSchema), async (req: AuthRequest, res, next) => {
  try {
    const list = await prisma.list.create({
      data: { userId: req.user!.id, ...req.body },
    })
    res.status(201).json(list)
  } catch (err) { next(err) }
})

listsRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const list = await prisma.list.findFirst({
      where:   { id: req.params.id, userId: req.user!.id },
      include: { contacts: { include: { contact: true } } },
    })
    if (!list) { res.status(404).json({ error: 'List not found' }); return }
    res.json(list)
  } catch (err) { next(err) }
})

listsRouter.patch('/:id', validate(createSchema.partial()), async (req: AuthRequest, res, next) => {
  try {
    const list = await prisma.list.findFirst({ where: { id: req.params.id, userId: req.user!.id } })
    if (!list) { res.status(404).json({ error: 'List not found' }); return }
    const updated = await prisma.list.update({ where: { id: req.params.id }, data: req.body })
    res.json(updated)
  } catch (err) { next(err) }
})

listsRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const list = await prisma.list.findFirst({ where: { id: req.params.id, userId: req.user!.id } })
    if (!list) { res.status(404).json({ error: 'List not found' }); return }
    await prisma.list.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (err) { next(err) }
})

// Member management
listsRouter.post('/:id/contacts', async (req: AuthRequest, res, next) => {
  try {
    const { contactIds } = req.body as { contactIds: string[] }
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      res.status(400).json({ error: 'contactIds array required' }); return
    }
    const list = await prisma.list.findFirst({ where: { id: req.params.id, userId: req.user!.id } })
    if (!list) { res.status(404).json({ error: 'List not found' }); return }

    await prisma.listContact.createMany({
      data:           contactIds.map((contactId) => ({ listId: req.params.id, contactId })),
      skipDuplicates: true,
    })
    res.status(201).json({ added: contactIds.length })
  } catch (err) { next(err) }
})

listsRouter.delete('/:id/contacts/:contactId', async (req: AuthRequest, res, next) => {
  try {
    const list = await prisma.list.findFirst({ where: { id: req.params.id, userId: req.user!.id } })
    if (!list) { res.status(404).json({ error: 'List not found' }); return }
    await prisma.listContact.deleteMany({
      where: { listId: req.params.id, contactId: req.params.contactId },
    })
    res.status(204).send()
  } catch (err) { next(err) }
})
