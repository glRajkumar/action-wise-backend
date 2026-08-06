import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Context } from "hono";

import { actionRuns, actions, actionSteps } from "../db/schema/actions";
import { resources } from "../db/schema/resources";
import { runs } from "../db/schema/runs";
import { db } from "../lib/db";
import { runActionSteps } from "../services/execute-action";
import type { AppEnv } from "../types/hono";
import { AppError } from "../utils/errors";

async function requireAction(workspaceId: string, actionId: string) {
  const [action] = await db
    .select()
    .from(actions)
    .where(and(eq(actions.id, actionId), eq(actions.workspaceId, workspaceId)));
  if (!action) throw new AppError("Action not found", 404);
  return action;
}

async function listSteps(actionId: string) {
  return db
    .select({
      id: actionSteps.id,
      actionId: actionSteps.actionId,
      resourceId: actionSteps.resourceId,
      order: actionSteps.order,
      name: actionSteps.name,
      inputMapping: actionSteps.inputMapping,
      createdAt: actionSteps.createdAt,
      updatedAt: actionSteps.updatedAt,
      resource: { id: resources.id, name: resources.name, kind: resources.kind },
    })
    .from(actionSteps)
    .innerJoin(resources, eq(actionSteps.resourceId, resources.id))
    .where(eq(actionSteps.actionId, actionId))
    .orderBy(asc(actionSteps.order));
}

async function requireStep(actionId: string, stepId: string) {
  const [step] = await db
    .select()
    .from(actionSteps)
    .where(and(eq(actionSteps.id, stepId), eq(actionSteps.actionId, actionId)));
  if (!step) throw new AppError("Step not found", 404);
  return step;
}

// Only http resources are executable server-side, so firebase-kind resources
// are rejected when a step is written, not discovered broken at run time
// (`kind` is immutable after creation, so this check can't go stale).
async function assertHttpResourceInWorkspace(workspaceId: string, resourceId: string) {
  const [resource] = await db
    .select({ id: resources.id, kind: resources.kind })
    .from(resources)
    .where(and(eq(resources.id, resourceId), eq(resources.workspaceId, workspaceId)));
  if (!resource) throw new AppError("Resource not found in this workspace", 400);
  if (resource.kind !== "http") throw new AppError("Only http resources can be used as action steps", 400);
}

async function assertStepNameAvailable(actionId: string, name: string, excludeStepId?: string) {
  const existing = await db
    .select({ id: actionSteps.id })
    .from(actionSteps)
    .where(and(eq(actionSteps.actionId, actionId), eq(actionSteps.name, name)));
  const clash = existing.find((step) => step.id !== excludeStepId);
  if (clash) throw new AppError(`A step named "${name}" already exists in this action`, 400);
}

async function getRunDetail(workspaceId: string, actionId: string, actionRunId: string) {
  await requireAction(workspaceId, actionId);
  const [actionRun] = await db
    .select()
    .from(actionRuns)
    .where(and(eq(actionRuns.id, actionRunId), eq(actionRuns.actionId, actionId)));
  if (!actionRun) throw new AppError("Action run not found", 404);

  const stepRuns = await db
    .select({
      id: runs.id,
      resourceId: runs.resourceId,
      stepId: runs.stepId,
      status: runs.status,
      request: runs.request,
      response: runs.response,
      durationMs: runs.durationMs,
      executedAt: runs.executedAt,
      stepName: actionSteps.name,
      stepOrder: actionSteps.order,
    })
    .from(runs)
    .innerJoin(actionSteps, eq(runs.stepId, actionSteps.id))
    .where(eq(runs.actionRunId, actionRunId))
    .orderBy(asc(actionSteps.order));

  return { actionRun, stepRuns };
}

// -- Actions CRUD --

