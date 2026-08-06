import { z } from "zod";

export const listRunsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
  resourceId: z.uuid().optional(),
});
