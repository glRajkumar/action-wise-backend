import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";

type ValidationTarget = "json" | "query" | "param" | "form" | "cookie";

export const zv = <T extends ZodType>(target: ValidationTarget, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "Invalid request";
      return c.json({ message }, 400);
    }
  });
