import type { WorkspaceRole } from "../db/schema/enums"

export type AppEnv = {
  Variables: {
    userId: string
    userEmail: string
    workspaceId: string
    workspaceRole: WorkspaceRole
  }
}
