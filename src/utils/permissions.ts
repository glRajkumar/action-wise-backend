import { and, eq } from "drizzle-orm"

import type { WorkspaceRole } from "../db/schema/enums"
import { workspaceMembers } from "../db/schema/workspaces"
import { db } from "../lib/db"

import { AppError } from "./errors"

export type WorkspaceAction =
  | "workspace:read"
  | "workspace:update"
  | "workspace:delete"
  | "workspace:manage_members"
  | "workspace:invite"
  | "connection:read"
  | "connection:write"
  | "connection:delete"
  | "resource:read"
  | "resource:write"
  | "resource:delete"
  | "action:read"
  | "action:write"
  | "action:delete"
  | "action:execute"

const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<WorkspaceAction>> = {
  owner: new Set([
    "workspace:read",
    "workspace:update",
    "workspace:delete",
    "workspace:manage_members",
    "workspace:invite",
    "connection:read",
    "connection:write",
    "connection:delete",
    "resource:read",
    "resource:write",
    "resource:delete",
    "action:read",
    "action:write",
    "action:delete",
    "action:execute",
  ]),
  admin: new Set([
    "workspace:read",
    "workspace:update",
    "workspace:manage_members",
    "workspace:invite",
    "connection:read",
    "connection:write",
    "connection:delete",
    "resource:read",
    "resource:write",
    "resource:delete",
    "action:read",
    "action:write",
    "action:delete",
    "action:execute",
  ]),
  editor: new Set([
    "workspace:read",
    "connection:read",
    "connection:write",
    "resource:read",
    "resource:write",
    "action:read",
    "action:write",
    "action:execute",
  ]),
  viewer: new Set(["workspace:read", "connection:read", "resource:read", "action:read"]),
}

export function roleHasPermission(role: WorkspaceRole, action: WorkspaceAction): boolean {
  return ROLE_PERMISSIONS[role].has(action)
}

export async function getWorkspaceRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))

  return member?.role ?? null
}

type Subject = { type: "workspace"; workspaceId: string }

export async function can(userId: string, action: WorkspaceAction, subject: Subject): Promise<boolean> {
  const role = await getWorkspaceRole(userId, subject.workspaceId)
  return role !== null && roleHasPermission(role, action)
}

export async function assertWorkspaceAccess(
  userId: string,
  workspaceId: string,
  action: WorkspaceAction,
): Promise<WorkspaceRole> {
  const role = await getWorkspaceRole(userId, workspaceId)
  if (!role) throw new AppError("Workspace not found", 404)
  if (!roleHasPermission(role, action)) throw new AppError("Forbidden", 403)
  return role
}
