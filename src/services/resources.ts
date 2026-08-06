import { and, eq } from "drizzle-orm";

import { connections } from "../db/schema/connections";
import { resourceFolders, resources } from "../db/schema/resources";
import { db } from "../lib/db";
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

export async function assertConnectionInWorkspace(workspaceId: string, connectionId: string) {
  const [connection] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.id, connectionId), eq(connections.workspaceId, workspaceId)));
  if (!connection) throw new AppError("Connection not found in this workspace", 400);
}

export async function assertFolderInWorkspace(workspaceId: string, folderId: string) {
  const [folder] = await db
    .select({ id: resourceFolders.id })
    .from(resourceFolders)
    .where(and(eq(resourceFolders.id, folderId), eq(resourceFolders.workspaceId, workspaceId)));
  if (!folder) throw new AppError("Folder not found in this workspace", 400);
}

// Reused by controllers/resources.ts (direct creation) and
// controllers/playground.ts's promoteTile (adhoc tile -> saved resource).
export async function createResourceRow(workspaceId: string, input: ResourceInput, createdBy: string) {
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
