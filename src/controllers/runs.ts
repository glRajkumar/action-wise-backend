import { and, desc, eq, type SQL } from "drizzle-orm"

import type { zContext } from "../types/hono"

import { resources } from "../db/schema/resources"
import { runs } from "../db/schema/runs"
import { db } from "../lib/db"

import { workspaceIdParamSchema } from "../validations/workspaces"
import { listRunsQuerySchema } from "../validations/runs"

export async function listRuns(c: zContext<{ param: typeof workspaceIdParamSchema; query: typeof listRunsQuerySchema }>) {
  const { workspaceId } = c.req.valid("param")
  const { limit: rawLimit, resourceId } = c.req.valid("query")
  const limit = Math.min(rawLimit ?? 20, 50)

  const filters: SQL[] = [eq(runs.workspaceId, workspaceId)]
  if (resourceId) filters.push(eq(runs.resourceId, resourceId))

  const rows = await db
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
    .limit(limit)

  return c.json(rows)
}
