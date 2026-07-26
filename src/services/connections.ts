import { and, eq } from "drizzle-orm";

import { db } from "../lib/db";
import { connectionSecrets, connections, type ConnectionConfig } from "../db/schema/connections";
import { AppError } from "../utils/errors";
import { decryptSecret, encryptSecret } from "./crypto";

type ConnectionKind = "http" | "firebase";

export async function createConnection(
  workspaceId: string,
  kind: ConnectionKind,
  name: string,
  config: ConnectionConfig,
  createdBy: string,
) {
  const [connection] = await db.insert(connections).values({ workspaceId, kind, name, config, createdBy }).returning();
  if (!connection) throw new Error("Failed to create connection");
  return connection;
}

// hasSecret tells the caller whether *they* have a secret stored for this
// connection — never whether anyone does, and never the value itself.
export async function listConnections(workspaceId: string, userId: string) {
  const rows = await db
    .select({ connection: connections, secretUserId: connectionSecrets.userId })
    .from(connections)
    .leftJoin(
      connectionSecrets,
      and(eq(connectionSecrets.connectionId, connections.id), eq(connectionSecrets.userId, userId)),
    )
    .where(eq(connections.workspaceId, workspaceId));

  return rows.map(({ connection, secretUserId }) => ({ ...connection, hasSecret: secretUserId !== null }));
}

export async function getConnection(workspaceId: string, connectionId: string, userId: string) {
  const [row] = await db
    .select({ connection: connections, secretUserId: connectionSecrets.userId })
    .from(connections)
    .leftJoin(
      connectionSecrets,
      and(eq(connectionSecrets.connectionId, connections.id), eq(connectionSecrets.userId, userId)),
    )
    .where(and(eq(connections.id, connectionId), eq(connections.workspaceId, workspaceId)));

  if (!row) return null;
  return { ...row.connection, hasSecret: row.secretUserId !== null };
}

export async function updateConnection(
  workspaceId: string,
  connectionId: string,
  kind: ConnectionKind,
  name: string,
  config: ConnectionConfig,
) {
  const [connection] = await db
    .update(connections)
    .set({ kind, name, config })
    .where(and(eq(connections.id, connectionId), eq(connections.workspaceId, workspaceId)))
    .returning();

  if (!connection) throw new AppError("Connection not found", 404);
  return connection;
}

export async function deleteConnection(workspaceId: string, connectionId: string) {
  const [deleted] = await db
    .delete(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.workspaceId, workspaceId)))
    .returning();

  if (!deleted) throw new AppError("Connection not found", 404);
}

export async function setConnectionSecret(connectionId: string, userId: string, value: string) {
  const encrypted = encryptSecret(value);

  await db
    .insert(connectionSecrets)
    .values({ connectionId, userId, ...encrypted })
    .onConflictDoUpdate({
      target: [connectionSecrets.connectionId, connectionSecrets.userId],
      set: { ...encrypted, updatedAt: new Date() },
    });
}

export async function deleteConnectionSecret(connectionId: string, userId: string) {
  await db
    .delete(connectionSecrets)
    .where(and(eq(connectionSecrets.connectionId, connectionId), eq(connectionSecrets.userId, userId)));
}

// Internal use only (Playground/Actions execution, sections D/G) — the
// decrypted value must never be returned from an API response.
export async function getDecryptedConnectionSecret(connectionId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ ciphertext: connectionSecrets.ciphertext, iv: connectionSecrets.iv, authTag: connectionSecrets.authTag })
    .from(connectionSecrets)
    .where(and(eq(connectionSecrets.connectionId, connectionId), eq(connectionSecrets.userId, userId)));

  if (!row) return null;
  return decryptSecret(row);
}
