import { z } from "zod";

const httpConnectionAuthSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("bearer") }),
  z.object({ type: z.literal("apiKey"), headerName: z.string().trim().min(1) }),
  z.object({ type: z.literal("basic") }),
]);

const httpConnectionConfigSchema = z.object({
  baseUrl: z.url(),
  defaultHeaders: z.record(z.string(), z.string()).optional(),
  auth: httpConnectionAuthSchema,
});

const firebaseConnectionConfigSchema = z.object({
  projectId: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  databaseURL: z.url().optional(),
});

export const createConnectionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("http"),
    name: z.string().trim().min(1).max(120),
    config: httpConnectionConfigSchema,
  }),
  z.object({
    kind: z.literal("firebase"),
    name: z.string().trim().min(1).max(120),
    config: firebaseConnectionConfigSchema,
  }),
]);

export const updateConnectionSchema = createConnectionSchema;

export const connectionParamSchema = z.object({
  connectionId: z.uuid(),
});

export const setConnectionSecretSchema = z.object({
  value: z.string().trim().min(1),
});
