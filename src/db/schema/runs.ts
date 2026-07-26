import { relations, sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { actionRuns, actionSteps } from "./actions";
import { users } from "./auth";
import { idColumn } from "./columns.helpers";
import { RUN_STATUSES } from "./enums";
import { resources } from "./resources";
import { workspaces } from "./workspaces";

// One recorded execution of a Resource (standalone, from the Playground) or of an
// Action's step (stepId + actionRunId set). resourceId is nullable because
// Playground items can be run before ever being saved to the registry — the
// request/response snapshot in `request`/`response` is the record either way.
// Auth headers are redacted before this row is written (see DECISIONS.md).
export const runs = pgTable(
  "runs",
  {
    ...idColumn,
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "set null" }),
    stepId: uuid("step_id").references(() => actionSteps.id, { onDelete: "set null" }),
    actionRunId: uuid("action_run_id").references(() => actionRuns.id, { onDelete: "cascade" }),
    triggeredBy: text("triggered_by")
      .notNull()
      .references(() => users.id),
    request: jsonb("request").notNull(),
    response: jsonb("response"),
    status: text("status", { enum: RUN_STATUSES }).notNull().default("pending"),
    durationMs: integer("duration_ms"),
    executedAt: timestamp("executed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [check("runs_status_check", sql`${table.status} in ('pending','success','error')`)],
);

export const runsRelations = relations(runs, ({ one }) => ({
  workspace: one(workspaces, { fields: [runs.workspaceId], references: [workspaces.id] }),
  resource: one(resources, { fields: [runs.resourceId], references: [resources.id] }),
  step: one(actionSteps, { fields: [runs.stepId], references: [actionSteps.id] }),
  actionRun: one(actionRuns, { fields: [runs.actionRunId], references: [actionRuns.id] }),
  triggeredByUser: one(users, { fields: [runs.triggeredBy], references: [users.id] }),
}));
