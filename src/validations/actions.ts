import { z } from "zod";

export const createActionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});

export const updateActionSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((input) => input.name !== undefined || input.description !== undefined, {
    message: "At least one field must be provided",
  });

export const actionParamSchema = z.object({
  actionId: z.uuid(),
});

export const stepParamSchema = actionParamSchema.extend({
  stepId: z.uuid(),
});

export const actionRunParamSchema = actionParamSchema.extend({
  actionRunId: z.uuid(),
});

// Step names are the `{{steps.<name>.…}}` reference keys — dots/spaces would
// break the template grammar.
const stepNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_]+$/, "Step name may only contain letters, numbers, and underscores");

const inputMappingSchema = z.record(z.string().min(1), z.string());

export const createStepSchema = z.object({
  resourceId: z.uuid(),
  name: stepNameSchema,
  inputMapping: inputMappingSchema.optional(),
});

export const updateStepSchema = z
  .object({
    resourceId: z.uuid().optional(),
    name: stepNameSchema.optional(),
    inputMapping: inputMappingSchema.nullable().optional(),
  })
  .refine((input) => input.resourceId !== undefined || input.name !== undefined || input.inputMapping !== undefined, {
    message: "At least one field must be provided",
  });

export const reorderStepsSchema = z.object({
  stepIds: z.array(z.uuid()).min(1),
});

export const executeActionSchema = z.object({
  variables: z.record(z.string(), z.string()).optional(),
});

export const listActionRunsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
});
