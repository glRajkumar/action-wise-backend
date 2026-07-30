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
import { AppError } from './utils/errors'
import { workspacesRouter } from './routes/workspaces'
import { connectionsRouter } from './routes/connections'
import { resourcesRouter } from './routes/resources'
import { playgroundRouter } from './routes/playground'
import { actionsRouter } from './routes/actions'
import { runsRouter } from './routes/runs'

const app = new Hono().basePath("/api")

app.use(logger())
app.use(cors({ origin: env.BETTER_AUTH_URL, credentials: true }))
app.use(secureHeaders())
app.use(compress())

app.get("/health", c => c.json({ status: "ok" }))

app.on(["GET", "POST"], "/auth/*", c => auth.handler(c.req.raw))

app.use(requireAuth)

app.route('/workspaces', workspacesRouter)
app.route('/workspaces', connectionsRouter)
app.route('/workspaces', resourcesRouter)
app.route('/workspaces', playgroundRouter)
app.route('/workspaces', actionsRouter)
app.route('/workspaces', runsRouter)

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.notFound(c => c.json({ message: 'Route not found' }, 404))

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  if (err instanceof AppError) return c.json({ message: err.message }, err.status)
  console.error(err)
  return c.json({ message: "Internal server error" }, 500)
})

serve({ fetch: app.fetch, port: Number(env.PORT || 8000) }, (req) => {
  console.log(`app started at ${req.port}`)
})