import { relations, sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { createdByColumn, idColumn, timestampColumns } from "./columns.helpers";
import { RUN_STATUSES } from "./enums";
import { resources } from "./resources";
import { workspaces } from "./workspaces";

export const actions = pgTable("actions", {
  ...idColumn,
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  ...timestampColumns,
  ...createdByColumn,
});

export const actionSteps = pgTable(
  "action_steps",
  {
    ...idColumn,
    actionId: uuid("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    // Restrict, not cascade: a Resource that's part of an Action's sequence can't
    // be deleted out from under it — remove the step first.
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "restrict" }),
    order: integer("order").notNull(),
    name: text("name").notNull(),
    // e.g. { "url": "{{steps.login.response.body.token}}" } — JSONPath-ish refs
    // resolved against prior steps' recorded Runs before this step executes.
    inputMapping: jsonb("input_mapping"),
    ...timestampColumns,
  },
  (table) => [unique("action_steps_action_order_unique").on(table.actionId, table.order)],
);

// Groups the per-step Runs of one Action execution into a single pass/fail timeline.
export const actionRuns = pgTable(
  "action_runs",
  {
    ...idColumn,
    actionId: uuid("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    status: text("status", { enum: RUN_STATUSES }).notNull().default("pending"),
    triggeredBy: text("triggered_by")
      .notNull()
      .references(() => users.id),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [check("action_runs_status_check", sql`${table.status} in ('pending','success','error')`)],
);

export const actionsRelations = relations(actions, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [actions.workspaceId], references: [workspaces.id] }),
  steps: many(actionSteps),
  runs: many(actionRuns),
}));

export const actionStepsRelations = relations(actionSteps, ({ one }) => ({
  action: one(actions, { fields: [actionSteps.actionId], references: [actions.id] }),
  resource: one(resources, { fields: [actionSteps.resourceId], references: [resources.id] }),
}));

export const actionRunsRelations = relations(actionRuns, ({ one }) => ({
  action: one(actions, { fields: [actionRuns.actionId], references: [actions.id] }),
  workspace: one(workspaces, { fields: [actionRuns.workspaceId], references: [workspaces.id] }),
  triggeredByUser: one(users, { fields: [actionRuns.triggeredBy], references: [users.id] }),
}));
