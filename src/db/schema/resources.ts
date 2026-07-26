import { relations } from "drizzle-orm";
import { type AnyPgColumn, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { connections } from "./connections";
import { createdByColumn, idColumn, timestampColumns } from "./columns.helpers";
import { visibilityEnum, workspaces } from "./workspaces";

export const resourceKindEnum = pgEnum("resource_kind", ["http", "firebase_rtdb", "firebase_firestore"]);
export const resourceDirectionEnum = pgEnum("resource_direction", ["invoke", "subscribe", "receive"]);
export const resourceDangerEnum = pgEnum("resource_danger", ["safe", "mutating", "destructive"]);

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
});

// A Resource always belongs to a saved Connection (connectionId is NOT NULL,
// delete-restricted) — nothing lands in the registry until it's been promoted
// from the Playground via "save to registry"; ad-hoc/unsaved items live only in
// playground_tiles.adhoc_config and never get a resources row.
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
  // URL (with {{variable}} templating) for http, or the RTDB/Firestore path for firebase.
  address: text("address").notNull(),
  payloadTemplate: jsonb("payload_template"),
  // Kind-specific: http => { method, headers, queryParams, bodyType }; firebase => { mode, eventFilter? }.
  config: jsonb("config").notNull(),
  // Unused in Phase 1 — see DECISIONS.md.
  visibility: visibilityEnum("visibility").default("private").notNull(),
  ...timestampColumns,
  ...createdByColumn,
});

export const resourceFoldersRelations = relations(resourceFolders, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [resourceFolders.workspaceId], references: [workspaces.id] }),
  parent: one(resourceFolders, { fields: [resourceFolders.parentFolderId], references: [resourceFolders.id] }),
  resources: many(resources),
}));

export const resourcesRelations = relations(resources, ({ one }) => ({
  workspace: one(workspaces, { fields: [resources.workspaceId], references: [workspaces.id] }),
  folder: one(resourceFolders, { fields: [resources.folderId], references: [resourceFolders.id] }),
  connection: one(connections, { fields: [resources.connectionId], references: [connections.id] }),
}));
