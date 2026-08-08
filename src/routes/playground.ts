import { Hono } from "hono"

import { requireWorkspaceAccess } from "../middlewares/workspace-access"
import { requireItemAccess } from "../middlewares/item-access"

import { zv } from "../utils/validate"

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
  requireBoard,
  requireTile,
  updateBoard,
  updateTile,
} from "../controllers/playground"
import {
  boardParamSchema,
  createBoardSchema,
  createTileSchema,
  executeTileSchema,
  logFirebaseRunSchema,
  promoteTileSchema,
  tileParamSchema,
  updateBoardSchema,
  updateTileSchema,
} from "../validations/playground"
import { workspaceIdParamSchema } from "../validations/workspaces"

export const playgroundCollectionRouter = new Hono()
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

export const playgroundItemsRouter = new Hono()
  .get(
    "/boards/:boardId",
    zv("param", boardParamSchema),
    requireItemAccess("boardId", "boardRow", requireBoard, "workspace:read"),
    getBoard,
  )
  .patch(
    "/boards/:boardId",
    zv("param", boardParamSchema),
    requireItemAccess("boardId", "boardRow", requireBoard, "workspace:read"),
    zv("json", updateBoardSchema),
    updateBoard,
  )
  .delete(
    "/boards/:boardId",
    zv("param", boardParamSchema),
    requireItemAccess("boardId", "boardRow", requireBoard, "workspace:read"),
    deleteBoard,
  )
  .get(
    "/boards/:boardId/tiles",
    zv("param", boardParamSchema),
    requireItemAccess("boardId", "boardRow", requireBoard, "workspace:read"),
    listTiles,
  )
  .post(
    "/boards/:boardId/tiles",
    zv("param", boardParamSchema),
    requireItemAccess("boardId", "boardRow", requireBoard, "workspace:read"),
    zv("json", createTileSchema),
    createTile,
  )
  .patch(
    "/tiles/:tileId",
    zv("param", tileParamSchema),
    requireItemAccess("tileId", "tileRow", requireTile, "workspace:read"),
    zv("json", updateTileSchema),
    updateTile,
  )
  .delete(
    "/tiles/:tileId",
    zv("param", tileParamSchema),
    requireItemAccess("tileId", "tileRow", requireTile, "workspace:read"),
    deleteTile,
  )
  .post(
    "/tiles/:tileId/execute",
    zv("param", tileParamSchema),
    requireItemAccess("tileId", "tileRow", requireTile, "workspace:read"),
    zv("json", executeTileSchema),
    executeTile,
  )
  .post(
    "/tiles/:tileId/runs",
    zv("param", tileParamSchema),
    requireItemAccess("tileId", "tileRow", requireTile, "workspace:read"),
    zv("json", logFirebaseRunSchema),
    logFirebaseRun,
  )
  .post(
    "/tiles/:tileId/promote",
    zv("param", tileParamSchema),
    requireItemAccess("tileId", "tileRow", requireTile, "resource:write"),
    zv("json", promoteTileSchema),
    promoteTile,
  )
