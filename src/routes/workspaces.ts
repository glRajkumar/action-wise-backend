import { Hono } from "hono"

import { requireWorkspaceAccess } from "../middlewares/workspace-access"
import { requireItemAccess } from "../middlewares/item-access"

import { zv } from "../utils/validate"

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
  requireInviteRow,
  revokeInvite,
  updateMemberRole,
} from "../controllers/workspaces"
import {
  acceptInviteParamSchema,
  createInviteSchema,
  createWorkspaceSchema,
  inviteParamSchema,
  memberParamSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  workspaceIdParamSchema,
} from "../validations/workspaces"

export const workspacesRouter = new Hono()
  .get("/", listWorkspaces)
  .post("/", zv("json", createWorkspaceSchema), createWorkspace)
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

export const inviteItemsRouter = new Hono()
  .post("/:token/accept", zv("param", acceptInviteParamSchema), acceptWorkspaceInvite)
  .delete(
    "/:inviteId",
    zv("param", inviteParamSchema),
    requireItemAccess("inviteId", "inviteRow", requireInviteRow, "workspace:invite"),
    revokeInvite,
  )
