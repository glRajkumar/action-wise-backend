import { Hono } from "hono";

import { exportWorkspaceResourceType, generateWorkspaceResourceFakeData } from "../controllers/beautify";
import {
  createWorkspaceFolder,
  createWorkspaceResource,
  deleteWorkspaceFolder,
  deleteWorkspaceResource,
  getWorkspaceResource,
  listWorkspaceFolders,
  listWorkspaceResources,
  updateWorkspaceFolder,
  updateWorkspaceResource,
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
    async (c) => c.json(await listWorkspaceFolders(c.req.valid("param").workspaceId)),
  )

  .post(
    "/:workspaceId/resource-folders",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("resource:write"),
    zv("json", createFolderSchema),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const { name, parentFolderId } = c.req.valid("json");
      const folder = await createWorkspaceFolder(workspaceId, name, parentFolderId, c.get("userId"));
      return c.json(folder, 201);
    },
  )

  .patch(
    "/:workspaceId/resource-folders/:folderId",
    zv("param", folderParamSchema),
    requireWorkspaceAccess("resource:write"),
    zv("json", updateFolderSchema),
    async (c) => {
      const { workspaceId, folderId } = c.req.valid("param");
      const { name, parentFolderId } = c.req.valid("json");
      return c.json(await updateWorkspaceFolder(workspaceId, folderId, name, parentFolderId));
    },
  )

  .delete(
    "/:workspaceId/resource-folders/:folderId",
    zv("param", folderParamSchema),
    requireWorkspaceAccess("resource:delete"),
    async (c) => {
      const { workspaceId, folderId } = c.req.valid("param");
      await deleteWorkspaceFolder(workspaceId, folderId);
      return c.json({ message: "Folder deleted" });
    },
  )

  // -- resources --
  .get(
    "/:workspaceId/resources",
    zv("param", workspaceIdParamSchema),
    zv("query", listResourcesQuerySchema),
    requireWorkspaceAccess("resource:read"),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const { folderId } = c.req.valid("query");
      return c.json(await listWorkspaceResources(workspaceId, folderId));
    },
  )

  .post(
    "/:workspaceId/resources",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("resource:write"),
    zv("json", createResourceSchema),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const input = c.req.valid("json");
      const resource = await createWorkspaceResource(workspaceId, input, c.get("userId"));
      return c.json(resource, 201);
    },
  )

  .get(
    "/:workspaceId/resources/:resourceId",
    zv("param", resourceParamSchema),
    requireWorkspaceAccess("resource:read"),
    async (c) => {
      const { workspaceId, resourceId } = c.req.valid("param");
      return c.json(await getWorkspaceResource(workspaceId, resourceId));
    },
  )

  .patch(
    "/:workspaceId/resources/:resourceId",
    zv("param", resourceParamSchema),
    requireWorkspaceAccess("resource:write"),
    zv("json", updateResourceSchema),
    async (c) => {
      const { workspaceId, resourceId } = c.req.valid("param");
      const input = c.req.valid("json");
      return c.json(await updateWorkspaceResource(workspaceId, resourceId, input));
    },
  )

  .delete(
    "/:workspaceId/resources/:resourceId",
    zv("param", resourceParamSchema),
    requireWorkspaceAccess("resource:delete"),
    async (c) => {
      const { workspaceId, resourceId } = c.req.valid("param");
      await deleteWorkspaceResource(workspaceId, resourceId);
      return c.json({ message: "Resource deleted" });
    },
  )

  // -- beautify / faker (handover E/F) --
  .get(
    "/:workspaceId/resources/:resourceId/export-type",
    zv("param", resourceParamSchema),
    requireWorkspaceAccess("resource:read"),
    async (c) => {
      const { workspaceId, resourceId } = c.req.valid("param");
      return c.json(await exportWorkspaceResourceType(workspaceId, resourceId));
    },
  )

  .post(
    "/:workspaceId/resources/:resourceId/fake-data",
    zv("param", resourceParamSchema),
    requireWorkspaceAccess("resource:read"),
    zv("json", generateFakeDataSchema),
    async (c) => {
      const { workspaceId, resourceId } = c.req.valid("param");
      const { count } = c.req.valid("json");
      return c.json(await generateWorkspaceResourceFakeData(workspaceId, resourceId, count));
    },
  );
