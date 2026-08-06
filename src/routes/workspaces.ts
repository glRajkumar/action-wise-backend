import { Hono } from "hono";

import {
  acceptWorkspaceInvite,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  inviteToWorkspace,
  listInvites,
  listMembers,
  listWorkspaces,
  removeMember,
  renameWorkspace,
  revokeInvite,
  updateMemberRole,
} from "../controllers/workspaces";
import { requireWorkspaceAccess } from "../middlewares/workspace-access";
import type { AppEnv } from "../types/hono";
import { zv } from "../utils/validate";
import {
  acceptInviteParamSchema,
  createInviteSchema,
  createWorkspaceSchema,
  inviteParamSchema,
  memberParamSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  workspaceIdParamSchema,
} from "../validations/workspaces";

export const workspacesRouter = new Hono<AppEnv>()
  .get("/", listWorkspaces)

  .post("/", zv("json", createWorkspaceSchema), createWorkspace)

  // Not workspace-scoped — the invited user isn't a member yet, the token is the authorization.
  .post("/invites/:token/accept", zv("param", acceptInviteParamSchema), acceptWorkspaceInvite)

  .get(
    "/:workspaceId",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:read"),
    getWorkspace,
  )

  .patch(
    "/:workspaceId",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:update"),
    zv("json", updateWorkspaceSchema),
    renameWorkspace,
  )

  .delete(
    "/:workspaceId",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:delete"),
    deleteWorkspace,
  )

  .get(
    "/:workspaceId/members",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:read"),
    listMembers,
  )

  .patch(
    "/:workspaceId/members/:userId",
    zv("param", memberParamSchema),
    requireWorkspaceAccess("workspace:manage_members"),
    zv("json", updateMemberRoleSchema),
    updateMemberRole,
  )

  .delete(
    "/:workspaceId/members/:userId",
    zv("param", memberParamSchema),
    requireWorkspaceAccess("workspace:manage_members"),
    removeMember,
  )

  .get(
    "/:workspaceId/invites",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:read"),
    listInvites,
  )

  .post(
    "/:workspaceId/invites",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:invite"),
    zv("json", createInviteSchema),
    inviteToWorkspace,
  )

  .delete(
    "/:workspaceId/invites/:inviteId",
    zv("param", inviteParamSchema),
    requireWorkspaceAccess("workspace:invite"),
    revokeInvite,
  );
