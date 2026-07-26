import type { ConnectionConfig } from "../db/schema/connections";
import {
  createConnection,
  deleteConnection,
  deleteConnectionSecret,
  getConnection,
  listConnections,
  setConnectionSecret,
  updateConnection,
} from "../services/connections";
import { AppError } from "../utils/errors";

type ConnectionKind = "http" | "firebase";

export async function listWorkspaceConnections(workspaceId: string, userId: string) {
  return listConnections(workspaceId, userId);
}

export async function createWorkspaceConnection(
  workspaceId: string,
  kind: ConnectionKind,
  name: string,
  config: ConnectionConfig,
  createdBy: string,
) {
  return createConnection(workspaceId, kind, name, config, createdBy);
}

export async function getWorkspaceConnection(workspaceId: string, connectionId: string, userId: string) {
  const connection = await getConnection(workspaceId, connectionId, userId);
  if (!connection) throw new AppError("Connection not found", 404);
  return connection;
}

export async function updateWorkspaceConnection(
  workspaceId: string,
  connectionId: string,
  kind: ConnectionKind,
  name: string,
  config: ConnectionConfig,
) {
  return updateConnection(workspaceId, connectionId, kind, name, config);
}

export async function deleteWorkspaceConnection(workspaceId: string, connectionId: string) {
  await deleteConnection(workspaceId, connectionId);
}

export async function setMyConnectionSecret(connectionId: string, userId: string, value: string) {
  await setConnectionSecret(connectionId, userId, value);
}

export async function deleteMyConnectionSecret(connectionId: string, userId: string) {
  await deleteConnectionSecret(connectionId, userId);
}
