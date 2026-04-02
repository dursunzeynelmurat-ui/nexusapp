import fs from 'fs'
import path from 'path'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { env } from '../utils/env'
import { logger } from '../utils/logger'

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
  mimeType: string
): Promise<StoredFile> {
  const ext = path.extname(originalName) || ''
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
  return getProvider().store(localPath, key, mimeType)
}

export async function deleteFile(key: string): Promise<void> {
  return getProvider().delete(key)
}

export function getFileUrl(key: string): string {
  return getProvider().getUrl(key)
}
