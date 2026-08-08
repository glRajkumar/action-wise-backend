import { and, eq } from "drizzle-orm"
import type { Context } from "hono"

import type { AppEnv, zContext } from "../types/hono"

import { executeHttpResourceRun, type HttpResourceConfig } from "../services/execute-resource"
import { createResourceRow, type ResourceInput } from "../services/resources"

import { playgroundBoards, playgroundTiles } from "../db/schema/playground"
import { workspaceMembers } from "../db/schema/workspaces"
import { resources } from "../db/schema/resources"
import { runs } from "../db/schema/runs"
import { db } from "../lib/db"

import { AppError } from "../utils/errors"

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

type HttpAdhocConfig = {
  kind: "http"
  connectionId?: string
  address: string
  config: HttpResourceConfig
  payloadTemplate?: unknown
}

export async function requireBoard(boardId: string, userId: string) {
  const [row] = await db
    .select({ board: playgroundBoards, role: workspaceMembers.role })
    .from(playgroundBoards)
    .innerJoin(
      workspaceMembers,
      and(eq(workspaceMembers.workspaceId, playgroundBoards.workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .where(and(eq(playgroundBoards.id, boardId), eq(playgroundBoards.userId, userId)))
  if (!row) throw new AppError("Board not found", 404)
  return { ...row.board, role: row.role }
}

export async function requireTile(tileId: string, userId: string) {
  const [row] = await db
    .select({ tile: playgroundTiles, workspaceId: playgroundBoards.workspaceId, role: workspaceMembers.role })
    .from(playgroundTiles)
    .innerJoin(playgroundBoards, eq(playgroundTiles.boardId, playgroundBoards.id))
    .innerJoin(
      workspaceMembers,
      and(eq(workspaceMembers.workspaceId, playgroundBoards.workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .where(and(eq(playgroundTiles.id, tileId), eq(playgroundBoards.userId, userId)))
  if (!row) throw new AppError("Tile not found", 404)
  return { ...row.tile, workspaceId: row.workspaceId, role: row.role }
}

export async function listBoards(c: zContext<{ param: typeof workspaceIdParamSchema }>) {
  const { workspaceId } = c.req.valid("param")
  const userId = c.get("userId")
  const rows = await db
    .select()
    .from(playgroundBoards)
    .where(and(eq(playgroundBoards.workspaceId, workspaceId), eq(playgroundBoards.userId, userId)))
  return c.json(rows)
}

export async function createBoard(c: zContext<{ param: typeof workspaceIdParamSchema; json: typeof createBoardSchema }>) {
  const { workspaceId } = c.req.valid("param")
  const { name } = c.req.valid("json")
  const userId = c.get("userId")

  const [board] = await db
    .insert(playgroundBoards)
    .values({ workspaceId, userId, ...(name ? { name } : {}) })
    .returning()
  if (!board) throw new Error("Failed to create board")

  return c.json(board, 201)
}

export async function getBoard(c: Context<AppEnv>) {
  return c.json(c.get("boardRow"))
}

export async function updateBoard(c: zContext<{ param: typeof boardParamSchema; json: typeof updateBoardSchema }>) {
  const { boardId } = c.req.valid("param")
  const { name } = c.req.valid("json")

  const [board] = await db.update(playgroundBoards).set({ name }).where(eq(playgroundBoards.id, boardId)).returning()
  if (!board) throw new AppError("Board not found", 404)
  return c.json(board)
}

export async function deleteBoard(c: zContext<{ param: typeof boardParamSchema }>) {
  const { boardId } = c.req.valid("param")
  await db.delete(playgroundBoards).where(eq(playgroundBoards.id, boardId))
  return c.json({ message: "Board deleted" })
}

export async function listTiles(c: zContext<{ param: typeof boardParamSchema }>) {
  const { boardId } = c.req.valid("param")
  const rows = await db.select().from(playgroundTiles).where(eq(playgroundTiles.boardId, boardId))
  return c.json(rows)
}

export async function createTile(c: zContext<{ param: typeof boardParamSchema; json: typeof createTileSchema }>) {
  const { boardId } = c.req.valid("param")
  const input = c.req.valid("json")
  const board = c.get("boardRow")

  if (input.resourceId) {
    const [resource] = await db
      .select({ id: resources.id })
      .from(resources)
      .where(and(eq(resources.id, input.resourceId), eq(resources.workspaceId, board.workspaceId)))
    if (!resource) throw new AppError("Resource not found in this workspace", 400)
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
    .returning()
  if (!tile) throw new Error("Failed to create tile")

  return c.json(tile, 201)
}

export async function updateTile(c: zContext<{ param: typeof tileParamSchema; json: typeof updateTileSchema }>) {
  const { tileId } = c.req.valid("param")
  const input = c.req.valid("json")
  const tile = c.get("tileRow")

  if (input.adhocConfig !== undefined && tile.resourceId) {
    throw new AppError("Cannot set adhocConfig on a tile that already wraps a saved resource", 400)
  }

  const [updated] = await db
    .update(playgroundTiles)
    .set({
      ...(input.layout !== undefined ? { layout: input.layout } : {}),
      ...(input.renderMode !== undefined ? { renderMode: input.renderMode } : {}),
      ...(input.adhocConfig !== undefined ? { adhocConfig: input.adhocConfig } : {}),
    })
    .where(eq(playgroundTiles.id, tileId))
    .returning()

  if (!updated) throw new AppError("Tile not found", 404)
  return c.json(updated)
}

export async function deleteTile(c: zContext<{ param: typeof tileParamSchema }>) {
  const { tileId } = c.req.valid("param")
  await db.delete(playgroundTiles).where(eq(playgroundTiles.id, tileId))
  return c.json({ message: "Tile deleted" })
}

export async function executeTile(c: zContext<{ json: typeof executeTileSchema }>) {
  const { variables } = c.req.valid("json")
  const userId = c.get("userId")
  const tile = c.get("tileRow")
  const { workspaceId } = tile

  let connectionId: string | undefined
  let address: string
  let config: HttpResourceConfig
  let payloadTemplate: unknown
  let resourceId: string | null = null

  if (tile.resourceId) {
    const [resource] = await db.select().from(resources).where(eq(resources.id, tile.resourceId))
    if (!resource) throw new AppError("Resource not found", 404)
    if (resource.kind !== "http") throw new AppError("Only http resources can be executed server-side", 400)

    connectionId = resource.connectionId
    address = resource.address
    config = resource.config as HttpResourceConfig
    payloadTemplate = resource.payloadTemplate
    resourceId = resource.id
  } else {
    const adhoc = tile.adhocConfig as HttpAdhocConfig | null
    if (!adhoc || adhoc.kind !== "http") throw new AppError("Only http items can be executed server-side", 400)

    connectionId = adhoc.connectionId
    address = adhoc.address
    config = adhoc.config
    payloadTemplate = adhoc.payloadTemplate
  }

  const outcome = await executeHttpResourceRun(
    workspaceId,
    userId,
    { connectionId, address, config, payloadTemplate },
    variables ?? {},
    { resourceId },
  )

  if (!outcome.ok) throw new AppError(`Request execution failed: ${outcome.error}`, 400)
  return c.json(outcome.result)
}

export async function logFirebaseRun(c: zContext<{ json: typeof logFirebaseRunSchema }>) {
  const input = c.req.valid("json")
  const userId = c.get("userId")
  const tile = c.get("tileRow")

  const [run] = await db
    .insert(runs)
    .values({
      workspaceId: tile.workspaceId,
      resourceId: tile.resourceId,
      triggeredBy: userId,
      request: input.request,
      response: input.response,
      status: input.status,
      durationMs: input.durationMs,
      executedAt: new Date(),
    })
    .returning()
  if (!run) throw new Error("Failed to record run")

  return c.json(run, 201)
}

export async function promoteTile(c: zContext<{ param: typeof tileParamSchema; json: typeof promoteTileSchema }>) {
  const { tileId } = c.req.valid("param")
  const input = c.req.valid("json")
  const userId = c.get("userId")
  const tile = c.get("tileRow")

  if (tile.resourceId) throw new AppError("Tile is already backed by a saved resource", 400)
  if (!tile.adhocConfig) throw new AppError("Tile has no ad-hoc config to save", 400)

  const { workspaceId } = tile

  const adhoc = tile.adhocConfig as {
    kind: "http" | "firebase_rtdb" | "firebase_firestore"
    connectionId?: string
    address: string
    config: unknown
    payloadTemplate?: unknown
  }
  if (!adhoc.connectionId) throw new AppError("Select a connection before saving to registry", 400)

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
  }

  const resource = await createResourceRow(workspaceId, resourceInput, userId)

  const [updatedTile] = await db
    .update(playgroundTiles)
    .set({ resourceId: resource.id, adhocConfig: null })
    .where(eq(playgroundTiles.id, tileId))
    .returning()

  return c.json({ resource, tile: updatedTile }, 201)
}
