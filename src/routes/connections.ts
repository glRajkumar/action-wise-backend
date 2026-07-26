import { Hono } from "hono";

import {
  createWorkspaceConnection,
  deleteMyConnectionSecret,
  deleteWorkspaceConnection,
  getWorkspaceConnection,
  listWorkspaceConnections,
  setMyConnectionSecret,
  updateWorkspaceConnection,
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
    async (c) => c.json(await listWorkspaceConnections(c.req.valid("param").workspaceId, c.get("userId"))),
  )

  .post(
    "/:workspaceId/connections",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("connection:write"),
    zv("json", createConnectionSchema),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const { kind, name, config } = c.req.valid("json");
      const connection = await createWorkspaceConnection(workspaceId, kind, name, config, c.get("userId"));
      return c.json(connection, 201);
    },
  )

  .get(
    "/:workspaceId/connections/:connectionId",
    zv("param", connectionParamSchema),
    requireWorkspaceAccess("connection:read"),
    async (c) => {
      const { workspaceId, connectionId } = c.req.valid("param");
      return c.json(await getWorkspaceConnection(workspaceId, connectionId, c.get("userId")));
    },
  )

  .patch(
    "/:workspaceId/connections/:connectionId",
    zv("param", connectionParamSchema),
    requireWorkspaceAccess("connection:write"),
    zv("json", updateConnectionSchema),
    async (c) => {
      const { workspaceId, connectionId } = c.req.valid("param");
      const { kind, name, config } = c.req.valid("json");
      return c.json(await updateWorkspaceConnection(workspaceId, connectionId, kind, name, config));
    },
  )

  .delete(
    "/:workspaceId/connections/:connectionId",
    zv("param", connectionParamSchema),
    requireWorkspaceAccess("connection:delete"),
    async (c) => {
      const { workspaceId, connectionId } = c.req.valid("param");
      await deleteWorkspaceConnection(workspaceId, connectionId);
      return c.json({ message: "Connection deleted" });
    },
  )

  // Setting/removing YOUR OWN secret only requires being able to see the
  // connection, not full write access — it doesn't change the shared config.
  .put(
    "/:workspaceId/connections/:connectionId/secret",
    zv("param", connectionParamSchema),
    requireWorkspaceAccess("connection:read"),
    zv("json", setConnectionSecretSchema),
    async (c) => {
      const { connectionId } = c.req.valid("param");
      const { value } = c.req.valid("json");
      await setMyConnectionSecret(connectionId, c.get("userId"), value);
      return c.json({ message: "Secret saved" });
    },
  )

  .delete(
    "/:workspaceId/connections/:connectionId/secret",
    zv("param", connectionParamSchema),
    requireWorkspaceAccess("connection:read"),
    async (c) => {
      const { connectionId } = c.req.valid("param");
      await deleteMyConnectionSecret(connectionId, c.get("userId"));
      return c.json({ message: "Secret deleted" });
    },
  );
