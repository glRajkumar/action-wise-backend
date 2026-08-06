import { and, desc, eq, type SQL } from "drizzle-orm";
import { Hono } from "hono";

import { resources } from "../db/schema/resources";
import { runs } from "../db/schema/runs";
import { db } from "../lib/db";
import { requireWorkspaceAccess } from "../middlewares/workspace-access";
import type { AppEnv } from "../types/hono";
import { zv } from "../utils/validate";
import { listRunsQuerySchema } from "../validations/runs";
import { workspaceIdParamSchema } from "../validations/workspaces";

// Run rows carry recorded response bodies of shared resources, so reads are
// gated on resource:read rather than the broader workspace:read.
export const runsRouter = new Hono<AppEnv>().get(
  "/:workspaceId/runs",
  zv("param", workspaceIdParamSchema),
  zv("query", listRunsQuerySchema),
  requireWorkspaceAccess("resource:read"),
  async (c) => {
    const { workspaceId } = c.req.valid("param");
    const { limit: rawLimit, resourceId } = c.req.valid("query");
    const limit = Math.min(rawLimit ?? 20, 50);

    const filters: SQL[] = [eq(runs.workspaceId, workspaceId)];
    if (resourceId) filters.push(eq(runs.resourceId, resourceId));

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
      .limit(limit);

    return c.json(rows);
  },
);
