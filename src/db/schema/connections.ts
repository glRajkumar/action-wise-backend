import { relations } from "drizzle-orm";
import { jsonb, pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { createdByColumn, idColumn, timestampColumns } from "./columns.helpers";
import { visibilityEnum, workspaces } from "./workspaces";

export const connectionKindEnum = pgEnum("connection_kind", ["http", "firebase"]);

// `auth` says how a user's connection_secrets value (a single opaque string)
// gets applied to an outgoing request. "basic" stores the secret as a
// JSON-stringified { username, password } — the encrypted value is still just
// one string either way, only the interpretation differs.
export type HttpConnectionAuth =
  | { type: "none" }
  | { type: "bearer" }
  | { type: "apiKey"; headerName: string }
  | { type: "basic" };

export type HttpConnectionConfig = {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  auth: HttpConnectionAuth;
};

export type FirebaseConnectionConfig = {
  projectId: string;
  apiKey: string;
  databaseURL?: string;
};

export type ConnectionConfig = HttpConnectionConfig | FirebaseConnectionConfig;

export const connections = pgTable("connections", {
  ...idColumn,
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  kind: connectionKindEnum("kind").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").notNull().$type<ConnectionConfig>(),
  // Unused in Phase 1 — see DECISIONS.md.
  visibility: visibilityEnum("visibility").default("private").notNull(),
  ...timestampColumns,
  ...createdByColumn,
});

// Secret values are per-user, never per-workspace: connection *config* is shared,
// credentials are not (each teammate supplies their own). Encrypted with
// AES-256-GCM using a key from env; ciphertext/iv/authTag are never returned or
// logged, even to the owning user.
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
);

export const connectionsRelations = relations(connections, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [connections.workspaceId], references: [workspaces.id] }),
  secrets: many(connectionSecrets),
}));

export const connectionSecretsRelations = relations(connectionSecrets, ({ one }) => ({
  connection: one(connections, { fields: [connectionSecrets.connectionId], references: [connections.id] }),
  user: one(users, { fields: [connectionSecrets.userId], references: [users.id] }),
}));
