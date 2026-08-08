import { Hono } from "hono"

import { requireWorkspaceAccess } from "../middlewares/workspace-access"
import { requireItemAccess } from "../middlewares/item-access"

import { zv } from "../utils/validate"

import { workspaceIdParamSchema } from "../validations/workspaces"
import { generateFakeDataSchema } from "../validations/beautify"

import {
  createFolder,
  createResource,
  deleteFolder,
  deleteResource,
  exportResourceType,
  generateFakeData,
  getResource,
  listFolders,
  listResources,
  requireFolderRow,
  requireResource,
  updateFolder,
  updateResource,
} from "../controllers/resources"
import {
  createFolderSchema,
  createResourceSchema,
  folderParamSchema,
  listResourcesQuerySchema,
  resourceParamSchema,
  updateFolderSchema,
  updateResourceSchema,
} from "../validations/resources"

export const resourcesCollectionRouter = new Hono()
  .get(
    "/:workspaceId/resource-folders",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("resource:read"),
    listFolders,
  )
  .post(
    "/:workspaceId/resource-folders",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("resource:write"),
    zv("json", createFolderSchema),
    createFolder,
  )
  .get(
    "/:workspaceId/resources",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("resource:read"),
    zv("query", listResourcesQuerySchema),
    listResources,
  )
  .post(
    "/:workspaceId/resources",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("resource:write"),
    zv("json", createResourceSchema),
    createResource,
  )

export const resourceItemsRouter = new Hono()
  .get(
    "/:resourceId",
    zv("param", resourceParamSchema),
    requireItemAccess("resourceId", "resourceRow", requireResource, "resource:read"),
    getResource,
  )
  .patch(
    "/:resourceId",
    zv("param", resourceParamSchema),
    requireItemAccess("resourceId", "resourceRow", requireResource, "resource:write"),
    zv("json", updateResourceSchema),
    updateResource,
  )
  .delete(
    "/:resourceId",
    zv("param", resourceParamSchema),
    requireItemAccess("resourceId", "resourceRow", requireResource, "resource:delete"),
    deleteResource,
  )
  .get(
    "/:resourceId/export-type",
    zv("param", resourceParamSchema),
    requireItemAccess("resourceId", "resourceRow", requireResource, "resource:read"),
    exportResourceType,
  )
  .post(
    "/:resourceId/fake-data",
    zv("param", resourceParamSchema),
    requireItemAccess("resourceId", "resourceRow", requireResource, "resource:read"),
    zv("json", generateFakeDataSchema),
    generateFakeData,
  )

export const folderItemsRouter = new Hono()
  .patch(
    "/:folderId",
    zv("param", folderParamSchema),
    requireItemAccess("folderId", "folderRow", requireFolderRow, "resource:write"),
    zv("json", updateFolderSchema),
    updateFolder,
  )
  .delete(
    "/:folderId",
    zv("param", folderParamSchema),
    requireItemAccess("folderId", "folderRow", requireFolderRow, "resource:delete"),
    deleteFolder,
  )
