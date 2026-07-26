import type { ClientErrorStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  readonly status: ClientErrorStatusCode;

  constructor(message: string, status: ClientErrorStatusCode = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}
