import { createMiddleware } from "hono/factory";

import { AppError } from "../utils/errors";
import { getWorkspaceRole, roleHasPermission, type WorkspaceAction } from "../utils/permissions";
import type { AppEnv } from "../types/hono";

// Never trusts the :workspaceId path param on its own — every request re-derives
// membership from the session user against the DB. No membership row -> 404
// (don't reveal whether the workspace exists to a non-member); membership row
// but insufficient role -> 403.
export const requireWorkspaceAccess = (action: WorkspaceAction) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const userId = c.get("userId");
    const workspaceId = c.req.param("workspaceId");
    if (!workspaceId) throw new AppError("Workspace not found", 404);

    const role = await getWorkspaceRole(userId, workspaceId);
    if (!role) throw new AppError("Workspace not found", 404);
    if (!roleHasPermission(role, action)) throw new AppError("Forbidden", 403);

    c.set("workspaceId", workspaceId);
    c.set("workspaceRole", role);
    await next();
  });
