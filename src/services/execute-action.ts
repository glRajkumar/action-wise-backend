import { eq } from "drizzle-orm";

import { actionRuns } from "../db/schema/actions";
import { resources } from "../db/schema/resources";
import { runs } from "../db/schema/runs";
import { db } from "../lib/db";
import { AppError } from "../utils/errors";
import { executeHttpResourceRun, type HttpResourceConfig } from "./execute-resource";

export type ActionStepForExecution = {
  id: string;
  resourceId: string;
  name: string;
  inputMapping: unknown;
  resource: { kind: string };
};

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
    current = Array.isArray(current) ? current[Number(segment)] : (current as Record<string, unknown>)[segment];
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

function resolveStepRef(template: string, ctx: StepContext, stepName: string): string {
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

// The sequential multi-step executor for Actions (handover G). Kept in
// services/ (not inlined into the controller) even with a single caller —
// it's a stateful DB-writing orchestration loop with no Context involvement,
// same shape already accepted for services/execute-resource.ts.
export async function runActionSteps(
  workspaceId: string,
  actionId: string,
  userId: string,
  steps: ActionStepForExecution[],
  variables: Record<string, string>,
) {
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

  return finishedRun ?? actionRun;
}
