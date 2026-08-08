import { createMiddleware } from "hono/factory"

import { AppError } from "../utils/errors"
import { roleHasPermission, type WorkspaceAction } from "../utils/permissions"
import type { WorkspaceRole } from "../db/schema/enums"
import type { AppEnv } from "../types/hono"

export function requireItemAccess<
  Row extends { workspaceId: string; role: WorkspaceRole },
  K extends keyof AppEnv["Variables"],
>(paramName: string, contextKey: K, loadRow: (id: string, userId: string) => Promise<Row>, action: WorkspaceAction) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const id = c.req.param(paramName)
    if (!id) throw new AppError("Not found", 404)
    const userId = c.get("userId")
    const row = await loadRow(id, userId)
    if (!roleHasPermission(row.role, action)) throw new AppError("Forbidden", 403)

    const { role, ...rest } = row
    c.set(contextKey, rest as unknown as AppEnv["Variables"][K])
    c.set("workspaceId", row.workspaceId)
    c.set("workspaceRole", role)
    await next()
  })
}
