import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { env } from '../utils/env'
import { logger } from '../utils/logger'
import { workerPrisma } from '../prisma/client'
import { AppError } from '../middleware/errorHandler'

export interface StoredFile {
  key:      string
  url:      string
  mimeType: string
  size:     number
}

interface IStorageProvider {
  store(localPath: string, key: string, mimeType: string): Promise<StoredFile>
  delete(key: string): Promise<void>
  getUrl(key: string): string
}

class LocalStorage implements IStorageProvider {
  private readonly dir: string

  constructor() {
    this.dir = path.resolve(env.LOCAL_UPLOAD_DIR)
    fs.mkdirSync(this.dir, { recursive: true })
  }

  async store(localPath: string, key: string, mimeType: string): Promise<StoredFile> {
    const dest = path.join(this.dir, key)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.renameSync(localPath, dest)
    const { size } = fs.statSync(dest)
    return { key, url: this.getUrl(key), mimeType, size }
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.dir, key)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }

  getUrl(key: string): string {
    return `/uploads/${key}`
  }
}

class S3Storage implements IStorageProvider {
  private readonly client: S3Client
  private readonly bucket: string

  constructor() {
    this.bucket = env.AWS_S3_BUCKET
    this.client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId:     env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    })
  }

  async store(localPath: string, key: string, mimeType: string): Promise<StoredFile> {
    const fileStream = fs.createReadStream(localPath)
    const { size }   = fs.statSync(localPath)

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket:      this.bucket,
        Key:         key,
        Body:        fileStream,
        ContentType: mimeType,
      },
    })

    await upload.done()
    fs.unlinkSync(localPath) // clean up tmp
    return { key, url: this.getUrl(key), mimeType, size }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  getUrl(key: string): string {
    return `https://${this.bucket}.s3.${env.AWS_REGION}.amazonaws.com/${key}`
  }
}

let provider: IStorageProvider | null = null

function getProvider(): IStorageProvider {
  if (!provider) {
    provider = env.STORAGE_PROVIDER === 's3' ? new S3Storage() : new LocalStorage()
    logger.info(`Storage provider: ${env.STORAGE_PROVIDER}`)
  }
  return provider
}

export async function storeFile(
  localPath: string,
  originalName: string,
  mimeType: string,
  userId: string,
): Promise<StoredFile> {
  const ext = path.extname(originalName) || ''
  // Use CSPRNG — Date.now() + Math.random() was predictable and guessable
  const key = `${randomBytes(16).toString('hex')}${ext}`
  const stored = await getProvider().store(localPath, key, mimeType)

  // Record ownership so delete can verify the requesting user owns this file
  await workerPrisma.mediaFile.create({
    data: { id: randomBytes(8).toString('hex'), userId, key: stored.key, url: stored.url, mimeType, size: stored.size },
  })

  return stored
}

export async function deleteFile(key: string, userId: string): Promise<void> {
  // Verify ownership before deleting — prevents any user from deleting anyone's file
  const record = await workerPrisma.mediaFile.findUnique({ where: { key } })
  if (!record) throw new AppError(404, 'File not found')
  if (record.userId !== userId) throw new AppError(403, 'Forbidden')

  await getProvider().delete(key)
  await workerPrisma.mediaFile.delete({ where: { key } })
}

export function getFileUrl(key: string): string {
  return getProvider().getUrl(key)
}
