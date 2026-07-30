import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { actionRuns, actions, actionSteps } from "../db/schema/actions";
import { resources } from "../db/schema/resources";
import { runs } from "../db/schema/runs";
import { db } from "../lib/db";
import { AppError } from "../utils/errors";
import { executeHttpResourceRun, type HttpResourceConfig } from "./execute-resource";

// -- Actions CRUD --

export async function listActions(workspaceId: string) {
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
  return rows.map((row) => {
    const latest = latestByAction.get(row.id);
    return { ...row, lastRunStatus: latest?.status ?? null, lastRunAt: latest?.startedAt ?? null };
  });
}

export async function createAction(
  workspaceId: string,
  input: { name: string; description?: string },
  createdBy: string,
) {
  const [action] = await db
    .insert(actions)
    .values({ workspaceId, name: input.name, description: input.description ?? null, createdBy })
    .returning();
  if (!action) throw new Error("Failed to create action");
  return action;
}

async function findAction(workspaceId: string, actionId: string) {
  const [action] = await db
    .select()
    .from(actions)
    .where(and(eq(actions.id, actionId), eq(actions.workspaceId, workspaceId)));
  return action ?? null;
}

export async function getAction(workspaceId: string, actionId: string) {
  const action = await findAction(workspaceId, actionId);
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

export async function getActionWithSteps(workspaceId: string, actionId: string) {
  const action = await getAction(workspaceId, actionId);
  const steps = await listSteps(actionId);
  return { ...action, steps };
}

export async function updateAction(
  workspaceId: string,
  actionId: string,
  input: { name?: string; description?: string | null },
) {
  await getAction(workspaceId, actionId);
  const [action] = await db
    .update(actions)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    })
    .where(eq(actions.id, actionId))
    .returning();
  if (!action) throw new AppError("Action not found", 404);
  return action;
}

export async function deleteAction(workspaceId: string, actionId: string) {
  await getAction(workspaceId, actionId);
  await db.delete(actions).where(eq(actions.id, actionId));
}

// -- Steps --

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

export async function createStep(
  workspaceId: string,
  actionId: string,
  input: { resourceId: string; name: string; inputMapping?: Record<string, string> },
) {
  await getAction(workspaceId, actionId);
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
  return step;
}

async function getStep(actionId: string, stepId: string) {
  const [step] = await db
    .select()
    .from(actionSteps)
    .where(and(eq(actionSteps.id, stepId), eq(actionSteps.actionId, actionId)));
  if (!step) throw new AppError("Step not found", 404);
  return step;
}

export async function updateStep(
  workspaceId: string,
  actionId: string,
  stepId: string,
  input: { resourceId?: string; name?: string; inputMapping?: Record<string, string> | null },
) {
  await getAction(workspaceId, actionId);
  await getStep(actionId, stepId);
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
  return step;
}

export async function deleteStep(workspaceId: string, actionId: string, stepId: string) {
  await getAction(workspaceId, actionId);
  const step = await getStep(actionId, stepId);
  await db.delete(actionSteps).where(eq(actionSteps.id, stepId));

  // Compact the remaining orders. Two statements because the unique
  // (action_id, "order") constraint is checked per row mid-UPDATE — shifting
  // through an offset range avoids transient collisions (neon-http has no
  // transactions, so there is a harmless non-atomic window between them).
  await db.execute(
    sql`update "action_steps" set "order" = "order" + 1000 where "action_id" = ${actionId} and "order" > ${step.order}`,
  );
  await db.execute(sql`update "action_steps" set "order" = "order" - 1001 where "action_id" = ${actionId} and "order" >= 1000`);
}

export async function reorderSteps(workspaceId: string, actionId: string, stepIds: string[]) {
  await getAction(workspaceId, actionId);
  const steps = await db
    .select({ id: actionSteps.id })
    .from(actionSteps)
    .where(eq(actionSteps.actionId, actionId));

  const existingIds = new Set(steps.map((step) => step.id));
  const requestedIds = new Set(stepIds);
  if (existingIds.size !== stepIds.length || requestedIds.size !== stepIds.length || [...existingIds].some((id) => !requestedIds.has(id))) {
    throw new AppError("stepIds must contain every step of this action exactly once", 400);
  }

  // Same offset trick as deleteStep — see the comment there.
  await db.execute(sql`update "action_steps" set "order" = "order" + 1000 where "action_id" = ${actionId}`);
  const mapping = sql.join(
    stepIds.map((id, index) => sql`(${id}::uuid, ${index}::int)`),
    sql`, `,
  );
  await db.execute(
    sql`update "action_steps" as s set "order" = v.ord from (values ${mapping}) as v(id, ord) where s.id = v.id and s."action_id" = ${actionId}`,
  );

  return listSteps(actionId);
}

// -- Step reference resolution --

const TEMPLATE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;
const SINGLE_REF_PATTERN = /^\{\{\s*([\w.]+)\s*\}\}$/;

