import {
  createBoard,
  createTile,
  deleteBoard,
  deleteTile,
  executeTile,
  getBoard,
  listBoards,
  listTiles,
  logFirebaseRun,
  promoteTile,
  updateBoard,
  updateTile,
  type TileInput,
} from "../services/playground";

export async function listWorkspaceBoards(workspaceId: string, userId: string) {
  return listBoards(workspaceId, userId);
}

export async function createWorkspaceBoard(workspaceId: string, userId: string, name?: string) {
  return createBoard(workspaceId, userId, name);
}

export async function getWorkspaceBoard(workspaceId: string, boardId: string, userId: string) {
  return getBoard(workspaceId, boardId, userId);
}

export async function renameWorkspaceBoard(workspaceId: string, boardId: string, userId: string, name: string) {
  return updateBoard(workspaceId, boardId, userId, name);
}

export async function deleteWorkspaceBoard(workspaceId: string, boardId: string, userId: string) {
  await deleteBoard(workspaceId, boardId, userId);
}

export async function listBoardTiles(workspaceId: string, boardId: string, userId: string) {
  return listTiles(workspaceId, boardId, userId);
}

export async function createBoardTile(workspaceId: string, boardId: string, userId: string, input: TileInput) {
  return createTile(workspaceId, boardId, userId, input);
}

export async function updateBoardTile(
  workspaceId: string,
  tileId: string,
  userId: string,
  input: Parameters<typeof updateTile>[3],
) {
  return updateTile(workspaceId, tileId, userId, input);
}

export async function deleteBoardTile(workspaceId: string, tileId: string, userId: string) {
  await deleteTile(workspaceId, tileId, userId);
}

export async function executeBoardTile(
  workspaceId: string,
  tileId: string,
  userId: string,
  variables?: Record<string, string>,
) {
  return executeTile(workspaceId, tileId, userId, variables);
}

export async function logBoardTileFirebaseRun(
  workspaceId: string,
  tileId: string,
  userId: string,
  input: Parameters<typeof logFirebaseRun>[3],
) {
  return logFirebaseRun(workspaceId, tileId, userId, input);
}

export async function promoteBoardTile(
  workspaceId: string,
  tileId: string,
  userId: string,
  input: Parameters<typeof promoteTile>[3],
) {
  return promoteTile(workspaceId, tileId, userId, input);
}
