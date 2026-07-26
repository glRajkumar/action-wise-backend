import type { HttpConnectionAuth } from "../db/schema/connections";

const TEMPLATE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

export function resolveTemplate(input: string, variables: Record<string, string>): string {
  return input.replace(TEMPLATE_PATTERN, (match, key: string) => variables[key] ?? match);
}

// Walks strings anywhere inside a JSON-shaped value (request bodies, headers,
// query params) and resolves {{variable}} in each one.
export function resolveTemplateDeep<T>(value: T, variables: Record<string, string>): T {
  if (typeof value === "string") return resolveTemplate(value, variables) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => resolveTemplateDeep(item, variables)) as unknown as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, resolveTemplateDeep(entry, variables)]),
    ) as T;
  }
  return value;
}

// `secret` is the current user's decrypted connection_secrets value — a single
// opaque string. "basic" is the one auth type that needs two values, so it
// stores them JSON-stringified inside that one string (see schema/connections.ts).
export function buildAuthHeaders(auth: HttpConnectionAuth, secret: string | null): Record<string, string> {
  if (auth.type === "none" || !secret) return {};

  switch (auth.type) {
    case "bearer":
      return { Authorization: `Bearer ${secret}` };
    case "apiKey":
      return { [auth.headerName]: secret };
    case "basic": {
      const { username, password } = JSON.parse(secret) as { username: string; password: string };
      return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` };
    }
  }
}

const SENSITIVE_HEADER_NAMES = new Set(["authorization", "cookie", "set-cookie", "proxy-authorization"]);

// Applied to request/response headers before a Run row is persisted — never
// to what's returned to the caller in the same request.
export function redactHeaders(headers: Record<string, string>, extraNames: string[] = []): Record<string, string> {
  const extra = new Set(extraNames.map((name) => name.toLowerCase()));
  const redacted: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) || extra.has(key.toLowerCase()) ? "[REDACTED]" : value;
  }

  return redacted;
}

export type HttpExecutionInput = {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyType: "json" | "form" | "raw" | "none";
  body?: unknown;
};

export type HttpExecutionResult = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
};

const REQUEST_TIMEOUT_MS = 30_000;

export async function executeHttpRequest(input: HttpExecutionInput): Promise<HttpExecutionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const headers = { ...input.headers };
    const init: RequestInit = { method: input.method, headers, signal: controller.signal };

    if (input.bodyType === "json" && input.body !== undefined) {
      headers["Content-Type"] ??= "application/json";
      init.body = JSON.stringify(input.body);
    } else if (input.bodyType === "form" && input.body !== null && typeof input.body === "object") {
      headers["Content-Type"] ??= "application/x-www-form-urlencoded";
      init.body = new URLSearchParams(input.body as Record<string, string>).toString();
    } else if (input.bodyType === "raw" && typeof input.body === "string") {
      init.body = input.body;
    }

    const response = await fetch(input.url, init);
    const durationMs = Date.now() - startedAt;

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();

    return { status: response.status, headers: responseHeaders, body, durationMs };
  } finally {
    clearTimeout(timeout);
  }
}
