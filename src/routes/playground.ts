import { Hono } from "hono";

import {
  createBoardTile,
  createWorkspaceBoard,
  deleteBoardTile,
  deleteWorkspaceBoard,
  executeBoardTile,
  getWorkspaceBoard,
  listBoardTiles,
  listWorkspaceBoards,
  logBoardTileFirebaseRun,
  promoteBoardTile,
  renameWorkspaceBoard,
  updateBoardTile,
} from "../controllers/playground";
import { requireWorkspaceAccess } from "../middlewares/workspace-access";
import type { AppEnv } from "../types/hono";
import { zv } from "../utils/validate";
import {
  boardParamSchema,
  createBoardSchema,
  createTileSchema,
  executeTileSchema,
  logFirebaseRunSchema,
  promoteTileSchema,
  tileOnlyParamSchema,
  updateBoardSchema,
  updateTileSchema,
} from "../validations/playground";
import { workspaceIdParamSchema } from "../validations/workspaces";

// Playground is a personal scratchpad: any workspace member (any role) can use
// their own boards/tiles, gated on plain workspace membership. Only
// "save to registry" (promote) touches shared state and needs resource:write.
export const playgroundRouter = new Hono<AppEnv>()
  .get(
    "/:workspaceId/playground/boards",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:read"),
    async (c) => c.json(await listWorkspaceBoards(c.req.valid("param").workspaceId, c.get("userId"))),
  )

  .post(
    "/:workspaceId/playground/boards",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", createBoardSchema),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const { name } = c.req.valid("json");
      const board = await createWorkspaceBoard(workspaceId, c.get("userId"), name);
      return c.json(board, 201);
    },
  )

  .get(
    "/:workspaceId/playground/boards/:boardId",
    zv("param", boardParamSchema),
    requireWorkspaceAccess("workspace:read"),
    async (c) => {
      const { workspaceId, boardId } = c.req.valid("param");
      return c.json(await getWorkspaceBoard(workspaceId, boardId, c.get("userId")));
    },
  )

  .patch(
    "/:workspaceId/playground/boards/:boardId",
    zv("param", boardParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", updateBoardSchema),
    async (c) => {
      const { workspaceId, boardId } = c.req.valid("param");
      const { name } = c.req.valid("json");
      return c.json(await renameWorkspaceBoard(workspaceId, boardId, c.get("userId"), name));
    },
  )

  .delete(
    "/:workspaceId/playground/boards/:boardId",
    zv("param", boardParamSchema),
    requireWorkspaceAccess("workspace:read"),
    async (c) => {
      const { workspaceId, boardId } = c.req.valid("param");
      await deleteWorkspaceBoard(workspaceId, boardId, c.get("userId"));
      return c.json({ message: "Board deleted" });
    },
  )

  .get(
    "/:workspaceId/playground/boards/:boardId/tiles",
    zv("param", boardParamSchema),
    requireWorkspaceAccess("workspace:read"),
    async (c) => {
      const { workspaceId, boardId } = c.req.valid("param");
      return c.json(await listBoardTiles(workspaceId, boardId, c.get("userId")));
    },
  )

  .post(
    "/:workspaceId/playground/boards/:boardId/tiles",
    zv("param", boardParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", createTileSchema),
    async (c) => {
      const { workspaceId, boardId } = c.req.valid("param");
      const tile = await createBoardTile(workspaceId, boardId, c.get("userId"), c.req.valid("json"));
      return c.json(tile, 201);
    },
  )

  .patch(
    "/:workspaceId/playground/tiles/:tileId",
    zv("param", tileOnlyParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", updateTileSchema),
    async (c) => {
      const { workspaceId, tileId } = c.req.valid("param");
      return c.json(await updateBoardTile(workspaceId, tileId, c.get("userId"), c.req.valid("json")));
    },
  )

  .delete(
    "/:workspaceId/playground/tiles/:tileId",
    zv("param", tileOnlyParamSchema),
    requireWorkspaceAccess("workspace:read"),
    async (c) => {
      const { workspaceId, tileId } = c.req.valid("param");
      await deleteBoardTile(workspaceId, tileId, c.get("userId"));
      return c.json({ message: "Tile deleted" });
    },
  )

  // Server-proxied execution — http tiles only. Firebase tiles run client-side
  // and use POST .../runs below to record the result instead.
  .post(
    "/:workspaceId/playground/tiles/:tileId/execute",
    zv("param", tileOnlyParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", executeTileSchema),
    async (c) => {
      const { workspaceId, tileId } = c.req.valid("param");
      const { variables } = c.req.valid("json");
      return c.json(await executeBoardTile(workspaceId, tileId, c.get("userId"), variables));
    },
  )

  .post(
    "/:workspaceId/playground/tiles/:tileId/runs",
    zv("param", tileOnlyParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", logFirebaseRunSchema),
    async (c) => {
      const { workspaceId, tileId } = c.req.valid("param");
      const run = await logBoardTileFirebaseRun(workspaceId, tileId, c.get("userId"), c.req.valid("json"));
      return c.json(run, 201);
    },
  )

  .post(
    "/:workspaceId/playground/tiles/:tileId/promote",
    zv("param", tileOnlyParamSchema),
    requireWorkspaceAccess("resource:write"),
    zv("json", promoteTileSchema),
    async (c) => {
      const { workspaceId, tileId } = c.req.valid("param");
      const result = await promoteBoardTile(workspaceId, tileId, c.get("userId"), c.req.valid("json"));
      return c.json(result, 201);
    },
  );
