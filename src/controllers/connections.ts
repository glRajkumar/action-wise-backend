import { and, eq } from "drizzle-orm";
import type { Context } from "hono";

import { connections, connectionSecrets, type ConnectionConfig } from "../db/schema/connections";
import { db } from "../lib/db";
import { encryptSecret } from "../services/crypto";
import type { AppEnv } from "../types/hono";
import { AppError } from "../utils/errors";
import { assertWorkspaceAccess } from "../utils/permissions";

// -- collection (list/create — workspaceId comes from the path) --

export async function listConnections(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const userId = c.get("userId");

  const rows = await db
    .select({ connection: connections, secretUserId: connectionSecrets.userId })
    .from(connections)
    .leftJoin(
      connectionSecrets,
      and(eq(connectionSecrets.connectionId, connections.id), eq(connectionSecrets.userId, userId)),
    )
    .where(eq(connections.workspaceId, workspaceId));

  return c.json(rows.map(({ connection, secretUserId }) => ({ ...connection, hasSecret: secretUserId !== null })));
}

export async function createConnection(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const { kind, name, config } = c.req.valid("json" as never) as {
    kind: "http" | "firebase";
    name: string;
    config: ConnectionConfig;
  };
  const userId = c.get("userId");

  const [connection] = await db
    .insert(connections)
    .values({ workspaceId, kind, name, config, createdBy: userId })
    .returning();
  if (!connection) throw new Error("Failed to create connection");
  return c.json(connection, 201);
}

// -- item (get/update/delete by connectionId alone — workspaceId derived from the row) --

async function requireConnectionWorkspaceId(connectionId: string): Promise<string> {
  const [row] = await db.select({ workspaceId: connections.workspaceId }).from(connections).where(eq(connections.id, connectionId));
  if (!row) throw new AppError("Connection not found", 404);
  return row.workspaceId;
}

export async function getConnection(c: Context<AppEnv>) {
  const { connectionId } = c.req.valid("param" as never) as { connectionId: string };
  const userId = c.get("userId");

  const [row] = await db
    .select({ connection: connections, secretUserId: connectionSecrets.userId })
    .from(connections)
    .leftJoin(
      connectionSecrets,
      and(eq(connectionSecrets.connectionId, connections.id), eq(connectionSecrets.userId, userId)),
    )
    .where(eq(connections.id, connectionId));

  if (!row) throw new AppError("Connection not found", 404);
  await assertWorkspaceAccess(userId, row.connection.workspaceId, "connection:read");
  return c.json({ ...row.connection, hasSecret: row.secretUserId !== null });
}

export async function updateConnection(c: Context<AppEnv>) {
  const { connectionId } = c.req.valid("param" as never) as { connectionId: string };
  const { kind, name, config } = c.req.valid("json" as never) as {
    kind: "http" | "firebase";
    name: string;
    config: ConnectionConfig;
  };
  const userId = c.get("userId");

  const workspaceId = await requireConnectionWorkspaceId(connectionId);
  await assertWorkspaceAccess(userId, workspaceId, "connection:write");

  const [connection] = await db
    .update(connections)
    .set({ kind, name, config })
    .where(eq(connections.id, connectionId))
    .returning();

  if (!connection) throw new AppError("Connection not found", 404);
  return c.json(connection);
}

export async function deleteConnection(c: Context<AppEnv>) {
  const { connectionId } = c.req.valid("param" as never) as { connectionId: string };
  const userId = c.get("userId");

  const workspaceId = await requireConnectionWorkspaceId(connectionId);
  await assertWorkspaceAccess(userId, workspaceId, "connection:delete");

  const [deleted] = await db.delete(connections).where(eq(connections.id, connectionId)).returning();
  if (!deleted) throw new AppError("Connection not found", 404);
  return c.json({ message: "Connection deleted" });
}

// Setting/removing YOUR OWN secret only requires being able to see the
// connection, not full write access — it doesn't change the shared config.
export async function setConnectionSecret(c: Context<AppEnv>) {
  const { connectionId } = c.req.valid("param" as never) as { connectionId: string };
  const { value } = c.req.valid("json" as never) as { value: string };
  const userId = c.get("userId");

  const workspaceId = await requireConnectionWorkspaceId(connectionId);
  await assertWorkspaceAccess(userId, workspaceId, "connection:read");

  const encrypted = encryptSecret(value);
  await db
    .insert(connectionSecrets)
    .values({ connectionId, userId, ...encrypted })
    .onConflictDoUpdate({
      target: [connectionSecrets.connectionId, connectionSecrets.userId],
      set: { ...encrypted, updatedAt: new Date() },
    });

  return c.json({ message: "Secret saved" });
}

export async function deleteConnectionSecret(c: Context<AppEnv>) {
  const { connectionId } = c.req.valid("param" as never) as { connectionId: string };
  const userId = c.get("userId");

  const workspaceId = await requireConnectionWorkspaceId(connectionId);
  await assertWorkspaceAccess(userId, workspaceId, "connection:read");

  await db
    .delete(connectionSecrets)
    .where(and(eq(connectionSecrets.connectionId, connectionId), eq(connectionSecrets.userId, userId)));

  return c.json({ message: "Secret deleted" });
}
