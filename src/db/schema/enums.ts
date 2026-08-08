export const WORKSPACE_ROLES = ["owner", "admin", "editor", "viewer"] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

export const INVITE_STATUSES = ["pending", "accepted", "revoked"] as const
export type InviteStatus = (typeof INVITE_STATUSES)[number]

export const RUN_STATUSES = ["pending", "success", "error"] as const
export type RunStatus = (typeof RUN_STATUSES)[number]
