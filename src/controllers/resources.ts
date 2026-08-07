import { and, eq } from "drizzle-orm";
import type { Context } from "hono";

import { resourceFolders, resources } from "../db/schema/resources";
import { db } from "../lib/db";
import {
  exportResourceType as exportResourceTypeService,
  generateFakeDataForResource as generateFakeDataService,
} from "../services/beautify";
import {
  assertConnectionInWorkspace,
  assertFolderInWorkspace,
  createResourceRow,
  type ResourceInput,
} from "../services/resources";
import type { AppEnv } from "../types/hono";
import { AppError } from "../utils/errors";
import { assertWorkspaceAccess } from "../utils/permissions";

// -- folders (collection: list/create — workspaceId from the path) --

export async function listFolders(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const rows = await db.select().from(resourceFolders).where(eq(resourceFolders.workspaceId, workspaceId));
  return c.json(rows);
}

export async function createFolder(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const { name, parentFolderId } = c.req.valid("json" as never) as {
    name: string;
    parentFolderId?: string | null;
  };
  const createdBy = c.get("userId");

  if (parentFolderId) await assertFolderInWorkspace(workspaceId, parentFolderId);

  const [folder] = await db
    .insert(resourceFolders)
    .values({ workspaceId, name, parentFolderId: parentFolderId ?? null, createdBy })
    .returning();
  if (!folder) throw new Error("Failed to create folder");

  return c.json(folder, 201);
}

// -- folders (item: update/delete by folderId — workspaceId from the row) --

async function requireFolderWorkspaceId(folderId: string): Promise<string> {
  const [row] = await db
    .select({ workspaceId: resourceFolders.workspaceId })
    .from(resourceFolders)
    .where(eq(resourceFolders.id, folderId));
  if (!row) throw new AppError("Folder not found", 404);
  return row.workspaceId;
}

export async function updateFolder(c: Context<AppEnv>) {
  const { folderId } = c.req.valid("param" as never) as { folderId: string };
  const { name, parentFolderId } = c.req.valid("json" as never) as {
    name: string;
    parentFolderId?: string | null;
  };
  const userId = c.get("userId");

  const workspaceId = await requireFolderWorkspaceId(folderId);
  await assertWorkspaceAccess(userId, workspaceId, "resource:write");

  if (parentFolderId) {
    if (parentFolderId === folderId) throw new AppError("A folder cannot be its own parent", 400);
    await assertFolderInWorkspace(workspaceId, parentFolderId);
  }

  const [folder] = await db
    .update(resourceFolders)
    .set({ name, parentFolderId: parentFolderId ?? null })
    .where(eq(resourceFolders.id, folderId))
    .returning();

  if (!folder) throw new AppError("Folder not found", 404);
  return c.json(folder);
}

// Child folders/resources land at root (set null) rather than being blocked or
// cascade-deleted — matches the FK behavior fixed in the Section A schema.
export async function deleteFolder(c: Context<AppEnv>) {
  const { folderId } = c.req.valid("param" as never) as { folderId: string };
  const userId = c.get("userId");

  const workspaceId = await requireFolderWorkspaceId(folderId);
  await assertWorkspaceAccess(userId, workspaceId, "resource:delete");

  const [deleted] = await db.delete(resourceFolders).where(eq(resourceFolders.id, folderId)).returning();
  if (!deleted) throw new AppError("Folder not found", 404);

  return c.json({ message: "Folder deleted" });
}

// -- resources (collection: list/create — workspaceId from the path) --

export async function listResources(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const { folderId } = c.req.valid("query" as never) as { folderId?: string };

  const conditions = [eq(resources.workspaceId, workspaceId)];
  if (folderId) conditions.push(eq(resources.folderId, folderId));

  const rows = await db
    .select()
    .from(resources)
    .where(and(...conditions));
  return c.json(rows);
}

export async function createResource(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const input = c.req.valid("json" as never) as ResourceInput;
  const createdBy = c.get("userId");

  const resource = await createResourceRow(workspaceId, input, createdBy);
  return c.json(resource, 201);
}

// -- resources (item: get/update/delete by resourceId — workspaceId from the row) --

async function requireResource(resourceId: string) {
  const [resource] = await db.select().from(resources).where(eq(resources.id, resourceId));
  if (!resource) throw new AppError("Resource not found", 404);
  return resource;
}

export async function getResource(c: Context<AppEnv>) {
  const { resourceId } = c.req.valid("param" as never) as { resourceId: string };
  const userId = c.get("userId");

  const resource = await requireResource(resourceId);
  await assertWorkspaceAccess(userId, resource.workspaceId, "resource:read");
  return c.json(resource);
}

export async function updateResource(c: Context<AppEnv>) {
  const { resourceId } = c.req.valid("param" as never) as { resourceId: string };
  const input = c.req.valid("json" as never) as ResourceInput;
  const userId = c.get("userId");

  const existing = await requireResource(resourceId);
  await assertWorkspaceAccess(userId, existing.workspaceId, "resource:write");
  if (existing.kind !== input.kind) throw new AppError("Resource kind cannot be changed after creation", 400);

  await assertConnectionInWorkspace(existing.workspaceId, input.connectionId);
  if (input.folderId) await assertFolderInWorkspace(existing.workspaceId, input.folderId);

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
    .where(eq(resources.id, resourceId))
    .returning();

  if (!resource) throw new AppError("Resource not found", 404);
  return c.json(resource);
}

export async function deleteResource(c: Context<AppEnv>) {
  const { resourceId } = c.req.valid("param" as never) as { resourceId: string };
  const userId = c.get("userId");

  const existing = await requireResource(resourceId);
  await assertWorkspaceAccess(userId, existing.workspaceId, "resource:delete");

  const [deleted] = await db.delete(resources).where(eq(resources.id, resourceId)).returning();
  if (!deleted) throw new AppError("Resource not found", 404);

  return c.json({ message: "Resource deleted" });
}

// -- beautify / faker (handover E/F) — item routes, resourceId only --

export async function exportResourceType(c: Context<AppEnv>) {
  const { resourceId } = c.req.valid("param" as never) as { resourceId: string };
  const userId = c.get("userId");

  const resource = await requireResource(resourceId);
  await assertWorkspaceAccess(userId, resource.workspaceId, "resource:read");
  return c.json(await exportResourceTypeService(resource.workspaceId, resourceId));
}

export async function generateFakeData(c: Context<AppEnv>) {
  const { resourceId } = c.req.valid("param" as never) as { resourceId: string };
  const { count } = c.req.valid("json" as never) as { count: number };
  const userId = c.get("userId");

  const resource = await requireResource(resourceId);
  await assertWorkspaceAccess(userId, resource.workspaceId, "resource:read");
  return c.json(await generateFakeDataService(resource.workspaceId, resourceId, count));
}
