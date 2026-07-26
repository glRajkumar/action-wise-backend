import { z } from "zod";

export const generateFakeDataSchema = z.object({
  count: z.number().int().min(1).max(100),
});