export async function listActions(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };

  const rows = await db
    .select({
      id: actions.id,
      name: actions.name,
      description: actions.description,
      createdAt: actions.createdAt,
      updatedAt: actions.updatedAt,
      createdBy: actions.createdBy,
      stepCount: count(actionSteps.id),
    })
    .from(actions)
    .leftJoin(actionSteps, eq(actionSteps.actionId, actions.id))
    .where(eq(actions.workspaceId, workspaceId))
    .groupBy(actions.id)
    .orderBy(desc(actions.createdAt));

  const latestRuns = await db
    .selectDistinctOn([actionRuns.actionId], {
      actionId: actionRuns.actionId,
      status: actionRuns.status,
      startedAt: actionRuns.startedAt,
    })
    .from(actionRuns)
    .where(eq(actionRuns.workspaceId, workspaceId))
    .orderBy(actionRuns.actionId, desc(actionRuns.startedAt));

  const latestByAction = new Map(latestRuns.map((run) => [run.actionId, run]));
  return c.json(
    rows.map((row) => {
      const latest = latestByAction.get(row.id);
      return { ...row, lastRunStatus: latest?.status ?? null, lastRunAt: latest?.startedAt ?? null };
    }),
  );
}

export async function createAction(c: Context<AppEnv>) {
  const { workspaceId } = c.req.valid("param" as never) as { workspaceId: string };
  const input = c.req.valid("json" as never) as { name: string; description?: string };
  const createdBy = c.get("userId");

  const [action] = await db
    .insert(actions)
    .values({ workspaceId, name: input.name, description: input.description ?? null, createdBy })
    .returning();
  if (!action) throw new Error("Failed to create action");

  return c.json(action, 201);
}

export async function getAction(c: Context<AppEnv>) {
  const { workspaceId, actionId } = c.req.valid("param" as never) as { workspaceId: string; actionId: string };
  const action = await requireAction(workspaceId, actionId);
  const steps = await listSteps(actionId);
  return c.json({ ...action, steps });
}

export async function updateAction(c: Context<AppEnv>) {
  const { workspaceId, actionId } = c.req.valid("param" as never) as { workspaceId: string; actionId: string };
  const input = c.req.valid("json" as never) as { name?: string; description?: string | null };

  await requireAction(workspaceId, actionId);
  const [action] = await db
    .update(actions)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    })
    .where(eq(actions.id, actionId))
    .returning();
  if (!action) throw new AppError("Action not found", 404);

  return c.json(action);
}

export async function deleteAction(c: Context<AppEnv>) {
  const { workspaceId, actionId } = c.req.valid("param" as never) as { workspaceId: string; actionId: string };
  await requireAction(workspaceId, actionId);
  await db.delete(actions).where(eq(actions.id, actionId));
  return c.json({ message: "Action deleted" });
}

// -- Steps --

export async function createStep(c: Context<AppEnv>) {
  const { workspaceId, actionId } = c.req.valid("param" as never) as { workspaceId: string; actionId: string };
  const input = c.req.valid("json" as never) as {
    resourceId: string;
    name: string;
    inputMapping?: Record<string, string>;
  };

  await requireAction(workspaceId, actionId);
  await assertHttpResourceInWorkspace(workspaceId, input.resourceId);
  await assertStepNameAvailable(actionId, input.name);

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number | null>`max("order")` })
    .from(actionSteps)
    .where(eq(actionSteps.actionId, actionId));

  const [step] = await db
    .insert(actionSteps)
    .values({
      actionId,
      resourceId: input.resourceId,
      order: (maxOrder ?? -1) + 1,
      name: input.name,
      inputMapping: input.inputMapping ?? null,
    })
    .returning();
  if (!step) throw new Error("Failed to create step");

  return c.json(step, 201);
}

