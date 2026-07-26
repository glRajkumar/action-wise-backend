import { createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { betterAuth } from "better-auth/minimal"

import { connectRedis, redisClient } from './connect-redis'
import * as schema from '../db/schema/auth'
import { connectDB, db } from "./db"

import { hashPassword, verifyPassword } from "../utils/password"
import { createWorkspaceWithOwner } from "../services/workspaces"
import { env } from '../utils/env'

import {
  sendDeleteAccountVerification,
  sendResetPassword,
  sendVerificationEmail,
  welcomeEmail,
} from '../templates/emails'

try {
  await connectDB()
  await connectRedis()
} catch (error) {
  process.exit(1)
}

export const auth = betterAuth({
  trustedOrigins: [env.BETTER_AUTH_URL],
  database: drizzleAdapter(db, {
    usePlural: true,
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
    sendResetPassword,
  },
  user: {
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification,
    },
  },
  emailVerification: {
    sendVerificationEmail,
  },
  secondaryStorage: {
    get: async (key) => {
      try {
        return await redisClient.get(key)
      } catch {
        return null
      }
    },
    set: async (key, value, ttl) => {
      try {
        if (ttl) await redisClient.set(key, value, { EX: ttl })
        else await redisClient.set(key, value)
      } catch (error) {
        console.error('Redis set failed:', error)
      }
    },
    delete: async (key) => {
      try {
        await redisClient.del(key)
      } catch (error) {
        console.error('Redis delete failed:', error)
      }
    },
  },
  rateLimit: {
    enabled: true,
    max: 50,
    customRules: {
      '/get-session': {
        window: 60,
        max: 100,
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith('/sign-up')) {
        const user = ctx.context.newSession?.user ?? {
          name: ctx.body.name,
          email: ctx.body.email,
        }

        if (user != null) {
          await welcomeEmail(user)
        }

        // Only the real newSession carries a persisted user id (the fallback
        // above is name/email only, used when email verification blocks
        // session creation) — a workspace needs a real FK target.
        const newUser = ctx.context.newSession?.user
        if (newUser != null) {
          await createWorkspaceWithOwner(`${newUser.name}'s Workspace`, newUser.id)
        }
      }
    }),
  },
})
