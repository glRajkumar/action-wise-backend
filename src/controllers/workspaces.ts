import type { WorkspaceRole } from "../db/schema/enums";
import { inviteEmailSender } from "../services/invite-email";
import {
  acceptInvite,
  createInvite,
  createWorkspaceWithOwner,
  deleteWorkspace as deleteWorkspaceRow,
  getWorkspace,
  listInvites,
  listMembers,
  listWorkspacesForUser,
  removeMember,
  revokeInvite,
  updateMemberRole,
  updateWorkspaceName,
} from "../services/workspaces";
import { AppError } from "../utils/errors";

export async function listWorkspaces(userId: string) {
  const rows = await listWorkspacesForUser(userId);
  return rows.map(({ workspace, role }) => ({ ...workspace, role }));
}

export async function createWorkspace(userId: string, name: string) {
  return createWorkspaceWithOwner(name, userId);
}

export async function getWorkspaceDetail(workspaceId: string) {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new AppError("Workspace not found", 404);
  return workspace;
}

export async function renameWorkspace(workspaceId: string, name: string) {
  const workspace = await updateWorkspaceName(workspaceId, name);
  if (!workspace) throw new AppError("Workspace not found", 404);
  return workspace;
}

export async function deleteWorkspace(workspaceId: string) {
  await deleteWorkspaceRow(workspaceId);
}

export async function listWorkspaceMembers(workspaceId: string) {
  return listMembers(workspaceId);
}

export async function changeMemberRole(workspaceId: string, targetUserId: string, role: WorkspaceRole) {
  return updateMemberRole(workspaceId, targetUserId, role);
}

export async function removeWorkspaceMember(workspaceId: string, targetUserId: string) {
  await removeMember(workspaceId, targetUserId);
}

export async function inviteToWorkspace(workspaceId: string, email: string, role: WorkspaceRole, invitedBy: string) {
  const workspace = await getWorkspaceDetail(workspaceId);
  const invite = await createInvite(workspaceId, email, role, invitedBy);
  await inviteEmailSender.sendInviteEmail({ email, workspaceName: workspace.name, token: invite.token });
  return invite;
}

export async function listWorkspaceInvites(workspaceId: string) {
  return listInvites(workspaceId);
}

export async function revokeWorkspaceInvite(workspaceId: string, inviteId: string) {
  return revokeInvite(workspaceId, inviteId);
}

export async function acceptWorkspaceInvite(token: string, userId: string, userEmail: string) {
  return acceptInvite(token, userId, userEmail);
}
