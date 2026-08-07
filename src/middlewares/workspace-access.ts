import { createMiddleware } from "hono/factory";

import { AppError } from "../utils/errors";
import { assertWorkspaceAccess, type WorkspaceAction } from "../utils/permissions";
import type { AppEnv } from "../types/hono";

// For collection routes only — :workspaceId is a genuine path param here.
// Item routes call `assertWorkspaceAccess` directly from the controller once
// they've loaded the row and derived its workspaceId (see plan notes).
export const requireWorkspaceAccess = (action: WorkspaceAction) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const userId = c.get("userId");
    const workspaceId = c.req.param("workspaceId");
    if (!workspaceId) throw new AppError("Workspace not found", 404);

    const role = await assertWorkspaceAccess(userId, workspaceId, action);

    c.set("workspaceId", workspaceId);
    c.set("workspaceRole", role);
    await next();
  });
