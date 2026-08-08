import { Hono } from "hono"

import { requireWorkspaceAccess } from "../middlewares/workspace-access"
import { requireItemAccess } from "../middlewares/item-access"

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
} from "../validations/actions"
import { workspaceIdParamSchema } from "../validations/workspaces"
import { zv } from "../utils/validate"

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
  requireAction,
  updateAction,
  updateStep,
} from "../controllers/actions"

export const actionsCollectionRouter = new Hono()
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

export const actionItemsRouter = new Hono()
  .get(
    "/:actionId",
    zv("param", actionParamSchema),
    requireItemAccess("actionId", "actionRow", requireAction, "action:read"),
    getAction,
  )
  .patch(
    "/:actionId",
    zv("param", actionParamSchema),
    requireItemAccess("actionId", "actionRow", requireAction, "action:write"),
    zv("json", updateActionSchema),
    updateAction,
  )
  .delete(
    "/:actionId",
    zv("param", actionParamSchema),
    requireItemAccess("actionId", "actionRow", requireAction, "action:delete"),
    deleteAction,
  )
  .post(
    "/:actionId/steps",
    zv("param", actionParamSchema),
    requireItemAccess("actionId", "actionRow", requireAction, "action:write"),
    zv("json", createStepSchema),
    createStep,
  )
  .put(
    "/:actionId/steps/reorder",
    zv("param", actionParamSchema),
    requireItemAccess("actionId", "actionRow", requireAction, "action:write"),
    zv("json", reorderStepsSchema),
    reorderSteps,
  )
  .patch(
    "/:actionId/steps/:stepId",
    zv("param", stepParamSchema),
    requireItemAccess("actionId", "actionRow", requireAction, "action:write"),
    zv("json", updateStepSchema),
    updateStep,
  )
  .delete(
    "/:actionId/steps/:stepId",
    zv("param", stepParamSchema),
    requireItemAccess("actionId", "actionRow", requireAction, "action:write"),
    deleteStep,
  )
  .post(
    "/:actionId/execute",
    zv("param", actionParamSchema),
    requireItemAccess("actionId", "actionRow", requireAction, "action:execute"),
    zv("json", executeActionSchema),
    executeAction,
  )
  .get(
    "/:actionId/runs",
    zv("param", actionParamSchema),
    requireItemAccess("actionId", "actionRow", requireAction, "action:read"),
    zv("query", listActionRunsQuerySchema),
    listActionRuns,
  )
  .get(
    "/:actionId/runs/:actionRunId",
    zv("param", actionRunParamSchema),
    requireItemAccess("actionId", "actionRow", requireAction, "action:read"),
    getActionRun,
  )
