import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { compress } from 'hono/compress'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { Hono } from 'hono'

import { requireAuth } from './middlewares/auth'
import { auth } from './lib/auth'
import { env } from './utils/env'

const app = new Hono().basePath("/api")

app.use(logger())
app.use(cors({ origin: env.BETTER_AUTH_URL, credentials: true }))
app.use(secureHeaders())
app.use(compress())

app.get("/health", c => c.json({ status: "ok" }))

app.on(["GET", "POST"], "/auth/*", c => auth.handler(c.req.raw))

app.use(requireAuth)

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.notFound(c => c.json({ message: 'Route not found' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  console.log(err)
  return c.json({ message: err?.message || "Internal sever eror" }, 500)
})

serve({ fetch: app.fetch, port: Number(env.PORT || 8000) }, (req) => {
  console.log(`app started at ${req.port}`)
})