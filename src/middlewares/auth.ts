import { createMiddleware } from "hono/factory"
import { auth } from "../lib/auth"
import type { AppEnv } from "../types/hono"

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ message: "Unauthorized" }, 401)
  c.set("userId", session.user.id)
  c.set("userEmail", session.user.email)
  await next()
})
