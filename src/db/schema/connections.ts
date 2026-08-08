import { relations } from "drizzle-orm"
import { jsonb, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core"

import { createdByColumn, idColumn, timestampColumns } from "./columns.helpers"
import { visibilityEnum, workspaces } from "./workspaces"
import { users } from "./auth"

export const connectionKindEnum = pgEnum("connection_kind", ["http", "firebase"])

export type HttpConnectionAuth =
  | { type: "none" }
  | { type: "bearer" }
  | { type: "apiKey"; headerName: string }
  | { type: "basic" }

export type HttpConnectionConfig = {
  baseUrl: string
  defaultHeaders?: Record<string, string>
  auth: HttpConnectionAuth
}

export type FirebaseConnectionConfig = {
  projectId: string
  apiKey: string
  databaseURL?: string
}

export type ConnectionConfig = HttpConnectionConfig | FirebaseConnectionConfig

export const connections = pgTable("connections", {
  ...idColumn,
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  kind: connectionKindEnum("kind").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").notNull().$type<ConnectionConfig>(),
  visibility: visibilityEnum("visibility").default("private").notNull(),
  ...timestampColumns,
  ...createdByColumn,
})

export const connectionSecrets = pgTable(
  "connection_secrets",
  {
    ...idColumn,
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    ...timestampColumns,
  },
  (table) => [unique("connection_secrets_connection_user_unique").on(table.connectionId, table.userId)],
)

export const connectionsRelations = relations(connections, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [connections.workspaceId], references: [workspaces.id] }),
  secrets: many(connectionSecrets),
}))

export const connectionSecretsRelations = relations(connectionSecrets, ({ one }) => ({
  connection: one(connections, { fields: [connectionSecrets.connectionId], references: [connections.id] }),
  user: one(users, { fields: [connectionSecrets.userId], references: [users.id] }),
}))
