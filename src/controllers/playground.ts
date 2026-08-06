import { and, eq } from "drizzle-orm";
import type { Context } from "hono";

import { playgroundBoards, playgroundTiles } from "../db/schema/playground";
import { resources } from "../db/schema/resources";
import { runs } from "../db/schema/runs";
import { db } from "../lib/db";
import { executeHttpResourceRun, type HttpResourceConfig } from "../services/execute-resource";
import { createResourceRow, type ResourceInput } from "../services/resources";
import type { AppEnv } from "../types/hono";
import { AppError } from "../utils/errors";

type RenderMode = "json_tree" | "table" | "raw" | "big_number";
type TileLayout = { x: number; y: number; w: number; h: number };

type HttpAdhocConfig = {
  kind: "http";
  connectionId?: string;
  address: string;
  config: HttpResourceConfig;
  payloadTemplate?: unknown;
};

async function requireBoard(workspaceId: string, boardId: string, userId: string) {
  const [board] = await db
    .select()
    .from(playgroundBoards)
    .where(
      and(
        eq(playgroundBoards.id, boardId),
        eq(playgroundBoards.workspaceId, workspaceId),
        eq(playgroundBoards.userId, userId),
      ),
    );
  if (!board) throw new AppError("Board not found", 404);
  return board;
}

async function requireTile(workspaceId: string, tileId: string, userId: string) {
  const [row] = await db
    .select({ tile: playgroundTiles, board: playgroundBoards })
    .from(playgroundTiles)
    .innerJoin(playgroundBoards, eq(playgroundTiles.boardId, playgroundBoards.id))
    .where(
      and(
        eq(playgroundTiles.id, tileId),
        eq(playgroundBoards.workspaceId, workspaceId),
        eq(playgroundBoards.userId, userId),
      ),
    );
  if (!row) throw new AppError("Tile not found", 404);
  return row.tile;
}

// -- Boards --

export async function listBoards(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(playgroundBoards)
    .where(and(eq(playgroundBoards.workspaceId, workspaceId), eq(playgroundBoards.userId, userId)));
  return c.json(rows);
}

export async function createBoard(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const { name } = c.req.valid("json" as never) as { name?: string };
  const userId = c.get("userId");

  const [board] = await db
    .insert(playgroundBoards)
    .values({ workspaceId, userId, ...(name ? { name } : {}) })
    .returning();
  if (!board) throw new Error("Failed to create board");

  return c.json(board, 201);
}

export async function getBoard(c: Context<AppEnv>) {
  const { workspaceId, boardId } = c.req.valid("param" as never) as { workspaceId: string; boardId: string };
  const board = await requireBoard(workspaceId, boardId, c.get("userId"));
  return c.json(board);
}

export async function updateBoard(c: Context<AppEnv>) {
  const { workspaceId, boardId } = c.req.valid("param" as never) as { workspaceId: string; boardId: string };
  const { name } = c.req.valid("json" as never) as { name: string };
  await requireBoard(workspaceId, boardId, c.get("userId"));

  const [board] = await db.update(playgroundBoards).set({ name }).where(eq(playgroundBoards.id, boardId)).returning();
  if (!board) throw new AppError("Board not found", 404);
  return c.json(board);
}

export async function deleteBoard(c: Context<AppEnv>) {
  const { workspaceId, boardId } = c.req.valid("param" as never) as { workspaceId: string; boardId: string };
  await requireBoard(workspaceId, boardId, c.get("userId"));
  await db.delete(playgroundBoards).where(eq(playgroundBoards.id, boardId));
  return c.json({ message: "Board deleted" });
}

// -- Tiles --

export async function listTiles(c: Context<AppEnv>) {
  const { workspaceId, boardId } = c.req.valid("param" as never) as { workspaceId: string; boardId: string };
  await requireBoard(workspaceId, boardId, c.get("userId"));
  const rows = await db.select().from(playgroundTiles).where(eq(playgroundTiles.boardId, boardId));
  return c.json(rows);
}

export async function createTile(c: Context<AppEnv>) {
  const { workspaceId, boardId } = c.req.valid("param" as never) as { workspaceId: string; boardId: string };
  const input = c.req.valid("json" as never) as {
    resourceId?: string;
    adhocConfig?: Record<string, unknown>;
    layout: TileLayout;
    renderMode: RenderMode;
  };
  await requireBoard(workspaceId, boardId, c.get("userId"));

  if (input.resourceId) {
    const [resource] = await db
      .select({ id: resources.id })
      .from(resources)
      .where(and(eq(resources.id, input.resourceId), eq(resources.workspaceId, workspaceId)));
    if (!resource) throw new AppError("Resource not found in this workspace", 400);
  }

  const [tile] = await db
    .insert(playgroundTiles)
    .values({
      boardId,
      resourceId: input.resourceId ?? null,
      adhocConfig: input.adhocConfig ?? null,
      layout: input.layout,
      renderMode: input.renderMode,
    })
    .returning();
  if (!tile) throw new Error("Failed to create tile");

  return c.json(tile, 201);
}

