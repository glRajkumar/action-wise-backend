import { z } from "zod";

// Exported for reuse in validations/playground.ts — a Playground ad-hoc item
// has the same shape as a Resource's kind-specific config, just not saved yet.
export const httpConfigSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  headers: z.record(z.string(), z.string()).optional(),
  queryParams: z.record(z.string(), z.string()).optional(),
  bodyType: z.enum(["json", "form", "raw", "none"]).default("none"),
});

export const firebaseRtdbConfigSchema = z.object({
  mode: z.enum(["read_once", "listen", "write"]),
  eventFilter: z.enum(["value", "child_added", "child_changed", "child_removed"]).optional(),
});

export const firebaseFirestoreConfigSchema = z.object({
  mode: z.enum(["read_once", "listen", "write"]),
});

const resourceFields = {
  name: z.string().trim().min(1).max(200),
  folderId: z.uuid().nullable().optional(),
  connectionId: z.uuid(),
  direction: z.enum(["invoke", "subscribe", "receive"]),
  danger: z.enum(["safe", "mutating", "destructive"]),
  address: z.string().trim().min(1),
  payloadTemplate: z.unknown().optional(),
};

// Same shape used for create and update — a resource's `kind` is immutable
// (changing it changes the whole config shape), enforced in the controller,
// not the schema, since Zod alone can't compare against the existing row.
export const createResourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("http"), ...resourceFields, config: httpConfigSchema }),
  z.object({ kind: z.literal("firebase_rtdb"), ...resourceFields, config: firebaseRtdbConfigSchema }),
  z.object({ kind: z.literal("firebase_firestore"), ...resourceFields, config: firebaseFirestoreConfigSchema }),
]);

export const updateResourceSchema = createResourceSchema;

export const resourceParamSchema = z.object({
  resourceId: z.uuid(),
});

export const listResourcesQuerySchema = z.object({
  folderId: z.uuid().optional(),
});

export const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentFolderId: z.uuid().nullable().optional(),
});

export const updateFolderSchema = createFolderSchema;

export const folderParamSchema = z.object({
  folderId: z.uuid(),
});
