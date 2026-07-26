import 'dotenv/config'

const requiredEnv = (key: string): string => {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

export const env = {
  DATABASE_URL: requiredEnv('DATABASE_URL'),
  REDIS_URL: requiredEnv('REDIS_URL'),

  BETTER_AUTH_SECRET: requiredEnv('BETTER_AUTH_SECRET'),
  BETTER_AUTH_URL: requiredEnv('BETTER_AUTH_URL'),

  EMAIL_ID: requiredEnv('EMAIL_ID'),
  EMAIL_PASS: requiredEnv('EMAIL_PASS'),

  PORT: requiredEnv('PORT'),

} as const
