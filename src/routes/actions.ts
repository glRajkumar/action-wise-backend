import { Hono } from "hono";

import {
  createWorkspaceAction,
  createWorkspaceActionStep,
  deleteWorkspaceAction,
  deleteWorkspaceActionStep,
  executeWorkspaceAction,
  getWorkspaceAction,
  getWorkspaceActionRun,
  listWorkspaceActionRuns,
  listWorkspaceActions,
  reorderWorkspaceActionSteps,
  updateWorkspaceAction,
  updateWorkspaceActionStep,
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
    async (c) => c.json(await listWorkspaceActions(c.req.valid("param").workspaceId)),
  )

  .post(
    "/:workspaceId/actions",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("action:write"),
    zv("json", createActionSchema),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const action = await createWorkspaceAction(workspaceId, c.req.valid("json"), c.get("userId"));
      return c.json(action, 201);
    },
  )

  .get(
    "/:workspaceId/actions/:actionId",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:read"),
    async (c) => {
      const { workspaceId, actionId } = c.req.valid("param");
      return c.json(await getWorkspaceAction(workspaceId, actionId));
    },
  )

  .patch(
    "/:workspaceId/actions/:actionId",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:write"),
    zv("json", updateActionSchema),
    async (c) => {
      const { workspaceId, actionId } = c.req.valid("param");
      return c.json(await updateWorkspaceAction(workspaceId, actionId, c.req.valid("json")));
    },
  )

  .delete(
    "/:workspaceId/actions/:actionId",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:delete"),
    async (c) => {
      const { workspaceId, actionId } = c.req.valid("param");
      await deleteWorkspaceAction(workspaceId, actionId);
      return c.json({ message: "Action deleted" });
    },
  )

  // -- steps --
  .post(
    "/:workspaceId/actions/:actionId/steps",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:write"),
    zv("json", createStepSchema),
    async (c) => {
      const { workspaceId, actionId } = c.req.valid("param");
      const step = await createWorkspaceActionStep(workspaceId, actionId, c.req.valid("json"));
      return c.json(step, 201);
    },
  )

  // Registered before the `/:stepId` routes so "reorder" never matches as a step id.
  .put(
    "/:workspaceId/actions/:actionId/steps/reorder",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:write"),
    zv("json", reorderStepsSchema),
    async (c) => {
      const { workspaceId, actionId } = c.req.valid("param");
      const { stepIds } = c.req.valid("json");
      return c.json(await reorderWorkspaceActionSteps(workspaceId, actionId, stepIds));
    },
  )

  .patch(
    "/:workspaceId/actions/:actionId/steps/:stepId",
    zv("param", stepParamSchema),
    requireWorkspaceAccess("action:write"),
    zv("json", updateStepSchema),
    async (c) => {
      const { workspaceId, actionId, stepId } = c.req.valid("param");
      return c.json(await updateWorkspaceActionStep(workspaceId, actionId, stepId, c.req.valid("json")));
    },
  )

  .delete(
    "/:workspaceId/actions/:actionId/steps/:stepId",
    zv("param", stepParamSchema),
    requireWorkspaceAccess("action:write"),
    async (c) => {
      const { workspaceId, actionId, stepId } = c.req.valid("param");
      await deleteWorkspaceActionStep(workspaceId, actionId, stepId);
      return c.json({ message: "Step deleted" });
    },
  )

  // -- execution & runs --
  .post(
    "/:workspaceId/actions/:actionId/execute",
    zv("param", actionParamSchema),
    requireWorkspaceAccess("action:execute"),
    zv("json", executeActionSchema),
    async (c) => {
      const { workspaceId, actionId } = c.req.valid("param");
      const { variables } = c.req.valid("json");
      return c.json(await executeWorkspaceAction(workspaceId, actionId, c.get("userId"), variables));
    },
  )

  .get(
    "/:workspaceId/actions/:actionId/runs",
    zv("param", actionParamSchema),
    zv("query", listActionRunsQuerySchema),
    requireWorkspaceAccess("action:read"),
    async (c) => {
      const { workspaceId, actionId } = c.req.valid("param");
      const { limit } = c.req.valid("query");
      return c.json(await listWorkspaceActionRuns(workspaceId, actionId, limit));
    },
  )

  .get(
    "/:workspaceId/actions/:actionId/runs/:actionRunId",
    zv("param", actionRunParamSchema),
    requireWorkspaceAccess("action:read"),
    async (c) => {
      const { workspaceId, actionId, actionRunId } = c.req.valid("param");
      return c.json(await getWorkspaceActionRun(workspaceId, actionId, actionRunId));
    },
  );
