import multer from 'multer'
import path from 'path'
import os from 'os'
import type { Request } from 'express'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/3gpp',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const MAX_FILE_SIZE = 16 * 1024 * 1024 // 16 MB

export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename:    (_req, file, cb) => {
      const ext  = path.extname(file.originalname)
      const name = `nexus-upload-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
      cb(null, name)
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req: Request, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`))
    }
  },
})
