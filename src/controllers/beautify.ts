import { exportResourceType, generateFakeDataForResource } from "../services/beautify";

export async function exportWorkspaceResourceType(workspaceId: string, resourceId: string) {
  return exportResourceType(workspaceId, resourceId);
}

export async function generateWorkspaceResourceFakeData(workspaceId: string, resourceId: string, count: number) {
  return generateFakeDataForResource(workspaceId, resourceId, count);
}
