import { and, asc, count, desc, eq, sql } from "drizzle-orm"

import type { zContext } from "../types/hono"

import { runActionSteps } from "../services/execute-action"

import { actionRuns, actions, actionSteps } from "../db/schema/actions"
import { resources } from "../db/schema/resources"
import { runs } from "../db/schema/runs"
import { db } from "../lib/db"

import { AppError } from "../utils/errors"

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

export async function requireAction(actionId: string) {
  const [row] = await db.select().from(actions).where(eq(actions.id, actionId))
  if (!row) throw new AppError("Action not found", 404)
  return row
}

export async function listActions(c: zContext<{ param: typeof workspaceIdParamSchema }>) {
  const { workspaceId } = c.req.valid("param")

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
    .orderBy(desc(actions.createdAt))

  const latestRuns = await db
    .selectDistinctOn([actionRuns.actionId], {
      actionId: actionRuns.actionId,
      status: actionRuns.status,
      startedAt: actionRuns.startedAt,
    })
    .from(actionRuns)
    .where(eq(actionRuns.workspaceId, workspaceId))
    .orderBy(actionRuns.actionId, desc(actionRuns.startedAt))

  const latestByAction = new Map(latestRuns.map((run) => [run.actionId, run]))
  return c.json(
    rows.map((row) => {
      const latest = latestByAction.get(row.id)
      return { ...row, lastRunStatus: latest?.status ?? null, lastRunAt: latest?.startedAt ?? null }
    }),
  )
}

export async function createAction(c: zContext<{ param: typeof workspaceIdParamSchema; json: typeof createActionSchema }>) {
  const { workspaceId } = c.req.valid("param")
  const input = c.req.valid("json")
  const createdBy = c.get("userId")

  const [action] = await db
    .insert(actions)
    .values({ workspaceId, name: input.name, description: input.description ?? null, createdBy })
    .returning()
  if (!action) throw new Error("Failed to create action")

  return c.json(action, 201)
}

export async function getAction(c: zContext<{ param: typeof actionParamSchema }>) {
  const { actionId } = c.req.valid("param")
  const actionRow = c.get("actionRow")
  const steps = await listSteps(actionId)
  return c.json({ ...actionRow, steps })
}

export async function updateAction(c: zContext<{ param: typeof actionParamSchema; json: typeof updateActionSchema }>) {
  const { actionId } = c.req.valid("param")
  const input = c.req.valid("json")

  const [action] = await db
    .update(actions)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    })
    .where(eq(actions.id, actionId))
    .returning()
  if (!action) throw new AppError("Action not found", 404)

  return c.json(action)
}

export async function deleteAction(c: zContext<{ param: typeof actionParamSchema }>) {
  const { actionId } = c.req.valid("param")
  await db.delete(actions).where(eq(actions.id, actionId))
  return c.json({ message: "Action deleted" })
}

export async function createStep(c: zContext<{ param: typeof actionParamSchema; json: typeof createStepSchema }>) {
  const { actionId } = c.req.valid("param")
  const input = c.req.valid("json")
  const actionRow = c.get("actionRow")

  await assertHttpResourceInWorkspace(actionRow.workspaceId, input.resourceId)
  await assertStepNameAvailable(actionId, input.name)

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number | null>`max("order")` })
    .from(actionSteps)
    .where(eq(actionSteps.actionId, actionId))

  const [step] = await db
    .insert(actionSteps)
    .values({
      actionId,
      resourceId: input.resourceId,
      order: (maxOrder ?? -1) + 1,
      name: input.name,
      inputMapping: input.inputMapping ?? null,
    })
    .returning()
  if (!step) throw new Error("Failed to create step")

  return c.json(step, 201)
}

export async function reorderSteps(c: zContext<{ param: typeof actionParamSchema; json: typeof reorderStepsSchema }>) {
  const { actionId } = c.req.valid("param")
  const { stepIds } = c.req.valid("json")

  const steps = await db.select({ id: actionSteps.id }).from(actionSteps).where(eq(actionSteps.actionId, actionId))

  const existingIds = new Set(steps.map((step) => step.id))
  const requestedIds = new Set(stepIds)
  if (
    existingIds.size !== stepIds.length ||
    requestedIds.size !== stepIds.length ||
    [...existingIds].some((id) => !requestedIds.has(id))
  ) {
    throw new AppError("stepIds must contain every step of this action exactly once", 400)
  }

  // Two passes through an offset range avoid transient unique-constraint
  // collisions on (action_id, "order") mid-update (neon-http has no
  // transactions, so there is a harmless non-atomic window between them).
  await db.execute(sql`update "action_steps" set "order" = "order" + 1000 where "action_id" = ${actionId}`)
  const mapping = sql.join(
    stepIds.map((id, index) => sql`(${id}::uuid, ${index}::int)`),
    sql`, `,
  )
  await db.execute(
    sql`update "action_steps" as s set "order" = v.ord from (values ${mapping}) as v(id, ord) where s.id = v.id and s."action_id" = ${actionId}`,
  )

  return c.json(await listSteps(actionId))
}

