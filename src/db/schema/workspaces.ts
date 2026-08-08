import { relations, sql } from "drizzle-orm"
import { check, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

import { createdByColumn, idColumn, timestampColumns } from "./columns.helpers"
import { INVITE_STATUSES, WORKSPACE_ROLES } from "./enums"
import { users } from "./auth"

export const visibilityEnum = pgEnum("visibility", ["private", "link"])

export const workspaces = pgTable("workspaces", {
  ...idColumn,
  name: text("name").notNull(),
  visibility: visibilityEnum("visibility").default("private").notNull(),
  ...timestampColumns,
  ...createdByColumn,
})

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    ...idColumn,
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: WORKSPACE_ROLES }).notNull(),
    ...timestampColumns,
  },
  (table) => [
    unique("workspace_members_workspace_user_unique").on(table.workspaceId, table.userId),
    check("workspace_members_role_check", sql`${table.role} in ('owner','admin','editor','viewer')`),
  ],
)

export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    ...idColumn,
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: WORKSPACE_ROLES }).notNull(),
    token: text("token").notNull().unique(),
    status: text("status", { enum: INVITE_STATUSES }).notNull().default("pending"),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at").notNull(),
    ...timestampColumns,
  },
  (table) => [
    check("workspace_invites_role_check", sql`${table.role} in ('owner','admin','editor','viewer')`),
    check("workspace_invites_status_check", sql`${table.status} in ('pending','accepted','revoked')`),
  ],
)

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  invites: many(workspaceInvites),
}))

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}))

export const workspaceInvitesRelations = relations(workspaceInvites, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceInvites.workspaceId], references: [workspaces.id] }),
  invitedByUser: one(users, { fields: [workspaceInvites.invitedBy], references: [users.id] }),
}))
