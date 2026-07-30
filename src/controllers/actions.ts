import {
  createAction,
  createStep,
  deleteAction,
  deleteStep,
  executeAction,
  getActionRunDetail,
  getActionWithSteps,
  listActionRuns,
  listActions,
  reorderSteps,
  updateAction,
  updateStep,
} from "../services/actions";

export async function listWorkspaceActions(workspaceId: string) {
  return listActions(workspaceId);
}

export async function createWorkspaceAction(
  workspaceId: string,
  input: { name: string; description?: string },
  createdBy: string,
) {
  return createAction(workspaceId, input, createdBy);
}

export async function getWorkspaceAction(workspaceId: string, actionId: string) {
  return getActionWithSteps(workspaceId, actionId);
}

export async function updateWorkspaceAction(
  workspaceId: string,
  actionId: string,
  input: { name?: string; description?: string | null },
) {
  return updateAction(workspaceId, actionId, input);
}

export async function deleteWorkspaceAction(workspaceId: string, actionId: string) {
  await deleteAction(workspaceId, actionId);
}

export async function createWorkspaceActionStep(
  workspaceId: string,
  actionId: string,
  input: { resourceId: string; name: string; inputMapping?: Record<string, string> },
) {
  return createStep(workspaceId, actionId, input);
}

export async function updateWorkspaceActionStep(
  workspaceId: string,
  actionId: string,
  stepId: string,
  input: { resourceId?: string; name?: string; inputMapping?: Record<string, string> | null },
) {
  return updateStep(workspaceId, actionId, stepId, input);
}

export async function deleteWorkspaceActionStep(workspaceId: string, actionId: string, stepId: string) {
  await deleteStep(workspaceId, actionId, stepId);
}

export async function reorderWorkspaceActionSteps(workspaceId: string, actionId: string, stepIds: string[]) {
  return reorderSteps(workspaceId, actionId, stepIds);
}

export async function executeWorkspaceAction(
  workspaceId: string,
  actionId: string,
  userId: string,
  variables?: Record<string, string>,
) {
  return executeAction(workspaceId, actionId, userId, variables);
}

export async function listWorkspaceActionRuns(workspaceId: string, actionId: string, limit?: number) {
  return listActionRuns(workspaceId, actionId, limit);
}

export async function getWorkspaceActionRun(workspaceId: string, actionId: string, actionRunId: string) {
  return getActionRunDetail(workspaceId, actionId, actionRunId);
}
