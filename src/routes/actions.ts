import { Hono } from "hono";

import {
  createAction,
  createStep,
  deleteAction,
  deleteStep,
  executeAction,
  getAction,
  getActionRun,
  listActionRuns,
  listActions,
  reorderSteps,
  updateAction,
  updateStep,
} from "../controllers/actions";
import { requireWorkspaceAccess } from "../middlewares/workspace-access";
import type { AppEnv } from "../types/hono";
import { zv } from "../utils/validate";
import {
  actionParamSchema,
  actionRunParamSchema,
  createActionSchema,
  createStepSchema,
  executeActionSchema,
  listActionRunsQuerySchema,
  reorderStepsSchema,
  stepParamSchema,
  updateActionSchema,
  updateStepSchema,
} from "../validations/actions";
import { workspaceIdParamSchema } from "../validations/workspaces";

export const actionsRouter = new Hono<AppEnv>()
  // -- actions --
  .get(
    "/:workspaceId/actions",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("action:read"),
    listActions,
  )

  .post(
    "/:workspaceId/actions",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("action:write"),
    zv("json", createActionSchema),
    createAction,
  )

  .get(
    "/:workspaceId/actions/:actionId",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:read"),
    getAction,
  )

  .patch(
    "/:workspaceId/actions/:actionId",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:write"),
    zv("json", updateActionSchema),
    updateAction,
  )

  .delete(
    "/:workspaceId/actions/:actionId",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:delete"),
    deleteAction,
  )

  // -- steps --
  .post(
    "/:workspaceId/actions/:actionId/steps",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:write"),
    zv("json", createStepSchema),
    createStep,
  )

  // Registered before the `/:stepId` routes so "reorder" never matches as a step id.
  .put(
    "/:workspaceId/actions/:actionId/steps/reorder",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:write"),
    zv("json", reorderStepsSchema),
    reorderSteps,
  )

  .patch(
    "/:workspaceId/actions/:actionId/steps/:stepId",
    zv("param", stepParamSchema),
    requireWorkspaceAccess("action:write"),
    zv("json", updateStepSchema),
    updateStep,
  )

  .delete(
    "/:workspaceId/actions/:actionId/steps/:stepId",
    zv("param", stepParamSchema),
    requireWorkspaceAccess("action:write"),
    deleteStep,
  )

  // -- execution & runs --
  .post(
    "/:workspaceId/actions/:actionId/execute",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:execute"),
    zv("json", executeActionSchema),
    executeAction,
  )

  .get(
    "/:workspaceId/actions/:actionId/runs",
    zv("param", actionParamSchema),
    zv("query", listActionRunsQuerySchema),
    requireWorkspaceAccess("action:read"),
    listActionRuns,
  )

  .get(
    "/:workspaceId/actions/:actionId/runs/:actionRunId",
    zv("param", actionRunParamSchema),
    requireWorkspaceAccess("action:read"),
    getActionRun,
  );
