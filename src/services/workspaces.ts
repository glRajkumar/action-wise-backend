import { eq } from "drizzle-orm";

import { workspaceMembers, workspaces } from "../db/schema/workspaces";
import { db } from "../lib/db";

export async function createWorkspaceWithOwner(name: string, ownerId: string) {
  const [workspace] = await db.insert(workspaces).values({ name, createdBy: ownerId }).returning();
  if (!workspace) throw new Error("Failed to create workspace");

  await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: ownerId, role: "owner" });

  return workspace;
}

// Backfill for users who signed up while email verification blocked session
// creation (no personal workspace got made — see lib/auth.ts). Only fires when
// the user belongs to zero workspaces, so someone invited into another
// workspace never gets a forced personal one.
export async function ensurePersonalWorkspace(userId: string, name: string) {
  const [membership] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);
  if (membership) return null;

  return createWorkspaceWithOwner(`${name}'s Workspace`, userId);
}
