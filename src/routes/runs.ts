import { Hono } from "hono"

import { requireWorkspaceAccess } from "../middlewares/workspace-access"

import { listRuns } from "../controllers/runs"

import { workspaceIdParamSchema } from "../validations/workspaces"
import { listRunsQuerySchema } from "../validations/runs"

import { zv } from "../utils/validate"

export const runsRouter = new Hono().get(
  "/:workspaceId/runs",
  zv("param", workspaceIdParamSchema),
  zv("query", listRunsQuerySchema),
  requireWorkspaceAccess("resource:read"),
  listRuns,
)
