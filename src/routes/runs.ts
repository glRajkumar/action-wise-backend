import { Hono } from "hono";
import { z } from "zod";

import { requireWorkspaceAccess } from "../middlewares/workspace-access";
import { listRuns } from "../services/runs";
import type { AppEnv } from "../types/hono";
import { zv } from "../utils/validate";
import { workspaceIdParamSchema } from "../validations/workspaces";

const listRunsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
  resourceId: z.uuid().optional(),
});

// Run rows carry recorded response bodies of shared resources, so reads are
// gated on resource:read rather than the broader workspace:read.
export const runsRouter = new Hono<AppEnv>().get(
  "/:workspaceId/runs",
  zv("param", workspaceIdParamSchema),
  zv("query", listRunsQuerySchema),
  requireWorkspaceAccess("resource:read"),
  async (c) => {
    const { workspaceId } = c.req.valid("param");
    const { limit, resourceId } = c.req.valid("query");
    return c.json(await listRuns(workspaceId, { limit, resourceId }));
  },
);
