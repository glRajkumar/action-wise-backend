import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";

import { users } from "../db/schema/auth";
import type { WorkspaceRole } from "../db/schema/enums";
import { workspaceInvites, workspaceMembers, workspaces } from "../db/schema/workspaces";
import { db } from "../lib/db";
import { createWorkspaceWithOwner } from "../services/workspaces";
import { inviteEmailSender } from "../services/invite-email";
import type { AppEnv } from "../types/hono";
import { AppError } from "../utils/errors";
import { assertWorkspaceAccess } from "../utils/permissions";

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

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

export async function listWorkspaces(c: Context<AppEnv>) {
  const userId = c.get("userId");
  const rows = await db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));

  return c.json(rows.map(({ workspace, role }) => ({ ...workspace, role })));
}

export async function createWorkspace(c: Context<AppEnv>) {
  const { name } = c.req.valid("json" as never) as { name: string };
  const workspace = await createWorkspaceWithOwner(name, c.get("userId"));
  return c.json(workspace, 201);
}

// Not workspace-scoped — the invited user isn't a member yet, the token is the authorization.
export async function acceptWorkspaceInvite(c: Context<AppEnv>) {
  const { token } = c.req.valid("param" as never) as { token: string };
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");

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

  return c.json({ workspaceId: invite.workspaceId });
}

export async function getWorkspace(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!workspace) throw new AppError("Workspace not found", 404);
  return c.json({ ...workspace, role: c.get("workspaceRole") });
}

export async function renameWorkspace(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const { name } = c.req.valid("json" as never) as { name: string };

  const [workspace] = await db.update(workspaces).set({ name }).where(eq(workspaces.id, workspaceId)).returning();
  if (!workspace) throw new AppError("Workspace not found", 404);
  return c.json(workspace);
}

export async function deleteWorkspace(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  return c.json({ message: "Workspace deleted" });
}

export async function listMembers(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const rows = await db
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

  return c.json(rows);
}

export async function updateMemberRole(c: Context<AppEnv>) {
  const { workspaceId, userId } = c.req.valid("param" as never) as { workspaceId: string; userId: string };
  const { role } = c.req.valid("json" as never) as { role: WorkspaceRole };

  if (role !== "owner") await assertNotLastOwner(workspaceId, userId);

  const [updated] = await db
    .update(workspaceMembers)
    .set({ role })
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .returning();

  if (!updated) throw new AppError("Member not found", 404);
  return c.json(updated);
}

export async function removeMember(c: Context<AppEnv>) {
  const { workspaceId, userId } = c.req.valid("param" as never) as { workspaceId: string; userId: string };

  await assertNotLastOwner(workspaceId, userId);

  const [removed] = await db
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .returning();

  if (!removed) throw new AppError("Member not found", 404);
  return c.json({ message: "Member removed" });
}

export async function listInvites(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const rows = await db
    .select()
    .from(workspaceInvites)
    .where(and(eq(workspaceInvites.workspaceId, workspaceId), eq(workspaceInvites.status, "pending")));

  return c.json(rows);
}

export async function inviteToWorkspace(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const { email, role } = c.req.valid("json" as never) as { email: string; role: WorkspaceRole };
  const invitedBy = c.get("userId");

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!workspace) throw new AppError("Workspace not found", 404);

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  const [invite] = await db
    .insert(workspaceInvites)
    .values({ workspaceId, email, role, token, invitedBy, expiresAt })
    .returning();
  if (!invite) throw new Error("Failed to create invite");

  await inviteEmailSender.sendInviteEmail({ email, workspaceName: workspace.name, token: invite.token });

  return c.json(invite, 201);
}

// Item — inviteId alone identifies the row; workspaceId is derived from it.
export async function revokeInvite(c: Context<AppEnv>) {
  const { inviteId } = c.req.valid("param" as never) as { inviteId: string };
  const userId = c.get("userId");

  const [invite] = await db.select().from(workspaceInvites).where(eq(workspaceInvites.id, inviteId));
  if (!invite) throw new AppError("Invite not found", 404);
  await assertWorkspaceAccess(userId, invite.workspaceId, "workspace:invite");

  const [updated] = await db
    .update(workspaceInvites)
    .set({ status: "revoked" })
    .where(and(eq(workspaceInvites.id, inviteId), eq(workspaceInvites.status, "pending")))
    .returning();

  if (!updated) throw new AppError("Invite not found", 404);
  return c.json({ message: "Invite revoked" });
}
