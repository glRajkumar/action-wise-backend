import { Hono } from "hono";

import {
  createBoard,
  createTile,
  deleteBoard,
  deleteTile,
  executeTile,
  getBoard,
  listBoards,
  listTiles,
  logFirebaseRun,
  promoteTile,
  updateBoard,
  updateTile,
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
    listBoards,
  )

  .post(
    "/:workspaceId/playground/boards",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", createBoardSchema),
    createBoard,
  )

  .get(
    "/:workspaceId/playground/boards/:boardId",
    zv("param", boardParamSchema),
    requireWorkspaceAccess("workspace:read"),
    getBoard,
  )

  .patch(
    "/:workspaceId/playground/boards/:boardId",
    zv("param", boardParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", updateBoardSchema),
    updateBoard,
  )

  .delete(
    "/:workspaceId/playground/boards/:boardId",
    zv("param", boardParamSchema),
    requireWorkspaceAccess("workspace:read"),
    deleteBoard,
  )

  .get(
    "/:workspaceId/playground/boards/:boardId/tiles",
    zv("param", boardParamSchema),
    requireWorkspaceAccess("workspace:read"),
    listTiles,
  )

  .post(
    "/:workspaceId/playground/boards/:boardId/tiles",
    zv("param", boardParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", createTileSchema),
    createTile,
  )

  .patch(
    "/:workspaceId/playground/tiles/:tileId",
    zv("param", tileOnlyParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", updateTileSchema),
    updateTile,
  )

  .delete(
    "/:workspaceId/playground/tiles/:tileId",
    zv("param", tileOnlyParamSchema),
    requireWorkspaceAccess("workspace:read"),
    deleteTile,
  )

  // Server-proxied execution — http tiles only. Firebase tiles run client-side
  // and use POST .../runs below to record the result instead.
  .post(
    "/:workspaceId/playground/tiles/:tileId/execute",
    zv("param", tileOnlyParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", executeTileSchema),
    executeTile,
  )

  .post(
    "/:workspaceId/playground/tiles/:tileId/runs",
    zv("param", tileOnlyParamSchema),
    requireWorkspaceAccess("workspace:read"),
    zv("json", logFirebaseRunSchema),
    logFirebaseRun,
  )

  .post(
    "/:workspaceId/playground/tiles/:tileId/promote",
    zv("param", tileOnlyParamSchema),
    requireWorkspaceAccess("resource:write"),
    zv("json", promoteTileSchema),
    promoteTile,
  );
