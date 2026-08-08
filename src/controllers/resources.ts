import { and, eq } from "drizzle-orm"
import type { Context } from "hono"

import type { AppEnv, zContext } from "../types/hono"

import {
  assertConnectionInWorkspace,
  assertFolderInWorkspace,
  createResourceRow
} from "../services/resources"
import {
  exportResourceType as exportResourceTypeService,
  generateFakeDataForResource as generateFakeDataService,
} from "../services/beautify"

import { resourceFolders, resources } from "../db/schema/resources"
import { db } from "../lib/db"

import { AppError } from "../utils/errors"

import { workspaceIdParamSchema } from "../validations/workspaces"
import { generateFakeDataSchema } from "../validations/beautify"
import {
  createFolderSchema,
  createResourceSchema,
  folderParamSchema,
  listResourcesQuerySchema,
  resourceParamSchema,
  updateFolderSchema,
  updateResourceSchema,
} from "../validations/resources"

export async function listFolders(c: zContext<{ param: typeof workspaceIdParamSchema }>) {
  const { workspaceId } = c.req.valid("param")
  const rows = await db.select().from(resourceFolders).where(eq(resourceFolders.workspaceId, workspaceId))
  return c.json(rows)
}

export async function createFolder(c: zContext<{ param: typeof workspaceIdParamSchema; json: typeof createFolderSchema }>) {
  const { workspaceId } = c.req.valid("param")
  const { name, parentFolderId } = c.req.valid("json")
  const createdBy = c.get("userId")

  if (parentFolderId) await assertFolderInWorkspace(workspaceId, parentFolderId)

  const [folder] = await db
    .insert(resourceFolders)
    .values({ workspaceId, name, parentFolderId: parentFolderId ?? null, createdBy })
    .returning()
  if (!folder) throw new Error("Failed to create folder")

  return c.json(folder, 201)
}

export async function requireFolderRow(folderId: string) {
  const [row] = await db.select().from(resourceFolders).where(eq(resourceFolders.id, folderId))
  if (!row) throw new AppError("Folder not found", 404)
  return row
}

export async function updateFolder(c: zContext<{ param: typeof folderParamSchema; json: typeof updateFolderSchema }>) {
  const { folderId } = c.req.valid("param")
  const { name, parentFolderId } = c.req.valid("json")
  const { workspaceId } = c.get("folderRow")

  if (parentFolderId) {
    if (parentFolderId === folderId) throw new AppError("A folder cannot be its own parent", 400)
    await assertFolderInWorkspace(workspaceId, parentFolderId)
  }

  const [folder] = await db
    .update(resourceFolders)
    .set({ name, parentFolderId: parentFolderId ?? null })
    .where(eq(resourceFolders.id, folderId))
    .returning()

  if (!folder) throw new AppError("Folder not found", 404)
  return c.json(folder)
}

export async function deleteFolder(c: zContext<{ param: typeof folderParamSchema }>) {
  const { folderId } = c.req.valid("param")

  const [deleted] = await db.delete(resourceFolders).where(eq(resourceFolders.id, folderId)).returning()
  if (!deleted) throw new AppError("Folder not found", 404)

  return c.json({ message: "Folder deleted" })
}

export async function listResources(c: zContext<{ param: typeof workspaceIdParamSchema; query: typeof listResourcesQuerySchema }>) {
  const { workspaceId } = c.req.valid("param")
  const { folderId } = c.req.valid("query")

  const conditions = [eq(resources.workspaceId, workspaceId)]
  if (folderId) conditions.push(eq(resources.folderId, folderId))

  const rows = await db
    .select()
    .from(resources)
    .where(and(...conditions))
  return c.json(rows)
}

export async function createResource(c: zContext<{ param: typeof workspaceIdParamSchema; json: typeof createResourceSchema }>) {
  const { workspaceId } = c.req.valid("param")
  const input = c.req.valid("json")
  const createdBy = c.get("userId")

  const resource = await createResourceRow(workspaceId, input, createdBy)
  return c.json(resource, 201)
}

export async function requireResource(resourceId: string) {
  const [resource] = await db.select().from(resources).where(eq(resources.id, resourceId))
  if (!resource) throw new AppError("Resource not found", 404)
  return resource
}

export async function getResource(c: Context<AppEnv>) {
  const resource = c.get("resourceRow")
  return c.json(resource)
}

export async function updateResource(c: zContext<{ param: typeof resourceParamSchema; json: typeof updateResourceSchema }>) {
  const { resourceId } = c.req.valid("param")
  const input = c.req.valid("json")
  const existing = c.get("resourceRow")

  if (existing.kind !== input.kind) throw new AppError("Resource kind cannot be changed after creation", 400)

  await assertConnectionInWorkspace(existing.workspaceId, input.connectionId)
  if (input.folderId) await assertFolderInWorkspace(existing.workspaceId, input.folderId)

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
    .returning()

  if (!resource) throw new AppError("Resource not found", 404)
  return c.json(resource)
}

export async function deleteResource(c: zContext<{ param: typeof resourceParamSchema }>) {
  const { resourceId } = c.req.valid("param")

  const [deleted] = await db.delete(resources).where(eq(resources.id, resourceId)).returning()
  if (!deleted) throw new AppError("Resource not found", 404)

  return c.json({ message: "Resource deleted" })
}

export async function exportResourceType(c: Context<AppEnv>) {
  const resource = c.get("resourceRow")
  return c.json(await exportResourceTypeService(resource.workspaceId, resource.id))
}

export async function generateFakeData(c: zContext<{ json: typeof generateFakeDataSchema }>) {
  const { count } = c.req.valid("json")
  const resource = c.get("resourceRow")
  return c.json(await generateFakeDataService(resource.workspaceId, resource.id, count))
}
