import type { Context, ValidationTargets } from "hono"
import type { z } from "zod"

import type { playgroundBoards, playgroundTiles } from "../db/schema/playground"
import type { resourceFolders, resources } from "../db/schema/resources"
import type { workspaceInvites } from "../db/schema/workspaces"
import type { WorkspaceRole } from "../db/schema/enums"
import type { connections } from "../db/schema/connections"
import type { actions } from "../db/schema/actions"

export type AppEnv = {
  Variables: {
    userId: string
    userEmail: string
    workspaceId: string
    workspaceRole: WorkspaceRole
    connectionRow: typeof connections.$inferSelect
    folderRow: typeof resourceFolders.$inferSelect
    resourceRow: typeof resources.$inferSelect
    boardRow: typeof playgroundBoards.$inferSelect
    tileRow: typeof playgroundTiles.$inferSelect & { workspaceId: string }
    actionRow: typeof actions.$inferSelect
    inviteRow: typeof workspaceInvites.$inferSelect
  }
}

export type zContext<Targets extends Partial<Record<keyof ValidationTargets, z.ZodTypeAny>>> = Context<
  AppEnv,
  "",
  {
    out: {
      [K in keyof Targets]: z.infer<Targets[K]>
    }
  }
>
