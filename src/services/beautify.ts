import { and, eq } from "drizzle-orm";

import { resources } from "../db/schema/resources";
import { runs } from "../db/schema/runs";
import { db } from "../lib/db";
import { AppError } from "../utils/errors";
import { generateFakeRecords } from "./faker";
import { inferTypeFromSamples, renderTypeScript } from "./type-inference";

async function getWorkspaceResourceOrThrow(workspaceId: string, resourceId: string) {
  const [resource] = await db
    .select()
    .from(resources)
    .where(and(eq(resources.id, resourceId), eq(resources.workspaceId, workspaceId)));
  if (!resource) throw new AppError("Resource not found", 404);
  return resource;
}

// http Runs store `{ status, headers, body }` (see services/playground.ts);
// Firebase Runs store whatever raw payload the client logged. The "response"
// worth inferring a type from is the body either way.
function extractResponseSample(resourceKind: string, response: unknown): unknown {
  if (response === null || response === undefined) return undefined;
  if (resourceKind === "http" && typeof response === "object") {
    return (response as { body?: unknown }).body;
  }
  return response;
}

async function collectResponseSamples(workspaceId: string, resourceId: string, resourceKind: string) {
  const rows = await db
    .select({ response: runs.response })
    .from(runs)
    .where(and(eq(runs.workspaceId, workspaceId), eq(runs.resourceId, resourceId), eq(runs.status, "success")));

  return rows.map((row) => extractResponseSample(resourceKind, row.response)).filter((sample) => sample !== undefined);
}

function toTypeName(resourceName: string): string {
  const pascal = resourceName
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join("");
  return `${pascal || "Resource"}Response`;
}

export async function exportResourceType(workspaceId: string, resourceId: string) {
  const resource = await getWorkspaceResourceOrThrow(workspaceId, resourceId);
  const samples = await collectResponseSamples(workspaceId, resourceId, resource.kind);
  if (samples.length === 0) throw new AppError("No successful runs recorded for this resource yet", 400);

  const typeName = toTypeName(resource.name);
  const inferred = inferTypeFromSamples(samples);

  return { typeName, source: renderTypeScript(typeName, inferred), sampleCount: samples.length };
}

export async function generateFakeDataForResource(workspaceId: string, resourceId: string, count: number) {
  const resource = await getWorkspaceResourceOrThrow(workspaceId, resourceId);
  const samples = await collectResponseSamples(workspaceId, resourceId, resource.kind);
  if (samples.length === 0) throw new AppError("No successful runs recorded for this resource yet", 400);

  const inferred = inferTypeFromSamples(samples);
  return generateFakeRecords(inferred, count);
}