export async function updateTile(c: Context<AppEnv>) {
  const { workspaceId, tileId } = c.req.valid("param" as never) as { workspaceId: string; tileId: string };
  const input = c.req.valid("json" as never) as {
    layout?: TileLayout;
    renderMode?: RenderMode;
    adhocConfig?: Record<string, unknown>;
  };
  const tile = await requireTile(workspaceId, tileId, c.get("userId"));

  if (input.adhocConfig !== undefined && tile.resourceId) {
    throw new AppError("Cannot set adhocConfig on a tile that already wraps a saved resource", 400);
  }

  const [updated] = await db
    .update(playgroundTiles)
    .set({
      ...(input.layout !== undefined ? { layout: input.layout } : {}),
      ...(input.renderMode !== undefined ? { renderMode: input.renderMode } : {}),
      ...(input.adhocConfig !== undefined ? { adhocConfig: input.adhocConfig } : {}),
    })
    .where(eq(playgroundTiles.id, tileId))
    .returning();

  if (!updated) throw new AppError("Tile not found", 404);
  return c.json(updated);
}

export async function deleteTile(c: Context<AppEnv>) {
  const { workspaceId, tileId } = c.req.valid("param" as never) as { workspaceId: string; tileId: string };
  await requireTile(workspaceId, tileId, c.get("userId"));
  await db.delete(playgroundTiles).where(eq(playgroundTiles.id, tileId));
  return c.json({ message: "Tile deleted" });
}

// -- Execution --

// Server-proxied HTTP execution (handover D). Firebase tiles execute
// client-side and are recorded via `logFirebaseRun` instead — see
// ../../DECISIONS.md for why the two paths differ.
export async function executeTile(c: Context<AppEnv>) {
  const { workspaceId, tileId } = c.req.valid("param" as never) as { workspaceId: string; tileId: string };
  const { variables } = c.req.valid("json" as never) as { variables?: Record<string, string> };
  const userId = c.get("userId");

  const tile = await requireTile(workspaceId, tileId, userId);

  let connectionId: string | undefined;
  let address: string;
  let config: HttpResourceConfig;
  let payloadTemplate: unknown;
  let resourceId: string | null = null;

  if (tile.resourceId) {
    const [resource] = await db.select().from(resources).where(eq(resources.id, tile.resourceId));
    if (!resource) throw new AppError("Resource not found", 404);
    if (resource.kind !== "http") throw new AppError("Only http resources can be executed server-side", 400);

    connectionId = resource.connectionId;
    address = resource.address;
    config = resource.config as HttpResourceConfig;
    payloadTemplate = resource.payloadTemplate;
    resourceId = resource.id;
  } else {
    const adhoc = tile.adhocConfig as HttpAdhocConfig | null;
    if (!adhoc || adhoc.kind !== "http") throw new AppError("Only http items can be executed server-side", 400);

    connectionId = adhoc.connectionId;
    address = adhoc.address;
    config = adhoc.config;
    payloadTemplate = adhoc.payloadTemplate;
  }

  const outcome = await executeHttpResourceRun(
    workspaceId,
    userId,
    { connectionId, address, config, payloadTemplate },
    variables ?? {},
    { resourceId },
  );

  if (!outcome.ok) throw new AppError(`Request execution failed: ${outcome.error}`, 400);
  return c.json(outcome.result);
}

export async function logFirebaseRun(c: Context<AppEnv>) {
  const { workspaceId, tileId } = c.req.valid("param" as never) as { workspaceId: string; tileId: string };
  const input = c.req.valid("json" as never) as {
    request: unknown;
    response?: unknown;
    status: "success" | "error";
    durationMs?: number;
  };
  const userId = c.get("userId");

  const tile = await requireTile(workspaceId, tileId, userId);

  const [run] = await db
    .insert(runs)
    .values({
      workspaceId,
      resourceId: tile.resourceId,
      triggeredBy: userId,
      request: input.request,
      response: input.response,
      status: input.status,
      durationMs: input.durationMs,
      executedAt: new Date(),
    })
    .returning();
  if (!run) throw new Error("Failed to record run");

  return c.json(run, 201);
}

// -- Save to registry --

export async function promoteTile(c: Context<AppEnv>) {
  const { workspaceId, tileId } = c.req.valid("param" as never) as { workspaceId: string; tileId: string };
  const input = c.req.valid("json" as never) as {
    name: string;
    folderId?: string | null;
    direction: "invoke" | "subscribe" | "receive";
    danger: "safe" | "mutating" | "destructive";
  };
  const userId = c.get("userId");

  const tile = await requireTile(workspaceId, tileId, userId);
  if (tile.resourceId) throw new AppError("Tile is already backed by a saved resource", 400);
  if (!tile.adhocConfig) throw new AppError("Tile has no ad-hoc config to save", 400);

  const adhoc = tile.adhocConfig as {
    kind: "http" | "firebase_rtdb" | "firebase_firestore";
    connectionId?: string;
    address: string;
    config: unknown;
    payloadTemplate?: unknown;
  };
  if (!adhoc.connectionId) throw new AppError("Select a connection before saving to registry", 400);

  const resourceInput: ResourceInput = {
    kind: adhoc.kind,
    name: input.name,
    folderId: input.folderId,
    connectionId: adhoc.connectionId,
    direction: input.direction,
    danger: input.danger,
    address: adhoc.address,
    payloadTemplate: adhoc.payloadTemplate,
    config: adhoc.config,
  };

  const resource = await createResourceRow(workspaceId, resourceInput, userId);

  const [updatedTile] = await db
    .update(playgroundTiles)
    .set({ resourceId: resource.id, adhocConfig: null })
    .where(eq(playgroundTiles.id, tileId))
    .returning();

  return c.json({ resource, tile: updatedTile }, 201);
}
