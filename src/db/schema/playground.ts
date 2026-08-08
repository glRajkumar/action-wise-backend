import { relations } from "drizzle-orm"
import { integer, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core"

import { idColumn, timestampColumns } from "./columns.helpers"
import { workspaces } from "./workspaces"
import { resources } from "./resources"
import { users } from "./auth"

export const renderModeEnum = pgEnum("render_mode", ["json_tree", "table", "raw", "big_number"])

export const playgroundBoards = pgTable("playground_boards", {
  ...idColumn,
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("My Playground"),
  ...timestampColumns,
})

export const playgroundTiles = pgTable("playground_tiles", {
  ...idColumn,
  boardId: uuid("board_id")
    .notNull()
    .references(() => playgroundBoards.id, { onDelete: "cascade" }),
  resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "set null" }),
  adhocConfig: jsonb("adhoc_config"),
  layout: jsonb("layout").notNull().$type<{ x: number; y: number; w: number; h: number }>(),
  renderMode: renderModeEnum("render_mode").notNull().default("json_tree"),
  position: integer("position").notNull().default(0),
  ...timestampColumns,
})

export const playgroundBoardsRelations = relations(playgroundBoards, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [playgroundBoards.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [playgroundBoards.userId], references: [users.id] }),
  tiles: many(playgroundTiles),
}))

export const playgroundTilesRelations = relations(playgroundTiles, ({ one }) => ({
  board: one(playgroundBoards, { fields: [playgroundTiles.boardId], references: [playgroundBoards.id] }),
  resource: one(resources, { fields: [playgroundTiles.resourceId], references: [resources.id] }),
}))
