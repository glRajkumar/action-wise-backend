import { Hono } from "hono"

import { requireWorkspaceAccess } from "../middlewares/workspace-access"
import { requireItemAccess } from "../middlewares/item-access"

import { zv } from "../utils/validate"

import {
  createConnection,
  deleteConnection,
  deleteConnectionSecret,
  getConnection,
  listConnections,
  requireConnectionRow,
  setConnectionSecret,
  updateConnection,
} from "../controllers/connections"
import {
  connectionParamSchema,
  createConnectionSchema,
  setConnectionSecretSchema,
  updateConnectionSchema,
} from "../validations/connections"
import { workspaceIdParamSchema } from "../validations/workspaces"

export const connectionsCollectionRouter = new Hono()
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

export const connectionItemsRouter = new Hono()
  .get(
    "/:connectionId",
    zv("param", connectionParamSchema),
    requireItemAccess("connectionId", "connectionRow", requireConnectionRow, "connection:read"),
    getConnection,
  )
  .patch(
    "/:connectionId",
    zv("param", connectionParamSchema),
    requireItemAccess("connectionId", "connectionRow", requireConnectionRow, "connection:write"),
    zv("json", updateConnectionSchema),
    updateConnection,
  )
  .delete(
    "/:connectionId",
    zv("param", connectionParamSchema),
    requireItemAccess("connectionId", "connectionRow", requireConnectionRow, "connection:delete"),
    deleteConnection,
  )
  .put(
    "/:connectionId/secret",
    zv("param", connectionParamSchema),
    requireItemAccess("connectionId", "connectionRow", requireConnectionRow, "connection:read"),
    zv("json", setConnectionSecretSchema),
    setConnectionSecret,
  )
  .delete(
    "/:connectionId/secret",
    zv("param", connectionParamSchema),
    requireItemAccess("connectionId", "connectionRow", requireConnectionRow, "connection:read"),
    deleteConnectionSecret,
  )
