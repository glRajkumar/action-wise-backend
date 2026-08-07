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
import { workspacesRouter, inviteItemsRouter } from './routes/workspaces'
import { connectionsCollectionRouter, connectionItemsRouter } from './routes/connections'
import { resourcesCollectionRouter, resourceItemsRouter, folderItemsRouter } from './routes/resources'
import { playgroundCollectionRouter, playgroundItemsRouter } from './routes/playground'
import { actionsCollectionRouter, actionItemsRouter } from './routes/actions'
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
app.route('/invites', inviteItemsRouter)
app.route('/workspaces', connectionsCollectionRouter)
app.route('/connections', connectionItemsRouter)
app.route('/workspaces', resourcesCollectionRouter)
app.route('/resources', resourceItemsRouter)
app.route('/resource-folders', folderItemsRouter)
app.route('/workspaces', playgroundCollectionRouter)
app.route('/playground', playgroundItemsRouter)
app.route('/workspaces', actionsCollectionRouter)
app.route('/actions', actionItemsRouter)
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