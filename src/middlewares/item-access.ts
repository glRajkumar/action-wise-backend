import { createMiddleware } from "hono/factory"

import { AppError } from "../utils/errors"
import { assertWorkspaceAccess, type WorkspaceAction } from "../utils/permissions"
import type { AppEnv } from "../types/hono"

export function requireItemAccess<Row extends { workspaceId: string }, K extends keyof AppEnv["Variables"]>(
  paramName: string,
  contextKey: K,
  loadRow: (id: string, userId: string) => Promise<Row>,
  action: WorkspaceAction,
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const id = c.req.param(paramName)
    if (!id) throw new AppError("Not found", 404)
    const userId = c.get("userId")
    const row = await loadRow(id, userId)
    await assertWorkspaceAccess(userId, row.workspaceId, action)
    c.set(contextKey, row as unknown as AppEnv["Variables"][K])
    c.set("workspaceId", row.workspaceId)
    await next()
  })
}
