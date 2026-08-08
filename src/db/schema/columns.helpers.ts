import { text, timestamp, uuid } from "drizzle-orm/pg-core"

import { generateId } from "../../utils/id"
import { users } from "./auth"

export const idColumn = {
  id: uuid("id").primaryKey().$defaultFn(generateId),
}

export const timestampColumns = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

export const createdByColumn = {
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
}
