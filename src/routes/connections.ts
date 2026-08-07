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
import { connectionParamSchema, createConnectionSchema, setConnectionSecretSchema, updateConnectionSchema } from "../validations/connections";
import { workspaceIdParamSchema } from "../validations/workspaces";

// Collection — mounted under /workspaces/:workspaceId/connections, workspaceId
// says which workspace's connections to list/create in.
export const connectionsCollectionRouter = new Hono<AppEnv>()
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
  );

// Item — mounted flat at /connections/:connectionId. connectionId alone
// identifies the row; each controller derives workspaceId from it and calls
// assertWorkspaceAccess itself instead of a path-driven middleware.
export const connectionItemsRouter = new Hono<AppEnv>()
  .get("/:connectionId", zv("param", connectionParamSchema), getConnection)

  .patch(
    "/:connectionId",
    zv("param", connectionParamSchema),
    zv("json", updateConnectionSchema),
    updateConnection,
  )

  .delete("/:connectionId", zv("param", connectionParamSchema), deleteConnection)

  // Setting/removing YOUR OWN secret only requires being able to see the
  // connection, not full write access — it doesn't change the shared config.
  .put(
    "/:connectionId/secret",
    zv("param", connectionParamSchema),
    zv("json", setConnectionSecretSchema),
    setConnectionSecret,
  )

  .delete("/:connectionId/secret", zv("param", connectionParamSchema), deleteConnectionSecret);
