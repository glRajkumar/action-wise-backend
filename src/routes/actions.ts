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

// Collection — mounted under /workspaces/:workspaceId/actions, workspaceId
// says which workspace's actions to list/create in.
export const actionsCollectionRouter = new Hono<AppEnv>()
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
  );

// Item — mounted flat at /actions. actionId (+stepId/actionRunId) alone
// identify the row; each controller derives workspaceId from it and calls
// assertWorkspaceAccess itself.
export const actionItemsRouter = new Hono<AppEnv>()
  .get("/:actionId", zv("param", actionParamSchema), getAction)

  .patch(
    "/:actionId",
    zv("param", actionParamSchema),
    zv("json", updateActionSchema),
    updateAction,
  )

  .delete("/:actionId", zv("param", actionParamSchema), deleteAction)

  // -- steps --
  .post(
    "/:actionId/steps",
    zv("param", actionParamSchema),
    zv("json", createStepSchema),
    createStep,
  )

  // Registered before the `/:stepId` routes so "reorder" never matches as a step id.
  .put(
    "/:actionId/steps/reorder",
    zv("param", actionParamSchema),
    zv("json", reorderStepsSchema),
    reorderSteps,
  )

  .patch(
    "/:actionId/steps/:stepId",
    zv("param", stepParamSchema),
    zv("json", updateStepSchema),
    updateStep,
  )

  .delete("/:actionId/steps/:stepId", zv("param", stepParamSchema), deleteStep)

  // -- execution & runs --
  .post(
    "/:actionId/execute",
    zv("param", actionParamSchema),
    zv("json", executeActionSchema),
    executeAction,
  )

  .get(
    "/:actionId/runs",
    zv("param", actionParamSchema),
    zv("query", listActionRunsQuerySchema),
    listActionRuns,
  )

  .get("/:actionId/runs/:actionRunId", zv("param", actionRunParamSchema), getActionRun);
