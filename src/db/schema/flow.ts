import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { idColumn } from "./columns.helpers"
import { workspaces } from "./workspaces"

export const edgeNodeTypeEnum = pgEnum("edge_node_type", ["action", "resource"])
export const edgeSourceEnum = pgEnum("edge_source", ["manual", "code", "observed", "inferred"])

export const flowEdges = pgTable("flow_edges", {
  ...idColumn,
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  sourceNodeType: edgeNodeTypeEnum("source_node_type").notNull(),
  sourceNodeId: uuid("source_node_id").notNull(),
  targetNodeType: edgeNodeTypeEnum("target_node_type").notNull(),
  targetNodeId: uuid("target_node_id").notNull(),
  source: edgeSourceEnum("source").notNull(),
  commitSha: text("commit_sha"),
  observedAt: timestamp("observed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
