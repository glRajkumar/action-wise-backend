import { Hono } from "hono";

import {
  acceptWorkspaceInvite,
  changeMemberRole,
  createWorkspace,
  deleteWorkspace,
  getWorkspaceDetail,
  inviteToWorkspace,
  listWorkspaceInvites,
  listWorkspaceMembers,
  listWorkspaces,
  removeWorkspaceMember,
  renameWorkspace,
  revokeWorkspaceInvite,
} from "../controllers/workspaces";
import { requireWorkspaceAccess } from "../middlewares/workspace-access";
import type { AppEnv } from "../types/hono";
import { zv } from "../utils/validate";
import {
  acceptInviteParamSchema,
  createInviteSchema,
  createWorkspaceSchema,
  inviteParamSchema,
  memberParamSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  workspaceIdParamSchema,
} from "../validations/workspaces";

export const workspacesRouter = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await listWorkspaces(c.get("userId"))))

  .post("/", zv("json", createWorkspaceSchema), async (c) => {
    const { name } = c.req.valid("json");
    return c.json(await createWorkspace(c.get("userId"), name), 201);
  })

  // Not workspace-scoped — the invited user isn't a member yet, the token is the authorization.
  .post("/invites/:token/accept", zv("param", acceptInviteParamSchema), async (c) => {
    const { token } = c.req.valid("param");
    return c.json(await acceptWorkspaceInvite(token, c.get("userId"), c.get("userEmail")));
  })

  .get(
    "/:workspaceId",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:read"),
    async (c) => {
      const workspace = await getWorkspaceDetail(c.req.valid("param").workspaceId);
      return c.json({ ...workspace, role: c.get("workspaceRole") });
    },
  )

  .patch(
    "/:workspaceId",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:update"),
    zv("json", updateWorkspaceSchema),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const { name } = c.req.valid("json");
      return c.json(await renameWorkspace(workspaceId, name));
    },
  )

  .delete(
    "/:workspaceId",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:delete"),
    async (c) => {
      await deleteWorkspace(c.req.valid("param").workspaceId);
      return c.json({ message: "Workspace deleted" });
    },
  )

  .get(
    "/:workspaceId/members",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:read"),
    async (c) => c.json(await listWorkspaceMembers(c.req.valid("param").workspaceId)),
  )

  .patch(
    "/:workspaceId/members/:userId",
    zv("param", memberParamSchema),
    requireWorkspaceAccess("workspace:manage_members"),
    zv("json", updateMemberRoleSchema),
    async (c) => {
      const { workspaceId, userId } = c.req.valid("param");
      const { role } = c.req.valid("json");
      return c.json(await changeMemberRole(workspaceId, userId, role));
    },
  )

  .delete(
    "/:workspaceId/members/:userId",
    zv("param", memberParamSchema),
    requireWorkspaceAccess("workspace:manage_members"),
    async (c) => {
      const { workspaceId, userId } = c.req.valid("param");
      await removeWorkspaceMember(workspaceId, userId);
      return c.json({ message: "Member removed" });
    },
  )

  .get(
    "/:workspaceId/invites",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:read"),
    async (c) => c.json(await listWorkspaceInvites(c.req.valid("param").workspaceId)),
  )

  .post(
    "/:workspaceId/invites",
    zv("param", workspaceIdParamSchema),
    requireWorkspaceAccess("workspace:invite"),
    zv("json", createInviteSchema),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const { email, role } = c.req.valid("json");
      const invite = await inviteToWorkspace(workspaceId, email, role, c.get("userId"));
      return c.json(invite, 201);
    },
  )

  .delete(
    "/:workspaceId/invites/:inviteId",
    zv("param", inviteParamSchema),
    requireWorkspaceAccess("workspace:invite"),
    async (c) => {
      const { workspaceId, inviteId } = c.req.valid("param");
      await revokeWorkspaceInvite(workspaceId, inviteId);
      return c.json({ message: "Invite revoked" });
    },
  );
