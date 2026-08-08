import { and, eq } from "drizzle-orm"

import type { zContext } from "../types/hono"

import { encryptSecret } from "../services/crypto"

import { connections, connectionSecrets } from "../db/schema/connections"
import { workspaceMembers } from "../db/schema/workspaces"
import { db } from "../lib/db"

import { AppError } from "../utils/errors"

import {
  connectionParamSchema,
  createConnectionSchema,
  setConnectionSecretSchema,
  updateConnectionSchema,
} from "../validations/connections"
import { workspaceIdParamSchema } from "../validations/workspaces"

export async function listConnections(c: zContext<{ param: typeof workspaceIdParamSchema }>) {
  const { workspaceId } = c.req.valid("param")
  const userId = c.get("userId")

  const rows = await db
    .select({ connection: connections, secretUserId: connectionSecrets.userId })
    .from(connections)
    .leftJoin(
      connectionSecrets,
      and(eq(connectionSecrets.connectionId, connections.id), eq(connectionSecrets.userId, userId)),
    )
    .where(eq(connections.workspaceId, workspaceId))

  return c.json(rows.map(({ connection, secretUserId }) => ({ ...connection, hasSecret: secretUserId !== null })))
}

export async function createConnection(c: zContext<{ param: typeof workspaceIdParamSchema; json: typeof createConnectionSchema }>) {
  const { workspaceId } = c.req.valid("param")
  const { kind, name, config } = c.req.valid("json")
  const userId = c.get("userId")

  const [connection] = await db
    .insert(connections)
    .values({ workspaceId, kind, name, config, createdBy: userId })
    .returning()
  if (!connection) throw new Error("Failed to create connection")
  return c.json(connection, 201)
}

export async function requireConnectionRow(connectionId: string, userId: string) {
  const [row] = await db
    .select({ connection: connections, role: workspaceMembers.role })
    .from(connections)
    .innerJoin(
      workspaceMembers,
      and(eq(workspaceMembers.workspaceId, connections.workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .where(eq(connections.id, connectionId))
  if (!row) throw new AppError("Connection not found", 404)
  return { ...row.connection, role: row.role }
}

export async function getConnection(c: zContext<{ param: typeof connectionParamSchema }>) {
  const userId = c.get("userId")
  const connectionRow = c.get("connectionRow")

  const [secret] = await db
    .select({ userId: connectionSecrets.userId })
    .from(connectionSecrets)
    .where(and(eq(connectionSecrets.connectionId, connectionRow.id), eq(connectionSecrets.userId, userId)))

  return c.json({ ...connectionRow, hasSecret: secret !== undefined })
}

export async function updateConnection(c: zContext<{ param: typeof connectionParamSchema; json: typeof updateConnectionSchema }>) {
  const { connectionId } = c.req.valid("param")
  const { kind, name, config } = c.req.valid("json")

  const [connection] = await db
    .update(connections)
    .set({ kind, name, config })
    .where(eq(connections.id, connectionId))
    .returning()

  if (!connection) throw new AppError("Connection not found", 404)
  return c.json(connection)
}

export async function deleteConnection(c: zContext<{ param: typeof connectionParamSchema }>) {
  const { connectionId } = c.req.valid("param")

  const [deleted] = await db.delete(connections).where(eq(connections.id, connectionId)).returning()
  if (!deleted) throw new AppError("Connection not found", 404)
  return c.json({ message: "Connection deleted" })
}

export async function setConnectionSecret(c: zContext<{ param: typeof connectionParamSchema; json: typeof setConnectionSecretSchema }>) {
  const { connectionId } = c.req.valid("param")
  const { value } = c.req.valid("json")
  const userId = c.get("userId")

  const encrypted = encryptSecret(value)
  await db
    .insert(connectionSecrets)
    .values({ connectionId, userId, ...encrypted })
    .onConflictDoUpdate({
      target: [connectionSecrets.connectionId, connectionSecrets.userId],
      set: { ...encrypted, updatedAt: new Date() },
    })

  return c.json({ message: "Secret saved" })
}

export async function deleteConnectionSecret(c: zContext<{ param: typeof connectionParamSchema }>) {
  const { connectionId } = c.req.valid("param")
  const userId = c.get("userId")

  await db
    .delete(connectionSecrets)
    .where(and(eq(connectionSecrets.connectionId, connectionId), eq(connectionSecrets.userId, userId)))

  return c.json({ message: "Secret deleted" })
}
