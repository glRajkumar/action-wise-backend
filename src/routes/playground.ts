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
  tileParamSchema,
  updateBoardSchema,
  updateTileSchema,
} from "../validations/playground";
import { workspaceIdParamSchema } from "../validations/workspaces";

// Collection — mounted under /workspaces/:workspaceId/playground/boards,
// workspaceId says which workspace's boards to list/create in.
export const playgroundCollectionRouter = new Hono<AppEnv>()
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
  );

// Item — mounted flat at /playground. boardId/tileId alone identify the row;
// each controller derives workspaceId from it and calls assertWorkspaceAccess
// itself. Playground is a personal scratchpad, gated on plain workspace
// membership — only "save to registry" (promote) needs resource:write.
export const playgroundItemsRouter = new Hono<AppEnv>()
  .get("/boards/:boardId", zv("param", boardParamSchema), getBoard)

  .patch(
    "/boards/:boardId",
    zv("param", boardParamSchema),
    zv("json", updateBoardSchema),
    updateBoard,
  )

  .delete("/boards/:boardId", zv("param", boardParamSchema), deleteBoard)

  .get("/boards/:boardId/tiles", zv("param", boardParamSchema), listTiles)

  .post(
    "/boards/:boardId/tiles",
    zv("param", boardParamSchema),
    zv("json", createTileSchema),
    createTile,
  )

  .patch(
    "/tiles/:tileId",
    zv("param", tileParamSchema),
    zv("json", updateTileSchema),
    updateTile,
  )

  .delete("/tiles/:tileId", zv("param", tileParamSchema), deleteTile)

  // Server-proxied execution — http tiles only. Firebase tiles run client-side
  // and use POST .../runs below to record the result instead.
  .post(
    "/tiles/:tileId/execute",
    zv("param", tileParamSchema),
    zv("json", executeTileSchema),
    executeTile,
  )

  .post(
    "/tiles/:tileId/runs",
    zv("param", tileParamSchema),
    zv("json", logFirebaseRunSchema),
    logFirebaseRun,
  )

  .post(
    "/tiles/:tileId/promote",
    zv("param", tileParamSchema),
    zv("json", promoteTileSchema),
    promoteTile,
  );
