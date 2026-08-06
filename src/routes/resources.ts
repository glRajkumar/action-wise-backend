import { Hono } from "hono";

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
  updateFolder,
  updateResource,
} from "../controllers/resources";
import { requireWorkspaceAccess } from "../middlewares/workspace-access";
import type { AppEnv } from "../types/hono";
import { zv } from "../utils/validate";
import { generateFakeDataSchema } from "../validations/beautify";
import {
  createFolderSchema,
  createResourceSchema,
  folderParamSchema,
  listResourcesQuerySchema,
  resourceParamSchema,
  updateFolderSchema,
  updateResourceSchema,
} from "../validations/resources";
import { workspaceIdParamSchema } from "../validations/workspaces";

export const resourcesRouter = new Hono<AppEnv>()
  // -- folders --
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

  .patch(
    "/:workspaceId/resource-folders/:folderId",
    zv("param", folderParamSchema),
    requireWorkspaceAccess("resource:write"),
    zv("json", updateFolderSchema),
    updateFolder,
  )

  .delete(
    "/:workspaceId/resource-folders/:folderId",
    zv("param", folderParamSchema),
    requireWorkspaceAccess("resource:delete"),
    deleteFolder,
  )

  // -- resources --
  .get(
    "/:workspaceId/resources",
    zv("param", workspaceIdParamSchema),
    zv("query", listResourcesQuerySchema),
    requireWorkspaceAccess("resource:read"),
    listResources,
  )

  .post(
    "/:workspaceId/resources",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("resource:write"),
    zv("json", createResourceSchema),
    createResource,
  )

  .get(
    "/:workspaceId/resources/:resourceId",
    zv("param", resourceParamSchema),
    requireWorkspaceAccess("resource:read"),
    getResource,
  )

  .patch(
    "/:workspaceId/resources/:resourceId",
    zv("param", resourceParamSchema),
    requireWorkspaceAccess("resource:write"),
    zv("json", updateResourceSchema),
    updateResource,
  )

  .delete(
    "/:workspaceId/resources/:resourceId",
    zv("param", resourceParamSchema),
    requireWorkspaceAccess("resource:delete"),
    deleteResource,
  )

  // -- beautify / faker (handover E/F) --
  .get(
    "/:workspaceId/resources/:resourceId/export-type",
    zv("param", resourceParamSchema),
    requireWorkspaceAccess("resource:read"),
    exportResourceType,
  )

  .post(
    "/:workspaceId/resources/:resourceId/fake-data",
    zv("param", resourceParamSchema),
    requireWorkspaceAccess("resource:read"),
    zv("json", generateFakeDataSchema),
    generateFakeData,
  );
