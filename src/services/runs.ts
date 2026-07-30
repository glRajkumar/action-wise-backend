import { and, desc, eq, type SQL } from "drizzle-orm";

import { resources } from "../db/schema/resources";
import { runs } from "../db/schema/runs";
import { db } from "../lib/db";

export async function listRuns(workspaceId: string, options: { limit?: number; resourceId?: string } = {}) {
  const limit = Math.min(options.limit ?? 20, 50);

  const filters: SQL[] = [eq(runs.workspaceId, workspaceId)];
  if (options.resourceId) filters.push(eq(runs.resourceId, options.resourceId));

  return db
    .select({
      id: runs.id,
      resourceId: runs.resourceId,
      resourceName: resources.name,
      stepId: runs.stepId,
      actionRunId: runs.actionRunId,
      status: runs.status,
      durationMs: runs.durationMs,
      executedAt: runs.executedAt,
      request: runs.request,
      response: runs.response,
    })
    .from(runs)
    .leftJoin(resources, eq(runs.resourceId, resources.id))
    .where(and(...filters))
    .orderBy(desc(runs.executedAt))
    .limit(limit);
}
