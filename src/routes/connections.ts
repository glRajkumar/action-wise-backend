import { Hono } from "hono";

import {
  createConnection,
  deleteConnection,
  deleteConnectionSecret,
  getConnection,
  listConnections,
  setConnectionSecret,
  updateConnection,
} from "../controllers/connections";
import { requireWorkspaceAccess } from "../middlewares/workspace-access";
import type { AppEnv } from "../types/hono";
import { zv } from "../utils/validate";
import {
  connectionParamSchema,
  createConnectionSchema,
  setConnectionSecretSchema,
  updateConnectionSchema,
} from "../validations/connections";
import { workspaceIdParamSchema } from "../validations/workspaces";

export const connectionsRouter = new Hono<AppEnv>()
  .get(
    "/:workspaceId/connections",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("connection:read"),
    listConnections,
  )

  .post(
    "/:workspaceId/connections",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("connection:write"),
    zv("json", createConnectionSchema),
    createConnection,
  )

  .get(
    "/:workspaceId/connections/:connectionId",
    zv("param", connectionParamSchema),
    requireWorkspaceAccess("connection:read"),
    getConnection,
  )

  .patch(
    "/:workspaceId/connections/:connectionId",
    zv("param", connectionParamSchema),
    requireWorkspaceAccess("connection:write"),
    zv("json", updateConnectionSchema),
    updateConnection,
  )

  .delete(
    "/:workspaceId/connections/:connectionId",
    zv("param", connectionParamSchema),
    requireWorkspaceAccess("connection:delete"),
    deleteConnection,
  )

  // Setting/removing YOUR OWN secret only requires being able to see the
  // connection, not full write access — it doesn't change the shared config.
  .put(
    "/:workspaceId/connections/:connectionId/secret",
    zv("param", connectionParamSchema),
    requireWorkspaceAccess("connection:read"),
    zv("json", setConnectionSecretSchema),
    setConnectionSecret,
  )

  .delete(
    "/:workspaceId/connections/:connectionId/secret",
    zv("param", connectionParamSchema),
    requireWorkspaceAccess("connection:read"),
    deleteConnectionSecret,
  );
