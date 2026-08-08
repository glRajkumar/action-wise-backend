import { relations } from "drizzle-orm"
import { type AnyPgColumn, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core"

import { createdByColumn, idColumn, timestampColumns } from "./columns.helpers"
import { visibilityEnum, workspaces } from "./workspaces"
import { connections } from "./connections"

export const resourceKindEnum = pgEnum("resource_kind", ["http", "firebase_rtdb", "firebase_firestore"])
export const resourceDirectionEnum = pgEnum("resource_direction", ["invoke", "subscribe", "receive"])
export const resourceDangerEnum = pgEnum("resource_danger", ["safe", "mutating", "destructive"])

export const resourceFolders = pgTable("resource_folders", {
  ...idColumn,
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  parentFolderId: uuid("parent_folder_id").references((): AnyPgColumn => resourceFolders.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  ...timestampColumns,
  ...createdByColumn,
})

export const resources = pgTable("resources", {
  ...idColumn,
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => resourceFolders.id, { onDelete: "set null" }),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => connections.id, { onDelete: "restrict" }),
  kind: resourceKindEnum("kind").notNull(),
  direction: resourceDirectionEnum("direction").notNull(),
  danger: resourceDangerEnum("danger").notNull(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  payloadTemplate: jsonb("payload_template"),
  config: jsonb("config").notNull(),
  visibility: visibilityEnum("visibility").default("private").notNull(),
  ...timestampColumns,
  ...createdByColumn,
})

export const resourceFoldersRelations = relations(resourceFolders, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [resourceFolders.workspaceId], references: [workspaces.id] }),
  parent: one(resourceFolders, { fields: [resourceFolders.parentFolderId], references: [resourceFolders.id] }),
  resources: many(resources),
}))

export const resourcesRelations = relations(resources, ({ one }) => ({
  workspace: one(workspaces, { fields: [resources.workspaceId], references: [workspaces.id] }),
  folder: one(resourceFolders, { fields: [resources.folderId], references: [resourceFolders.id] }),
  connection: one(connections, { fields: [resources.connectionId], references: [connections.id] }),
}))
