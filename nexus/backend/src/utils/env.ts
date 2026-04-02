import 'dotenv/config'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

function optionalEnv(key: string, fallback = ''): string {
  return process.env[key] ?? fallback
}

export const env = {
  NODE_ENV:              optionalEnv('NODE_ENV', 'development'),
  PORT:                  parseInt(optionalEnv('PORT', '3000'), 10),

  DATABASE_URL:          requireEnv('DATABASE_URL'),
  REDIS_URL:             optionalEnv('REDIS_URL', 'redis://localhost:6379'),

  JWT_SECRET:            requireEnv('JWT_SECRET'),
  JWT_REFRESH_SECRET:    requireEnv('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: optionalEnv('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN:optionalEnv('JWT_REFRESH_EXPIRES_IN', '7d'),

  SESSION_ENCRYPTION_KEY: requireEnv('SESSION_ENCRYPTION_KEY'),

  AWS_ACCESS_KEY_ID:     optionalEnv('AWS_ACCESS_KEY_ID'),
  AWS_SECRET_ACCESS_KEY: optionalEnv('AWS_SECRET_ACCESS_KEY'),
  AWS_REGION:            optionalEnv('AWS_REGION', 'us-east-1'),
  AWS_S3_BUCKET:         optionalEnv('AWS_S3_BUCKET'),

  STORAGE_PROVIDER:      optionalEnv('STORAGE_PROVIDER', 'local') as 'local' | 's3',
  LOCAL_UPLOAD_DIR:      optionalEnv('LOCAL_UPLOAD_DIR', './uploads'),

  CORS_ORIGIN:           optionalEnv('CORS_ORIGIN', 'http://localhost:5173'),
  FRONTEND_URL:          optionalEnv('FRONTEND_URL', 'http://localhost:5173'),

  get isDev()  { return this.NODE_ENV === 'development' },
  get isProd() { return this.NODE_ENV === 'production' },
} as const
