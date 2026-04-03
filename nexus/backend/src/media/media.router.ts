import { Router } from 'express'
import { requireAuth, type AuthRequest } from '../auth/auth.middleware'
import { upload } from './upload.middleware'
import { storeFile, deleteFile } from './media.service'

export const mediaRouter = Router()
mediaRouter.use(requireAuth)

mediaRouter.post('/upload', upload.single('file'), async (req: AuthRequest, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' })
      return
    }
    const stored = await storeFile(req.file.path, req.file.originalname, req.file.mimetype)
    res.status(201).json(stored)
  } catch (err) {
    next(err)
  }
})

mediaRouter.delete('/:key(*)', async (req: AuthRequest, res, next) => {
  try {
    const key = req.params.key
    if (!key || /\.\./.test(key) || key.startsWith('/')) {
      res.status(400).json({ error: 'Invalid file key' })
      return
    }
    await deleteFile(key)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