// Registered before the `/:stepId` routes so "reorder" never matches as a step id.
export async function reorderSteps(c: Context<AppEnv>) {
  const { workspaceId, actionId } = c.req.valid("param" as never) as { workspaceId: string; actionId: string };
  const { stepIds } = c.req.valid("json" as never) as { stepIds: string[] };

  await requireAction(workspaceId, actionId);
  const steps = await db.select({ id: actionSteps.id }).from(actionSteps).where(eq(actionSteps.actionId, actionId));

  const existingIds = new Set(steps.map((step) => step.id));
  const requestedIds = new Set(stepIds);
  if (
    existingIds.size !== stepIds.length ||
    requestedIds.size !== stepIds.length ||
    [...existingIds].some((id) => !requestedIds.has(id))
  ) {
    throw new AppError("stepIds must contain every step of this action exactly once", 400);
  }

  // Two passes through an offset range avoid transient unique-constraint
  // collisions on (action_id, "order") mid-update (neon-http has no
  // transactions, so there is a harmless non-atomic window between them).
  await db.execute(sql`update "action_steps" set "order" = "order" + 1000 where "action_id" = ${actionId}`);
  const mapping = sql.join(
    stepIds.map((id, index) => sql`(${id}::uuid, ${index}::int)`),
    sql`, `,
  );
  await db.execute(
    sql`update "action_steps" as s set "order" = v.ord from (values ${mapping}) as v(id, ord) where s.id = v.id and s."action_id" = ${actionId}`,
  );

  return c.json(await listSteps(actionId));
}

export async function updateStep(c: Context<AppEnv>) {
  const { workspaceId, actionId, stepId } = c.req.valid("param" as never) as {
    workspaceId: string;
    actionId: string;
    stepId: string;
  };
  const input = c.req.valid("json" as never) as {
    resourceId?: string;
    name?: string;
    inputMapping?: Record<string, string> | null;
  };

  await requireAction(workspaceId, actionId);
  await requireStep(actionId, stepId);
  if (input.resourceId !== undefined) await assertHttpResourceInWorkspace(workspaceId, input.resourceId);
  if (input.name !== undefined) await assertStepNameAvailable(actionId, input.name, stepId);

  const [step] = await db
    .update(actionSteps)
    .set({
      ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.inputMapping !== undefined ? { inputMapping: input.inputMapping } : {}),
    })
    .where(eq(actionSteps.id, stepId))
    .returning();
  if (!step) throw new AppError("Step not found", 404);

  return c.json(step);
}

export async function deleteStep(c: Context<AppEnv>) {
  const { workspaceId, actionId, stepId } = c.req.valid("param" as never) as {
    workspaceId: string;
    actionId: string;
    stepId: string;
  };

  await requireAction(workspaceId, actionId);
  const step = await requireStep(actionId, stepId);
  await db.delete(actionSteps).where(eq(actionSteps.id, stepId));

  // Compact the remaining orders — same offset trick as reorderSteps.
  await db.execute(
    sql`update "action_steps" set "order" = "order" + 1000 where "action_id" = ${actionId} and "order" > ${step.order}`,
  );
  await db.execute(
    sql`update "action_steps" set "order" = "order" - 1001 where "action_id" = ${actionId} and "order" >= 1000`,
  );

  return c.json({ message: "Step deleted" });
}

// -- Execution & runs --

export async function executeAction(c: Context<AppEnv>) {
  const { workspaceId, actionId } = c.req.valid("param" as never) as { workspaceId: string; actionId: string };
  const { variables } = c.req.valid("json" as never) as { variables?: Record<string, string> };
  const userId = c.get("userId");

  await requireAction(workspaceId, actionId);
  const steps = await listSteps(actionId);
  if (steps.length === 0) throw new AppError("Action has no steps to execute", 400);

  const actionRun = await runActionSteps(workspaceId, actionId, userId, steps, variables ?? {});
  return c.json(await getRunDetail(workspaceId, actionId, actionRun.id));
}

export async function listActionRuns(c: Context<AppEnv>) {
  const { workspaceId, actionId } = c.req.valid("param" as never) as { workspaceId: string; actionId: string };
  const { limit } = c.req.valid("query" as never) as { limit?: number };

  await requireAction(workspaceId, actionId);
  const rows = await db
    .select()
    .from(actionRuns)
    .where(eq(actionRuns.actionId, actionId))
    .orderBy(desc(actionRuns.startedAt))
    .limit(limit ?? 10);

  return c.json(rows);
}

export async function getActionRun(c: Context<AppEnv>) {
  const { workspaceId, actionId, actionRunId } = c.req.valid("param" as never) as {
    workspaceId: string;
    actionId: string;
    actionRunId: string;
  };
  return c.json(await getRunDetail(workspaceId, actionId, actionRunId));
}
