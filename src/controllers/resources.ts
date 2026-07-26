import {
  createFolder,
  createResource,
  deleteFolder,
  deleteResource,
  getResource,
  listFolders,
  listResources,
  type ResourceInput,
  updateFolder,
  updateResource,
} from "../services/resources";
import { AppError } from "../utils/errors";

export async function createWorkspaceFolder(
  workspaceId: string,
  name: string,
  parentFolderId: string | null | undefined,
  createdBy: string,
) {
  return createFolder(workspaceId, name, parentFolderId, createdBy);
}

export async function listWorkspaceFolders(workspaceId: string) {
  return listFolders(workspaceId);
}

export async function updateWorkspaceFolder(
  workspaceId: string,
  folderId: string,
  name: string,
  parentFolderId: string | null | undefined,
) {
  return updateFolder(workspaceId, folderId, name, parentFolderId);
}

export async function deleteWorkspaceFolder(workspaceId: string, folderId: string) {
  await deleteFolder(workspaceId, folderId);
}

export async function createWorkspaceResource(workspaceId: string, input: ResourceInput, createdBy: string) {
  return createResource(workspaceId, input, createdBy);
}

export async function listWorkspaceResources(workspaceId: string, folderId?: string) {
  return listResources(workspaceId, folderId);
}

export async function getWorkspaceResource(workspaceId: string, resourceId: string) {
  const resource = await getResource(workspaceId, resourceId);
  if (!resource) throw new AppError("Resource not found", 404);
  return resource;
}

export async function updateWorkspaceResource(workspaceId: string, resourceId: string, input: ResourceInput) {
  return updateResource(workspaceId, resourceId, input);
}

export async function deleteWorkspaceResource(workspaceId: string, resourceId: string) {
  await deleteResource(workspaceId, resourceId);
}
