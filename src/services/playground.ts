import { and, eq } from "drizzle-orm";

import { playgroundBoards, playgroundTiles } from "../db/schema/playground";
import { resources } from "../db/schema/resources";
import { runs } from "../db/schema/runs";
import { db } from "../lib/db";
import { AppError } from "../utils/errors";
import { executeHttpResourceRun, type HttpResourceConfig } from "./execute-resource";
import { createResource, type ResourceInput } from "./resources";

type RenderMode = "json_tree" | "table" | "raw" | "big_number";
type TileLayout = { x: number; y: number; w: number; h: number };

type HttpAdhocConfig = {
  kind: "http";
  connectionId?: string;
  address: string;
  config: HttpResourceConfig;
  payloadTemplate?: unknown;
};

// -- Boards --

export async function createBoard(workspaceId: string, userId: string, name?: string) {
  const [board] = await db
    .insert(playgroundBoards)
    .values({ workspaceId, userId, ...(name ? { name } : {}) })
    .returning();
  if (!board) throw new Error("Failed to create board");
  return board;
}

export async function listBoards(workspaceId: string, userId: string) {
  return db
    .select()
    .from(playgroundBoards)
    .where(and(eq(playgroundBoards.workspaceId, workspaceId), eq(playgroundBoards.userId, userId)));
}

async function findOwnedBoard(workspaceId: string, boardId: string, userId: string) {
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
  return board ?? null;
}

export async function getBoard(workspaceId: string, boardId: string, userId: string) {
  const board = await findOwnedBoard(workspaceId, boardId, userId);
  if (!board) throw new AppError("Board not found", 404);
  return board;
}

export async function updateBoard(workspaceId: string, boardId: string, userId: string, name: string) {
  await getBoard(workspaceId, boardId, userId);
  const [board] = await db.update(playgroundBoards).set({ name }).where(eq(playgroundBoards.id, boardId)).returning();
  if (!board) throw new AppError("Board not found", 404);
  return board;
}

export async function deleteBoard(workspaceId: string, boardId: string, userId: string) {
  await getBoard(workspaceId, boardId, userId);
  await db.delete(playgroundBoards).where(eq(playgroundBoards.id, boardId));
}

// -- Tiles --

export type TileInput = {
  resourceId?: string;
  adhocConfig?: Record<string, unknown>;
  layout: TileLayout;
  renderMode: RenderMode;
};

export async function listTiles(workspaceId: string, boardId: string, userId: string) {
  await getBoard(workspaceId, boardId, userId);
  return db.select().from(playgroundTiles).where(eq(playgroundTiles.boardId, boardId));
}

export async function createTile(workspaceId: string, boardId: string, userId: string, input: TileInput) {
  await getBoard(workspaceId, boardId, userId);

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
  return tile;
}

async function findOwnedTile(workspaceId: string, tileId: string, userId: string) {
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
  return row?.tile ?? null;
}

export async function getTile(workspaceId: string, tileId: string, userId: string) {
  const tile = await findOwnedTile(workspaceId, tileId, userId);
  if (!tile) throw new AppError("Tile not found", 404);
  return tile;
}

export async function updateTile(
  workspaceId: string,
  tileId: string,
  userId: string,
  input: { layout?: TileLayout; renderMode?: RenderMode; adhocConfig?: Record<string, unknown> },
) {
  const tile = await getTile(workspaceId, tileId, userId);
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
  return updated;
}

export async function deleteTile(workspaceId: string, tileId: string, userId: string) {
  await getTile(workspaceId, tileId, userId);
  await db.delete(playgroundTiles).where(eq(playgroundTiles.id, tileId));
}

// -- Execution --

// Server-proxied HTTP execution (handover D). Firebase tiles execute
// client-side and are recorded via `logFirebaseRun` instead — see
// ../../DECISIONS.md for why the two paths differ.
export async function executeTile(
  workspaceId: string,
  tileId: string,
  userId: string,
  variables: Record<string, string> = {},
) {
  const tile = await getTile(workspaceId, tileId, userId);

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
    variables,
    { resourceId },
  );

  if (!outcome.ok) throw new AppError(`Request execution failed: ${outcome.error}`, 400);
  return outcome.result;
}

export async function logFirebaseRun(
  workspaceId: string,
  tileId: string,
  userId: string,
  input: { request: unknown; response?: unknown; status: "success" | "error"; durationMs?: number },
) {
  const tile = await getTile(workspaceId, tileId, userId);

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
  return run;
}

// -- Save to registry --

type PromoteInput = {
  name: string;
  folderId?: string | null;
  direction: "invoke" | "subscribe" | "receive";
  danger: "safe" | "mutating" | "destructive";
};

export async function promoteTile(workspaceId: string, tileId: string, userId: string, input: PromoteInput) {
  const tile = await getTile(workspaceId, tileId, userId);
  if (tile.resourceId) throw new AppError("Tile is already backed by a saved resource", 400);
  if (!tile.adhocConfig) throw new AppError("Tile has no ad-hoc config to save", 400);

  const adhoc = tile.adhocConfig as { kind: "http" | "firebase_rtdb" | "firebase_firestore"; connectionId?: string; address: string; config: unknown; payloadTemplate?: unknown };
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

  const resource = await createResource(workspaceId, resourceInput, userId);

  const [updatedTile] = await db
    .update(playgroundTiles)
    .set({ resourceId: resource.id, adhocConfig: null })
    .where(eq(playgroundTiles.id, tileId))
    .returning();

  return { resource, tile: updatedTile };
}
