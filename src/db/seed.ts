import { and, eq } from "drizzle-orm";

import { db } from "../lib/db";
import { actionRuns, actions, actionSteps } from "./schema/actions";
import { users } from "./schema/auth";
import { connections } from "./schema/connections";
import { playgroundBoards, playgroundTiles } from "./schema/playground";
import { resourceFolders, resources } from "./schema/resources";
import { runs } from "./schema/runs";
import { workspaceMembers, workspaces } from "./schema/workspaces";

const DEMO_WORKSPACE_NAME = "Demo Workspace";
const BASE_URL = "https://jsonplaceholder.typicode.com";

// Sample user bodies shaped to exercise type inference and semantic faking:
// `status` repeats across samples (isEnumLike), `phone` is sometimes absent
// (optional), `deletedAt` mixes null and dates (nullable), `address` is a
// nested object, and email/name/url/_at names trigger falso's heuristics.
function sampleUser(index: number) {
  const statuses = ["active", "inactive", "pending", "active", "active"];
  const base: Record<string, unknown> = {
    id: index + 1,
    name: ["Leanne Graham", "Ervin Howell", "Clementine Bauch", "Patricia Lebsack", "Chelsey Dietrich"][index % 5],
    email: `user${index + 1}@example.com`,
    website: `https://user${index + 1}.example.dev`,
    status: statuses[index % statuses.length],
    orderCount: 3 + index * 2,
    deletedAt: index % 3 === 0 ? null : new Date(Date.UTC(2026, 5, 10 + index)).toISOString(),
    createdAt: new Date(Date.UTC(2026, 0, 5 + index)).toISOString(),
    address: { street: `${index + 10} Main St`, city: "Gwenborough", zipcode: `9299${index}` },
  };
  if (index % 2 === 0) base.phone = `1-770-736-80${10 + index}`;
  return base;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function httpRunRequest(method: string, path: string, body?: unknown) {
  return { method, url: `${BASE_URL}${path}`, headers: { accept: "application/json" }, body };
}

async function main() {
  const email = process.env.SEED_EMAIL;
  const [user] = email
    ? await db.select().from(users).where(eq(users.email, email))
    : await db.select().from(users).limit(1);

  if (!user) {
    console.log(
      email
        ? `Seed skipped — no user with email ${email}. Sign up first, or unset SEED_EMAIL to use the first user.`
        : "Seed skipped — no users exist yet. Sign up a user first.",
    );
    return;
  }

  const existing = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.name, DEMO_WORKSPACE_NAME), eq(workspaces.createdBy, user.id)));
  if (existing.length > 0) {
    console.log(`Seed skipped — "${DEMO_WORKSPACE_NAME}" already exists. Delete it to re-seed (cascades clean up).`);
    return;
  }

  console.log(`Seeding demo data for ${user.email}...`);

  const [workspace] = await db
    .insert(workspaces)
    .values({ name: DEMO_WORKSPACE_NAME, createdBy: user.id })
    .returning();
  if (!workspace) throw new Error("Failed to insert workspace");
  await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "owner" });

  const [httpConnection] = await db
    .insert(connections)
    .values({
      workspaceId: workspace.id,
      kind: "http",
      name: "JSONPlaceholder",
      config: { baseUrl: BASE_URL, auth: { type: "none" } },
      createdBy: user.id,
    })
    .returning();
  const [firebaseConnection] = await db
    .insert(connections)
    .values({
      workspaceId: workspace.id,
      kind: "firebase",
      name: "Demo Firebase",
      config: {
        projectId: "demo-project",
        apiKey: "AIzaSyDemoKeyReplaceWithYourOwn",
        databaseURL: "https://demo-project-default-rtdb.firebaseio.com",
      },
      createdBy: user.id,
    })
    .returning();
  if (!httpConnection || !firebaseConnection) throw new Error("Failed to insert connections");

  const [usersFolder] = await db
    .insert(resourceFolders)
    .values({ workspaceId: workspace.id, name: "Users API", createdBy: user.id })
    .returning();
  const [contentFolder] = await db
    .insert(resourceFolders)
    .values({ workspaceId: workspace.id, name: "Content", createdBy: user.id })
    .returning();
  if (!usersFolder || !contentFolder) throw new Error("Failed to insert folders");
  const [postsFolder] = await db
    .insert(resourceFolders)
    .values({ workspaceId: workspace.id, name: "Posts", parentFolderId: contentFolder.id, createdBy: user.id })
    .returning();
  if (!postsFolder) throw new Error("Failed to insert nested folder");

  const [listUsers] = await db
    .insert(resources)
    .values({
      workspaceId: workspace.id,
      folderId: usersFolder.id,
      connectionId: httpConnection.id,
      kind: "http",
      direction: "invoke",
      danger: "safe",
      name: "List users",
      address: "/users",
      config: { method: "GET", bodyType: "none" },
      createdBy: user.id,
    })
    .returning();
  const [getPost] = await db
    .insert(resources)
    .values({
      workspaceId: workspace.id,
      folderId: postsFolder.id,
      connectionId: httpConnection.id,
      kind: "http",
      direction: "invoke",
      danger: "safe",
      name: "Get post by id",
      address: "/posts/{{postId}}",
      config: { method: "GET", bodyType: "none" },
      createdBy: user.id,
    })
    .returning();
  const [createPost] = await db
    .insert(resources)
    .values({
      workspaceId: workspace.id,
      folderId: postsFolder.id,
      connectionId: httpConnection.id,
      kind: "http",
      direction: "invoke",
      danger: "mutating",
      name: "Create post",
      address: "/posts",
      payloadTemplate: { title: "{{title}}", body: "Written from Action Wise", userId: 1 },
      config: { method: "POST", bodyType: "json" },
      createdBy: user.id,
    })
    .returning();
  const [deletePost] = await db
    .insert(resources)
    .values({
      workspaceId: workspace.id,
      folderId: postsFolder.id,
      connectionId: httpConnection.id,
      kind: "http",
      direction: "invoke",
      danger: "destructive",
      name: "Delete post 1",
      address: "/posts/1",
      config: { method: "DELETE", bodyType: "none" },
      createdBy: user.id,
    })
    .returning();
  const [rtdbOrders] = await db
    .insert(resources)
    .values({
      workspaceId: workspace.id,
      connectionId: firebaseConnection.id,
      kind: "firebase_rtdb",
      direction: "subscribe",
      danger: "safe",
      name: "Live orders feed",
      address: "orders/live",
      config: { mode: "listen", eventFilter: "value" },
      createdBy: user.id,
    })
    .returning();
  const [firestoreCustomers] = await db
    .insert(resources)
    .values({
      workspaceId: workspace.id,
      connectionId: firebaseConnection.id,
      kind: "firebase_firestore",
      direction: "invoke",
      danger: "safe",
      name: "Customers collection",
      address: "customers",
      config: { mode: "read_once" },
      createdBy: user.id,
    })
    .returning();
  if (!listUsers || !getPost || !createPost || !deletePost || !rtdbOrders || !firestoreCustomers) {
    throw new Error("Failed to insert resources");
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (let i = 0; i < 6; i++) {
    await db.insert(runs).values({
      workspaceId: workspace.id,
      resourceId: listUsers.id,
      triggeredBy: user.id,
      request: httpRunRequest("GET", "/users"),
      response: { status: 200, headers: JSON_HEADERS, body: [sampleUser(i), sampleUser(i + 1), sampleUser(i + 2)] },
      status: "success",
      durationMs: 120 + i * 35,
      executedAt: new Date(now - (6 - i) * dayMs),
    });
  }

  for (let i = 0; i < 3; i++) {
    await db.insert(runs).values({
      workspaceId: workspace.id,
      resourceId: rtdbOrders.id,
      triggeredBy: user.id,
      request: { kind: "firebase_rtdb", mode: "listen", path: "orders/live", eventFilter: "value" },
      response: {
        orderId: `ord_${1000 + i}`,
        amount: 24.5 + i * 10,
        status: ["paid", "pending", "paid"][i],
        placedAt: new Date(now - (3 - i) * dayMs).toISOString(),
      },
      status: "success",
      durationMs: 40 + i * 12,
      executedAt: new Date(now - (3 - i) * dayMs),
    });
  }

  await db.insert(runs).values({
    workspaceId: workspace.id,
    resourceId: getPost.id,
    triggeredBy: user.id,
    request: httpRunRequest("GET", "/posts/1"),
    response: {
      status: 200,
      headers: JSON_HEADERS,
      body: { userId: 1, id: 1, title: "sunt aut facere", body: "quia et suscipit" },
    },
    status: "success",
    durationMs: 95,
    executedAt: new Date(now - 2 * dayMs),
  });

  await db.insert(runs).values({
    workspaceId: workspace.id,
    resourceId: listUsers.id,
    triggeredBy: user.id,
    request: httpRunRequest("GET", "/users"),
    response: { error: "fetch failed: getaddrinfo ENOTFOUND jsonplaceholder.typicode.com" },
    status: "error",
    executedAt: new Date(now - 5 * dayMs),
  });

  const [board] = await db
    .insert(playgroundBoards)
    .values({ workspaceId: workspace.id, userId: user.id, name: "Demo Board" })
    .returning();
  if (!board) throw new Error("Failed to insert board");

  await db.insert(playgroundTiles).values([
    {
      boardId: board.id,
      resourceId: listUsers.id,
      layout: { x: 0, y: 0, w: 4, h: 3 },
      renderMode: "json_tree",
      position: 0,
    },
    {
      boardId: board.id,
      resourceId: rtdbOrders.id,
      layout: { x: 4, y: 0, w: 4, h: 3 },
      renderMode: "raw",
      position: 1,
    },
    {
      boardId: board.id,
      adhocConfig: {
        kind: "http",
        connectionId: httpConnection.id,
        address: "/todos",
        config: { method: "GET", bodyType: "none" },
      },
      layout: { x: 8, y: 0, w: 4, h: 3 },
      renderMode: "table",
      position: 2,
    },
    {
      boardId: board.id,
      resourceId: listUsers.id,
      layout: { x: 0, y: 3, w: 2, h: 2 },
      renderMode: "big_number",
      position: 3,
    },
  ]);

  const [demoAction] = await db
    .insert(actions)
    .values({
      workspaceId: workspace.id,
      name: "Create post and verify",
      description: "Lists users, creates a post titled after the first user, then fetches it back.",
      createdBy: user.id,
    })
    .returning();
  if (!demoAction) throw new Error("Failed to insert action");

  const [step1] = await db
    .insert(actionSteps)
    .values({ actionId: demoAction.id, resourceId: listUsers.id, order: 0, name: "list_users" })
    .returning();
  const [step2] = await db
    .insert(actionSteps)
    .values({
      actionId: demoAction.id,
      resourceId: createPost.id,
      order: 1,
      name: "create_post",
      inputMapping: { title: "Post by {{steps.list_users.response.body.0.name}}" },
    })
    .returning();
  const [step3] = await db
    .insert(actionSteps)
    .values({
      actionId: demoAction.id,
      resourceId: getPost.id,
      order: 2,
      name: "fetch_post",
      inputMapping: { postId: "{{steps.create_post.response.body.id}}" },
    })
    .returning();
  if (!step1 || !step2 || !step3) throw new Error("Failed to insert steps");

  const runStartedAt = new Date(now - dayMs);
  const [demoActionRun] = await db
    .insert(actionRuns)
    .values({
      actionId: demoAction.id,
      workspaceId: workspace.id,
      status: "success",
      triggeredBy: user.id,
      startedAt: runStartedAt,
      finishedAt: new Date(runStartedAt.getTime() + 2100),
    })
    .returning();
  if (!demoActionRun) throw new Error("Failed to insert action run");

  await db.insert(runs).values([
    {
      workspaceId: workspace.id,
      resourceId: listUsers.id,
      stepId: step1.id,
      actionRunId: demoActionRun.id,
      triggeredBy: user.id,
      request: httpRunRequest("GET", "/users"),
      response: { status: 200, headers: JSON_HEADERS, body: [sampleUser(0), sampleUser(1)] },
      status: "success",
      durationMs: 140,
      executedAt: runStartedAt,
    },
    {
      workspaceId: workspace.id,
      resourceId: createPost.id,
      stepId: step2.id,
      actionRunId: demoActionRun.id,
      triggeredBy: user.id,
      request: httpRunRequest("POST", "/posts", {
        title: "Post by Leanne Graham",
        body: "Written from Action Wise",
        userId: 1,
      }),
      response: {
        status: 201,
        headers: JSON_HEADERS,
        body: { id: 101, title: "Post by Leanne Graham", body: "Written from Action Wise", userId: 1 },
      },
      status: "success",
      durationMs: 180,
      executedAt: new Date(runStartedAt.getTime() + 700),
    },
    {
      workspaceId: workspace.id,
      resourceId: getPost.id,
      stepId: step3.id,
      actionRunId: demoActionRun.id,
      triggeredBy: user.id,
      request: httpRunRequest("GET", "/posts/101"),
      response: {
        status: 200,
        headers: JSON_HEADERS,
        body: { id: 101, title: "Post by Leanne Graham", body: "Written from Action Wise", userId: 1 },
      },
      status: "success",
      durationMs: 90,
      executedAt: new Date(runStartedAt.getTime() + 1500),
    },
  ]);

  console.log(`Seed complete for ${user.email}:`);
  console.log(`  workspace "${DEMO_WORKSPACE_NAME}" (${workspace.id})`);
  console.log("  2 connections, 3 folders, 6 resources, 13 runs");
  console.log('  1 playground board ("Demo Board", 4 tiles)');
  console.log('  1 action ("Create post and verify", 3 steps, 1 completed run)');
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
