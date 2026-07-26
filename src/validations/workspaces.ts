import { z } from "zod";

import { WORKSPACE_ROLES } from "../db/schema/enums";

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const workspaceIdParamSchema = z.object({
  workspaceId: z.uuid(),
});

export const memberParamSchema = workspaceIdParamSchema.extend({
  userId: z.string().trim().min(1),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES),
});

export const inviteParamSchema = workspaceIdParamSchema.extend({
  inviteId: z.uuid(),
});

export const createInviteSchema = z.object({
  email: z.email(),
  role: z.enum(WORKSPACE_ROLES),
});

export const acceptInviteParamSchema = z.object({
  token: z.string().trim().min(1),
});