export async function updateStep(c: zContext<{ param: typeof stepParamSchema; json: typeof updateStepSchema }>) {
  const { actionId, stepId } = c.req.valid("param")
  const input = c.req.valid("json")
  const actionRow = c.get("actionRow")

  await requireStep(actionId, stepId)
  if (input.resourceId !== undefined) await assertHttpResourceInWorkspace(actionRow.workspaceId, input.resourceId)
  if (input.name !== undefined) await assertStepNameAvailable(actionId, input.name, stepId)

  const [step] = await db
    .update(actionSteps)
    .set({
      ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.inputMapping !== undefined ? { inputMapping: input.inputMapping } : {}),
    })
    .where(eq(actionSteps.id, stepId))
    .returning()
  if (!step) throw new AppError("Step not found", 404)

  return c.json(step)
}

export async function deleteStep(c: zContext<{ param: typeof stepParamSchema }>) {
  const { actionId, stepId } = c.req.valid("param")

  const step = await requireStep(actionId, stepId)
  await db.delete(actionSteps).where(eq(actionSteps.id, stepId))

  await db.execute(
    sql`update "action_steps" set "order" = "order" + 1000 where "action_id" = ${actionId} and "order" > ${step.order}`,
  )
  await db.execute(
    sql`update "action_steps" set "order" = "order" - 1001 where "action_id" = ${actionId} and "order" >= 1000`,
  )

  return c.json({ message: "Step deleted" })
}

export async function executeAction(c: zContext<{ param: typeof actionParamSchema; json: typeof executeActionSchema }>) {
  const { actionId } = c.req.valid("param")
  const { variables } = c.req.valid("json")
  const userId = c.get("userId")
  const actionRow = c.get("actionRow")

  const steps = await listSteps(actionId)
  if (steps.length === 0) throw new AppError("Action has no steps to execute", 400)

  const actionRun = await runActionSteps(actionRow.workspaceId, actionId, userId, steps, variables ?? {})
  return c.json(await getRunDetail(actionId, actionRun.id))
}

export async function listActionRuns(c: zContext<{ param: typeof actionParamSchema; query: typeof listActionRunsQuerySchema }>) {
  const { actionId } = c.req.valid("param")
  const { limit } = c.req.valid("query")

  const rows = await db
    .select()
    .from(actionRuns)
    .where(eq(actionRuns.actionId, actionId))
    .orderBy(desc(actionRuns.startedAt))
    .limit(limit ?? 10)

  return c.json(rows)
}

export async function getActionRun(c: zContext<{ param: typeof actionRunParamSchema }>) {
  const { actionId, actionRunId } = c.req.valid("param")
  return c.json(await getRunDetail(actionId, actionRunId))
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
    .orderBy(asc(actionSteps.order))
}

async function requireStep(actionId: string, stepId: string) {
  const [step] = await db
    .select()
    .from(actionSteps)
    .where(and(eq(actionSteps.id, stepId), eq(actionSteps.actionId, actionId)))
  if (!step) throw new AppError("Step not found", 404)
  return step
}

// Only http resources are executable server-side, so firebase-kind resources
// are rejected when a step is written, not discovered broken at run time
// (`kind` is immutable after creation, so this check can't go stale).
async function assertHttpResourceInWorkspace(workspaceId: string, resourceId: string) {
  const [resource] = await db
    .select({ id: resources.id, kind: resources.kind })
    .from(resources)
    .where(and(eq(resources.id, resourceId), eq(resources.workspaceId, workspaceId)))
  if (!resource) throw new AppError("Resource not found in this workspace", 400)
  if (resource.kind !== "http") throw new AppError("Only http resources can be used as action steps", 400)
}

async function assertStepNameAvailable(actionId: string, name: string, excludeStepId?: string) {
  const existing = await db
    .select({ id: actionSteps.id })
    .from(actionSteps)
    .where(and(eq(actionSteps.actionId, actionId), eq(actionSteps.name, name)))
  const clash = existing.find((step) => step.id !== excludeStepId)
  if (clash) throw new AppError(`A step named "${name}" already exists in this action`, 400)
}

async function getRunDetail(actionId: string, actionRunId: string) {
  const [actionRun] = await db
    .select()
    .from(actionRuns)
    .where(and(eq(actionRuns.id, actionRunId), eq(actionRuns.actionId, actionId)))
  if (!actionRun) throw new AppError("Action run not found", 404)

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
    .orderBy(asc(actionSteps.order))

  return { actionRun, stepRuns }
}
