import { and, eq } from "drizzle-orm";

import { db } from "../lib/db";
import { workspaceMembers } from "../db/schema/workspaces";
import type { WorkspaceRole } from "../db/schema/enums";

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
  | "action:execute";

// Single source of truth for what each role can do. Per-resource overrides
// (handover DECISIONS #1) slot in later as extra entries here without touching
// any call site — every call site goes through `can()`/`getWorkspaceRole`.
// Content actions (connection/resource/action) are open to editor+ — viewer is
// read-only everywhere; workspace administration stays owner/admin-only.
// Executing an Action writes shared runs and fires real HTTP at shared
// resources, so unlike the personal Playground it's withheld from viewer.
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
};

export function roleHasPermission(role: WorkspaceRole, action: WorkspaceAction): boolean {
  return ROLE_PERMISSIONS[role].has(action);
}

export async function getWorkspaceRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));

  return member?.role ?? null;
}

type Subject = { type: "workspace"; workspaceId: string };

export async function can(userId: string, action: WorkspaceAction, subject: Subject): Promise<boolean> {
  const role = await getWorkspaceRole(userId, subject.workspaceId);
  return role !== null && roleHasPermission(role, action);
}
