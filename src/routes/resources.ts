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

// Collection — mounted under /workspaces/:workspaceId/..., workspaceId says
// which workspace's folders/resources to list/create in.
export const resourcesCollectionRouter = new Hono<AppEnv>()
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
  );

// Item — mounted flat, folderId/resourceId alone identify the row; each
// controller derives workspaceId from it and calls assertWorkspaceAccess itself.
export const resourceItemsRouter = new Hono<AppEnv>()
  .get(
    "/:resourceId",
    zv("param", resourceParamSchema),
    getResource,
  )

  .patch(
    "/:resourceId",
    zv("param", resourceParamSchema),
    zv("json", updateResourceSchema),
    updateResource,
  )

  .delete("/:resourceId", zv("param", resourceParamSchema), deleteResource)

  // -- beautify / faker (handover E/F) --
  .get("/:resourceId/export-type", zv("param", resourceParamSchema), exportResourceType)

  .post(
    "/:resourceId/fake-data",
    zv("param", resourceParamSchema),
    zv("json", generateFakeDataSchema),
    generateFakeData,
  );

export const folderItemsRouter = new Hono<AppEnv>()
  .patch(
    "/:folderId",
    zv("param", folderParamSchema),
    zv("json", updateFolderSchema),
    updateFolder,
  )

  .delete("/:folderId", zv("param", folderParamSchema), deleteFolder);
