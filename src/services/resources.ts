import { and, eq } from "drizzle-orm";

import { db } from "../lib/db";
import { connections } from "../db/schema/connections";
import { resourceFolders, resources } from "../db/schema/resources";
import { AppError } from "../utils/errors";

type ResourceKind = "http" | "firebase_rtdb" | "firebase_firestore";
type ResourceDirection = "invoke" | "subscribe" | "receive";
type ResourceDanger = "safe" | "mutating" | "destructive";

export type ResourceInput = {
  kind: ResourceKind;
  name: string;
  folderId?: string | null;
  connectionId: string;
  direction: ResourceDirection;
  danger: ResourceDanger;
  address: string;
  payloadTemplate?: unknown;
  config: unknown;
};

async function assertConnectionInWorkspace(workspaceId: string, connectionId: string) {
  const [connection] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.workspaceId, workspaceId)));
  if (!connection) throw new AppError("Connection not found in this workspace", 400);
}

async function assertFolderInWorkspace(workspaceId: string, folderId: string) {
  const [folder] = await db
    .select({ id: resourceFolders.id })
    .from(resourceFolders)
    .where(and(eq(resourceFolders.id, folderId), eq(resourceFolders.workspaceId, workspaceId)));
  if (!folder) throw new AppError("Folder not found in this workspace", 400);
}

// -- Folders --

export async function createFolder(
  workspaceId: string,
  name: string,
  parentFolderId: string | null | undefined,
  createdBy: string,
) {
  if (parentFolderId) await assertFolderInWorkspace(workspaceId, parentFolderId);

  const [folder] = await db
    .insert(resourceFolders)
    .values({ workspaceId, name, parentFolderId: parentFolderId ?? null, createdBy })
    .returning();
  if (!folder) throw new Error("Failed to create folder");
  return folder;
}

export async function listFolders(workspaceId: string) {
  return db.select().from(resourceFolders).where(eq(resourceFolders.workspaceId, workspaceId));
}

export async function updateFolder(
  workspaceId: string,
  folderId: string,
  name: string,
  parentFolderId: string | null | undefined,
) {
  if (parentFolderId) {
    if (parentFolderId === folderId) throw new AppError("A folder cannot be its own parent", 400);
    await assertFolderInWorkspace(workspaceId, parentFolderId);
  }

  const [folder] = await db
    .update(resourceFolders)
    .set({ name, parentFolderId: parentFolderId ?? null })
    .where(and(eq(resourceFolders.id, folderId), eq(resourceFolders.workspaceId, workspaceId)))
    .returning();

  if (!folder) throw new AppError("Folder not found", 404);
  return folder;
}

// Child folders/resources land at root (set null) rather than being blocked or
// cascade-deleted — matches the FK behavior already fixed in the Section A schema.
export async function deleteFolder(workspaceId: string, folderId: string) {
  const [deleted] = await db
    .delete(resourceFolders)
    .where(and(eq(resourceFolders.id, folderId), eq(resourceFolders.workspaceId, workspaceId)))
    .returning();
  if (!deleted) throw new AppError("Folder not found", 404);
}

// -- Resources --

export async function createResource(workspaceId: string, input: ResourceInput, createdBy: string) {
  await assertConnectionInWorkspace(workspaceId, input.connectionId);
  if (input.folderId) await assertFolderInWorkspace(workspaceId, input.folderId);

  const [resource] = await db
    .insert(resources)
    .values({
      workspaceId,
      folderId: input.folderId ?? null,
      connectionId: input.connectionId,
      kind: input.kind,
      direction: input.direction,
      danger: input.danger,
      name: input.name,
      address: input.address,
      payloadTemplate: input.payloadTemplate,
      config: input.config,
      createdBy,
    })
    .returning();

  if (!resource) throw new Error("Failed to create resource");
  return resource;
}

export async function listResources(workspaceId: string, folderId?: string) {
  const conditions = [eq(resources.workspaceId, workspaceId)];
  if (folderId) conditions.push(eq(resources.folderId, folderId));
  return db
    .select()
    .from(resources)
    .where(and(...conditions));
}

export async function getResource(workspaceId: string, resourceId: string) {
  const [resource] = await db
    .select()
    .from(resources)
    .where(and(eq(resources.id, resourceId), eq(resources.workspaceId, workspaceId)));
  return resource ?? null;
}

export async function updateResource(workspaceId: string, resourceId: string, input: ResourceInput) {
  const existing = await getResource(workspaceId, resourceId);
  if (!existing) throw new AppError("Resource not found", 404);
  if (existing.kind !== input.kind) throw new AppError("Resource kind cannot be changed after creation", 400);

  await assertConnectionInWorkspace(workspaceId, input.connectionId);
  if (input.folderId) await assertFolderInWorkspace(workspaceId, input.folderId);

  const [resource] = await db
    .update(resources)
    .set({
      folderId: input.folderId ?? null,
      connectionId: input.connectionId,
      direction: input.direction,
      danger: input.danger,
      name: input.name,
      address: input.address,
      payloadTemplate: input.payloadTemplate,
      config: input.config,
    })
    .where(and(eq(resources.id, resourceId), eq(resources.workspaceId, workspaceId)))
    .returning();

  if (!resource) throw new AppError("Resource not found", 404);
  return resource;
}

export async function deleteResource(workspaceId: string, resourceId: string) {
  const [deleted] = await db
    .delete(resources)
    .where(and(eq(resources.id, resourceId), eq(resources.workspaceId, workspaceId)))
    .returning();
  if (!deleted) throw new AppError("Resource not found", 404);
}
