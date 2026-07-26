import { z } from "zod";

import { firebaseFirestoreConfigSchema, firebaseRtdbConfigSchema, httpConfigSchema } from "./resources";

// A Playground item's execution shape — same kind-specific config as a saved
// Resource, minus workspace/registry metadata (name/folder/direction/danger
// only get attached at "save to registry" time, see promoteTileSchema).
export const adhocConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("http"),
    connectionId: z.uuid().optional(),
    address: z.string().trim().min(1),
    config: httpConfigSchema,
    payloadTemplate: z.unknown().optional(),
  }),
  z.object({
    kind: z.literal("firebase_rtdb"),
    connectionId: z.uuid().optional(),
    address: z.string().trim().min(1),
    config: firebaseRtdbConfigSchema,
  }),
  z.object({
    kind: z.literal("firebase_firestore"),
    connectionId: z.uuid().optional(),
    address: z.string().trim().min(1),
    config: firebaseFirestoreConfigSchema,
  }),
]);

export const createBoardSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

export const updateBoardSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const boardParamSchema = z.object({
  workspaceId: z.uuid(),
  boardId: z.uuid(),
});

const tileLayoutSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

const renderModeSchema = z.enum(["json_tree", "table", "raw", "big_number"]);

export const createTileSchema = z
  .object({
    resourceId: z.uuid().optional(),
    adhocConfig: adhocConfigSchema.optional(),
    layout: tileLayoutSchema,
    renderMode: renderModeSchema.default("json_tree"),
  })
  .refine((tile) => Boolean(tile.resourceId) !== Boolean(tile.adhocConfig), {
    message: "Provide exactly one of resourceId or adhocConfig",
  });

export const updateTileSchema = z
  .object({
    layout: tileLayoutSchema.optional(),
    renderMode: renderModeSchema.optional(),
    adhocConfig: adhocConfigSchema.optional(),
  })
  .refine((tile) => tile.layout !== undefined || tile.renderMode !== undefined || tile.adhocConfig !== undefined, {
    message: "At least one field must be provided",
  });

export const tileOnlyParamSchema = z.object({
  workspaceId: z.uuid(),
  tileId: z.uuid(),
});

export const executeTileSchema = z.object({
  variables: z.record(z.string(), z.string()).optional(),
});

export const logFirebaseRunSchema = z.object({
  request: z.unknown(),
  response: z.unknown().optional(),
  status: z.enum(["success", "error"]),
  durationMs: z.number().int().nonnegative().optional(),
});

export const promoteTileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  folderId: z.uuid().nullable().optional(),
  direction: z.enum(["invoke", "subscribe", "receive"]),
  danger: z.enum(["safe", "mutating", "destructive"]),
});
