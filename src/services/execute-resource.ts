import { and, eq } from "drizzle-orm";

import type { HttpConnectionConfig } from "../db/schema/connections";
import { connections } from "../db/schema/connections";
import { runs } from "../db/schema/runs";
import { db } from "../lib/db";
import { AppError } from "../utils/errors";
import { getDecryptedConnectionSecret } from "./connections";
import {
  buildAuthHeaders,
  executeHttpRequest,
  type HttpExecutionResult,
  redactHeaders,
  resolveTemplate,
  resolveTemplateDeep,
} from "./http-execute";

export type HttpResourceConfig = {
  method: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyType: "json" | "form" | "raw" | "none";
};

export type HttpResourceExecution = {
  connectionId?: string;
  address: string;
  config: HttpResourceConfig;
  payloadTemplate?: unknown;
};

export type RunLink = {
  resourceId: string | null;
  stepId?: string;
  actionRunId?: string;
};

export type ResolvedRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

export type ResourceRunOutcome =
  | { ok: true; runId: string; request: ResolvedRequest; result: HttpExecutionResult }
  | { ok: false; runId: string; request: ResolvedRequest; result?: HttpExecutionResult; error: string };

// Shared server-side HTTP execution used by Playground tiles (section D) and
// Action steps (section G). Always records a `runs` row — success or failure —
// with auth headers redacted; the returned outcome carries unredacted values
// so callers (the Action step chain) can reference the real response.
// `httpErrorIsFailure` makes a completed fetch with status >= 400 count as a
// failed run: Playground treats any completed exchange as success, an Action
// step chain reading `response.body` from a 404 must stop instead.
export async function executeHttpResourceRun(
  workspaceId: string,
  userId: string,
  execution: HttpResourceExecution,
  variables: Record<string, string>,
  runLink: RunLink,
  options: { httpErrorIsFailure?: boolean } = {},
): Promise<ResourceRunOutcome> {
  const { connectionId, address, config, payloadTemplate } = execution;

  let baseUrl = "";
  let mergedHeaders: Record<string, string> = { ...(config.headers ?? {}) };

  if (connectionId) {
    const [connection] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, connectionId), eq(connections.workspaceId, workspaceId)));
    if (!connection) throw new AppError("Connection not found in this workspace", 400);
    if (connection.kind !== "http") throw new AppError("Connection is not an http connection", 400);

    const httpConfig = connection.config as HttpConnectionConfig;
    baseUrl = httpConfig.baseUrl;
    mergedHeaders = { ...(httpConfig.defaultHeaders ?? {}), ...mergedHeaders };

    const secret = await getDecryptedConnectionSecret(connectionId, userId);
    Object.assign(mergedHeaders, buildAuthHeaders(httpConfig.auth, secret));
  }

  const resolvedUrl = resolveTemplate(`${baseUrl}${address}`, variables);
  const resolvedHeaders = resolveTemplateDeep(mergedHeaders, variables);
  const resolvedQuery = config.queryParams ? resolveTemplateDeep(config.queryParams, variables) : undefined;
  const resolvedBody = payloadTemplate !== undefined ? resolveTemplateDeep(payloadTemplate, variables) : undefined;

  let url: URL;
  try {
    url = new URL(resolvedUrl);
  } catch {
    throw new AppError(`Invalid request URL: ${resolvedUrl}`, 400);
  }
  if (resolvedQuery) {
    for (const [key, value] of Object.entries(resolvedQuery)) url.searchParams.set(key, value);
  }

  const startedAt = new Date();
  const request: ResolvedRequest = {
    method: config.method,
    url: url.toString(),
    headers: resolvedHeaders,
    body: resolvedBody,
  };
  const requestSnapshot = { ...request, headers: redactHeaders(resolvedHeaders) };

  const insertRun = async (status: "success" | "error", response: unknown, durationMs?: number) => {
    const [run] = await db
      .insert(runs)
      .values({
        workspaceId,
        resourceId: runLink.resourceId,
        stepId: runLink.stepId ?? null,
        actionRunId: runLink.actionRunId ?? null,
        triggeredBy: userId,
        request: requestSnapshot,
        response,
        status,
        durationMs,
        executedAt: startedAt,
      })
      .returning({ id: runs.id });
    if (!run) throw new Error("Failed to record run");
    return run.id;
  };

  try {
    const result = await executeHttpRequest({
      method: config.method,
      url: url.toString(),
      headers: resolvedHeaders,
      bodyType: config.bodyType,
      body: resolvedBody,
    });

    const failed = options.httpErrorIsFailure === true && result.status >= 400;
    const runId = await insertRun(
      failed ? "error" : "success",
      { status: result.status, headers: redactHeaders(result.headers), body: result.body },
      result.durationMs,
    );

    if (failed) return { ok: false, runId, request, result, error: `HTTP ${result.status}` };
    return { ok: true, runId, request, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const runId = await insertRun("error", { error: message });
    return { ok: false, runId, request, error: message };
  }
}