type StepResult = {
  request: unknown;
  response: { status: number; headers: Record<string, string>; body: unknown };
};

type StepContext = {
  steps: Record<string, StepResult>;
  variables: Record<string, string>;
};

function resolvePath(root: unknown, segments: string[]): unknown {
  let current = root;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = Array.isArray(current)
      ? current[Number(segment)]
      : (current as Record<string, unknown>)[segment];
  }
  return current;
}

function lookupRef(key: string, ctx: StepContext): unknown {
  if (key.startsWith("steps.")) {
    const segments = key.split(".");
    const step = segments[1] ? ctx.steps[segments[1]] : undefined;
    if (!step) return undefined;
    return resolvePath(step, segments.slice(2));
  }
  if (key.startsWith("variables.")) return ctx.variables[key.slice("variables.".length)];
  return ctx.variables[key];
}

// Resolved values feed the flat `Record<string, string>` variables map that the
// resource templates consume, so everything becomes a string: primitives via
// String(), objects/arrays via JSON.stringify. Unresolvable references fail the
// step loudly instead of passing the literal through like `resolveTemplate`.
function stringifyRef(value: unknown): string {
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}

export function resolveStepRef(template: string, ctx: StepContext, stepName: string): string {
  const single = SINGLE_REF_PATTERN.exec(template.trim());
  const resolveKey = (key: string): unknown => {
    const value = lookupRef(key, ctx);
    if (value === undefined) {
      throw new AppError(`Unresolved reference {{${key}}} in step "${stepName}"`, 400);
    }
    return value;
  };

  if (single?.[1]) return stringifyRef(resolveKey(single[1]));
  return template.replace(TEMPLATE_PATTERN, (_match, key: string) => stringifyRef(resolveKey(key)));
}

// -- Execution --

export async function executeAction(
  workspaceId: string,
  actionId: string,
  userId: string,
  variables: Record<string, string> = {},
) {
  await getAction(workspaceId, actionId);
  const steps = await listSteps(actionId);
  if (steps.length === 0) throw new AppError("Action has no steps to execute", 400);

  const [actionRun] = await db
    .insert(actionRuns)
    .values({ actionId, workspaceId, status: "pending", triggeredBy: userId, startedAt: new Date() })
    .returning();
  if (!actionRun) throw new Error("Failed to create action run");

  const ctx: StepContext = { steps: {}, variables };
  let failed = false;

  for (const step of steps) {
    // Defensive only — firebase-kind resources are rejected at step-write time.
    if (step.resource.kind !== "http") {
      failed = true;
      break;
    }

    const [resource] = await db.select().from(resources).where(eq(resources.id, step.resourceId));
    if (!resource) {
      failed = true;
      break;
    }

    let stepVariables: Record<string, string>;
    try {
      const mapping = (step.inputMapping ?? {}) as Record<string, string>;
      const resolved = Object.fromEntries(
        Object.entries(mapping).map(([key, template]) => [key, resolveStepRef(template, ctx, step.name)]),
      );
      stepVariables = { ...variables, ...resolved };
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      // An unresolved reference is an authoring error; record it as this
      // step's run row so the timeline shows where and why the chain broke.
      await db.insert(runs).values({
        workspaceId,
        resourceId: step.resourceId,
        stepId: step.id,
        actionRunId: actionRun.id,
        triggeredBy: userId,
        request: {},
        response: { error: error.message },
        status: "error",
        executedAt: new Date(),
      });
      failed = true;
      break;
    }

    const outcome = await executeHttpResourceRun(
      workspaceId,
      userId,
      {
        connectionId: resource.connectionId,
        address: resource.address,
        config: resource.config as HttpResourceConfig,
        payloadTemplate: resource.payloadTemplate ?? undefined,
      },
      stepVariables,
      { resourceId: resource.id, stepId: step.id, actionRunId: actionRun.id },
      { httpErrorIsFailure: true },
    );

    if (!outcome.ok) {
      failed = true;
      break;
    }

    ctx.steps[step.name] = {
      request: outcome.request,
      response: {
        status: outcome.result.status,
        headers: outcome.result.headers,
        body: outcome.result.body,
      },
    };
  }

  const [finishedRun] = await db
    .update(actionRuns)
    .set({ status: failed ? "error" : "success", finishedAt: new Date() })
    .where(eq(actionRuns.id, actionRun.id))
    .returning();

  return getActionRunDetail(workspaceId, actionId, (finishedRun ?? actionRun).id);
}

// -- Run reads --

export async function listActionRuns(workspaceId: string, actionId: string, limit = 10) {
  await getAction(workspaceId, actionId);
  return db
    .select()
    .from(actionRuns)
    .where(eq(actionRuns.actionId, actionId))
    .orderBy(desc(actionRuns.startedAt))
    .limit(limit);
}

export async function getActionRunDetail(workspaceId: string, actionId: string, actionRunId: string) {
  await getAction(workspaceId, actionId);
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
