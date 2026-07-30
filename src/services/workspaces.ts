import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "../lib/db";
import { users } from "../db/schema/auth";
import type { WorkspaceRole } from "../db/schema/enums";
import { workspaceInvites, workspaceMembers, workspaces } from "../db/schema/workspaces";
import { AppError } from "../utils/errors";

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

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

export async function listWorkspacesForUser(userId: string) {
  return db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));
}

export async function getWorkspace(workspaceId: string) {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  return workspace ?? null;
}

export async function updateWorkspaceName(workspaceId: string, name: string) {
  const [workspace] = await db.update(workspaces).set({ name }).where(eq(workspaces.id, workspaceId)).returning();
  return workspace ?? null;
}

export async function deleteWorkspace(workspaceId: string) {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

export async function listMembers(workspaceId: string) {
  return db
    .select({
      userId: workspaceMembers.userId,
      name: users.name,
      email: users.email,
      role: workspaceMembers.role,
      createdAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));
}

async function countOwners(workspaceId: string): Promise<number> {
  const owners = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")));
  return owners.length;
}

async function assertNotLastOwner(workspaceId: string, userId: string) {
  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));

  if (member?.role === "owner" && (await countOwners(workspaceId)) <= 1) {
    throw new AppError("Workspace must have at least one owner", 400);
  }
}

export async function updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
  if (role !== "owner") await assertNotLastOwner(workspaceId, userId);

  const [updated] = await db
    .update(workspaceMembers)
    .set({ role })
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .returning();

  if (!updated) throw new AppError("Member not found", 404);
  return updated;
}

export async function removeMember(workspaceId: string, userId: string) {
  await assertNotLastOwner(workspaceId, userId);

  const [removed] = await db
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .returning();

  if (!removed) throw new AppError("Member not found", 404);
}

export async function createInvite(workspaceId: string, email: string, role: WorkspaceRole, invitedBy: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  const [invite] = await db
    .insert(workspaceInvites)
    .values({ workspaceId, email, role, token, invitedBy, expiresAt })
    .returning();

  if (!invite) throw new Error("Failed to create invite");
  return invite;
}

export async function listInvites(workspaceId: string) {
  return db
    .select()
    .from(workspaceInvites)
    .where(and(eq(workspaceInvites.workspaceId, workspaceId), eq(workspaceInvites.status, "pending")));
}

export async function revokeInvite(workspaceId: string, inviteId: string) {
  const [invite] = await db
    .update(workspaceInvites)
    .set({ status: "revoked" })
    .where(
      and(
        eq(workspaceInvites.id, inviteId),
        eq(workspaceInvites.workspaceId, workspaceId),
        eq(workspaceInvites.status, "pending"),
      ),
    )
    .returning();

  if (!invite) throw new AppError("Invite not found", 404);
  return invite;
}

export async function acceptInvite(token: string, userId: string, userEmail: string) {
  const [invite] = await db.select().from(workspaceInvites).where(eq(workspaceInvites.token, token));

  if (!invite || invite.status !== "pending") throw new AppError("Invite not found", 404);
  if (invite.expiresAt < new Date()) throw new AppError("Invite has expired", 400);
  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new AppError("This invite was sent to a different email address", 403);
  }

  const [existingMember] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, userId)));

  if (!existingMember) {
    await db.insert(workspaceMembers).values({ workspaceId: invite.workspaceId, userId, role: invite.role });
  }

  await db.update(workspaceInvites).set({ status: "accepted" }).where(eq(workspaceInvites.id, invite.id));

  return { workspaceId: invite.workspaceId };
}
