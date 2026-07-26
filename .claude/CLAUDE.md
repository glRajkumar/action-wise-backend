# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Action Wise

This repo is the backend for "Action Wise" (full product spec: `../.claude/handover.md`, cross-repo notes: `../.claude/CLAUDE.md`). The handover spec assumes a single pnpm monorepo (`apps/api`/`apps/web`/`packages/*`) — **that restructure was explicitly declined (2026-07-26); this stays a standalone repo through Phase 1.** Action Wise is a backend knowledge base/execution layer — Resources, Actions, Flows, Runs, Registry, Workspaces — being built out here section by section per the handover (A → G).

Stack already matches the target spec: Hono, Postgres+Drizzle, TypeScript strict, Zod. Architectural choices made along the way that weren't in the spec are logged in `../DECISIONS.md` — check it before assuming why a table/column is shaped the way it is. **Gaps vs. the spec to know about before extending:**
- No `packages/shared`, and there won't be one — Zod schemas are NOT shared with `frontent/`. Define request/response schemas here in `src/validations/`; when the frontend needs the matching shape, its schema is hand-written/synced separately, not imported. No compile-time guarantee they match — flag it when a schema changes shape.
- Auth is email/password only — handover also calls for GitHub OAuth (not implemented).
- `src/db/schema/` has the full Phase 1 domain model (`workspaces.ts`, `connections.ts`, `resources.ts`, `playground.ts`, `actions.ts`, `runs.ts`, `flow.ts` — barrel at `schema/index.ts`), migrated (`drizzle/0000_lazy_cable.sql`).
- **Sections B, C, D's backend half, E, and F are built; G and D's frontend (grid board, ring buffer) are not.** Workspace CRUD/members/invites, `can()`, Connection/Resource CRUD, Playground boards/tiles/execution/promote, TS type export, and fake data generation all exist (see Architecture below). Actions (section G) has schema only — no routes/controllers yet.
- No Vitest — no test runner configured at all currently.
- **New required env var**: `CONNECTION_SECRET_KEY` (base64, must decode to exactly 32 bytes) — the app throws at import time without it, same eager-validation pattern as the other env vars. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and add it to your own `.env` (not committed, not read by any tooling here).

Where handover conventions and the global CLAUDE.md coding rules disagree, global wins for code-writing patterns (see `../.claude/CLAUDE.md` → Global conventions). Concretely here: implement the handover's "single `AppError` type, consistent JSON error envelope" as `{ message: string }`, matching the existing global response convention — don't invent a new envelope shape.

## State of repo

Auth-focused Hono backend built on `better-auth`, Drizzle (Postgres/Neon), and Redis. Not a bare skeleton anymore — email/password auth, email verification, password reset, and account deletion are wired end-to-end. There are no custom routes/controllers beyond auth; new features should follow the layered structure in the global CLAUDE.md (routes → controllers → services) once they're added.

## Commands

- `pnpm dev` — tsx watch src/index.ts (dev server, hot reload, port 3000)
- `pnpm build` — tsc compile to dist/
- `pnpm start` — node dist/index.js (run compiled build)
- `pnpm db:generate` / `pnpm db:push` — generate/apply migrations from `src/db/schema` (config in `drizzle.config.ts`, output to `./drizzle`)
- `pnpm db:seed` — runs `src/db/seed.ts`; currently just a DB-reachability check, no domain rows yet (personal-workspace-on-signup will be the first real seed consumer)

No test runner or lint config. Manual API testing via `src/test/auth.http` (VS Code REST Client) — covers sign-up, sign-in, verify-email, forgot/reset password, change password, delete-user, sign-out.

## Architecture

**Auth is entirely delegated to `better-auth`.** `src/lib/auth.ts` constructs the `auth` instance and is the real center of the app:
- Drizzle adapter (`drizzleAdapter`) backs it with Postgres, schema from `src/db/schema/auth.ts` (users/sessions/accounts/verifications, `usePlural: true`).
- Redis (`src/lib/connect-redis.ts`) is wired in as `secondaryStorage` for get/set/delete — used for session/rate-limit state, not a general cache.
- Password hashing uses `@node-rs/argon2` via `hashPassword`/`verifyPassword` in `src/utils/password.ts`, passed into `emailAndPassword.password`.
- Email hooks (`sendResetPassword`, `sendVerificationEmail`, `sendDeleteAccountVerification`) come from `src/templates/emails/*` and are passed directly into the betterAuth config, not called manually.
- A welcome email fires from an `after` hook (`createAuthMiddleware`) that matches on `ctx.path.startsWith('/sign-up')` — this is the only custom auth hook.
- `connectRedis()` is awaited at module load time in `src/lib/auth.ts`; if it throws, the process exits(1) immediately. Redis must be reachable for the app to boot.

**Routing (`src/index.ts`)**: all routes are mounted on `basePath("/api")`. `/api/auth/*` is handled directly inline (`c => auth.handler(c.req.raw)`) — `requireAuth` middleware is registered globally with `app.use(requireAuth)` but placed *after* the auth routes, so it does not gate them; it applies to everything mounted below it. `requireAuth` (`src/middlewares/auth.ts`) calls `auth.api.getSession` and sets `userId` on context (typed via `AppEnv` in `src/types/hono.ts`).

**Domain schema (Phase 1, tables only — no routes yet)**: `src/db/schema/columns.helpers.ts` exports `idColumn`/`timestampColumns`/`createdByColumn` spreadable column groups (uuid v7 via `src/utils/id.ts`, `updated_at` auto-touched via `$onUpdate`) — every new domain table spreads these rather than redeclaring them. `src/db/schema/enums.ts` holds the `text` + CHECK-constraint role/status unions (`WORKSPACE_ROLES`, `INVITE_STATUSES`, `RUN_STATUSES`) — these are deliberately not `pgEnum`, see `../DECISIONS.md`. Closed sets not expected to grow (resource `kind`/`direction`/`danger`, connection `kind`, render mode, flow edge type/source) are native `pgEnum`.

**Error/validation conventions for new routes**: `src/utils/errors.ts` exports `AppError` (message + `ClientErrorStatusCode`), caught in `src/index.ts`'s `app.onError` and turned into `{ message }` JSON. `src/utils/validate.ts` exports `zv(target, schema)` — a `@hono/zod-validator` wrapper whose failure hook also returns `{ message }` at 400, so every new route's validation errors match the global response convention automatically.

**Workspaces (handover section B)**, mounted at `/api/workspaces` (`src/routes/workspaces.ts`): full CRUD, member list/role-change/remove, token-based invites (create/list/revoke/accept). Layering here is routes → controllers (`src/controllers/workspaces.ts`, framework-agnostic — take/return plain values, never touch `Context`) → services (`src/services/workspaces.ts`, all the Drizzle queries). Routes do the `c.req.valid()` extraction and `c.json()` wrapping themselves rather than passing `Context` into controllers — Hono's `req.valid()` typing only works when the validator and handler are in the same route-registration chain, so a controller typed as accepting a bare `Context` can't call it type-safely. Don't try to "fix" this by giving controllers a `Context` param; it's why the split is done this way.

- `src/utils/permissions.ts` — `can(userId, action, subject)` (handover's literal ask) plus the lower-level `getWorkspaceRole`/`roleHasPermission` it's built from. `ROLE_PERMISSIONS` is the *only* place role→action mapping lives; extending for per-resource overrides later means editing this map, not call sites.
- `src/middlewares/workspace-access.ts` — `requireWorkspaceAccess(action)`, applied per-route. Always re-derives membership from the DB against the session's `userId`, never trusts the `:workspaceId` path param. 404 for non-members, 403 for members with the wrong role — see `../DECISIONS.md` for why that split exists.
- `src/services/invite-email.ts` — `InviteEmailSender` interface, `inviteEmailSender` is the console-logging stub instance per the handover's explicit ask. Swap the instance to add real sending later.
- Personal workspace on signup is wired into the *existing* `after` hook in `src/lib/auth.ts` (the one that already sends the welcome email) — it calls `createWorkspaceWithOwner` from `services/workspaces.ts` when `ctx.context.newSession?.user` is present. Don't add a second signup hook; extend that one.
- `src/test/workspaces.http` — manual test file for all of the above, same REST Client pattern as `auth.http`.

**Connections & Registry (handover section C)**, mounted at `/api/workspaces/:workspaceId/connections` and `/api/workspaces/:workspaceId/resources` + `/resource-folders` (`src/routes/connections.ts`, `src/routes/resources.ts`) — same routes → controllers → services layering and the same "controllers never touch `Context`" rule as workspaces.

- `src/services/crypto.ts` — `encryptSecret`/`decryptSecret`, AES-256-GCM, key from `env.CONNECTION_SECRET_KEY`. `src/services/connections.ts`'s `getDecryptedConnectionSecret` is internal-only (Playground/Actions execution, sections D/G) — nothing in C exposes a decrypted secret over the API; list/get responses only ever carry a `hasSecret: boolean` for the *requesting* user.
- Connection/resource permissions are separate `WorkspaceAction`s (`connection:read/write/delete`, `resource:read/write/delete`) in the same `ROLE_PERMISSIONS` map in `utils/permissions.ts` — `editor` can write but not delete; `viewer` is read-only. See `../DECISIONS.md` for why.
- `resources.connectionId`/`resources.folderId` (and `resource_folders.parentFolderId`) are cross-checked against the resource's own `workspaceId` in `services/resources.ts` before every write — the DB FKs alone don't stop a resource from pointing at another workspace's connection.
- A resource's `kind` is immutable after creation (`updateResource` throws 400 on mismatch) since it determines the whole `config` shape — this is enforced in the service, not the Zod schema, because Zod can't compare against the existing DB row.
- `src/test/connections.http`, `src/test/resources.http` — manual coverage, same pattern as the other `.http` files.

**Playground (handover section D, backend half only)**, mounted at `/api/workspaces/:workspaceId/playground` (`src/routes/playground.ts`) — boards, tiles, HTTP execute, Firebase run logging, promote-to-registry. The grid drag/resize UI and the per-tile ring buffer are frontend-only and don't exist here (ring buffer is never persisted at all — see `../DECISIONS.md`).

- Gating differs from C: board/tile CRUD and execute only require `workspace:read` (any member, including `viewer`) since Playground is a personal scratchpad, not shared content — see `../DECISIONS.md`. Only `POST .../tiles/:tileId/promote` requires `resource:write`, because that's the one endpoint that writes a real `resources` row.
- `src/services/http-execute.ts` — the actual HTTP client: `{{variable}}` templating (`resolveTemplate`/`resolveTemplateDeep`), auth header construction from a connection's `auth` type + the user's decrypted secret (`buildAuthHeaders`), header redaction before persisting (`redactHeaders`), and the `fetch` wrapper with a 30s timeout (`executeHttpRequest`). Pure functions — no DB access — kept separate from `services/playground.ts` on purpose.
- `HttpConnectionConfig` (`db/schema/connections.ts`) grew an `auth` field in this section (`none`/`bearer`/`apiKey`/`basic`) — it didn't exist when Connections shipped in C because nothing needed to actually *use* a connection yet. See `../DECISIONS.md` if a Connection created before this looks like it's missing the field (jsonb, no migration was needed, but existing rows written via the old shape won't have `auth` and execution will fail against them).
- A tile is either `resourceId`-backed (points at a saved Resource) or `adhocConfig`-backed (its own inline kind/address/config, not yet saved) — never both, enforced by a Zod `.refine` in `validations/playground.ts`. `POST .../promote` is what turns the latter into the former, via the same `createResource` service from section C.
- Only `kind: "http"` tiles can hit `POST .../execute` (proxied server-side per the handover). Firebase tiles execute client-side and get recorded via `POST .../tiles/:tileId/runs` instead, carrying whatever `request`/`response`/`status` the frontend already has.
- `src/test/playground.http` — manual coverage, same pattern as the other `.http` files.

**Beautify & Faker (handover E/F)**, two extra endpoints bolted onto `src/routes/resources.ts` rather than a new router: `GET /:workspaceId/resources/:resourceId/export-type` and `POST .../fake-data` (both `resource:read`). Both are pure/ephemeral — nothing is persisted, every call re-derives from the resource's recorded `runs`.

- `src/services/type-inference.ts` — `inferTypeFromSamples`/`renderTypeScript`. Deliberately flatter than a full quicktype engine (a field is assumed consistently primitive/object/array across samples, not a mixed shape) — see `../DECISIONS.md`. `isEnumLike` is the important bit: a string field only becomes a literal union if some value *repeats* across samples, not just because the distinct count is small — with few Runs, everything looks like a small closed set otherwise (this was a real bug, caught and fixed by hand-testing before trusting it).
- `src/services/faker.ts` — `generateFakeRecords`, built on **`@ngneat/falso`** (per explicit instruction, not a default choice). Field-name regex heuristics (email/id·uuid/name/phone/url/price·amount/`_at`·date/status/description) pick a generator; an `isEnumLike` field's real observed values always win over a name guess; genuinely unmatched strings fall back to `randNoun()` — never a bare `"string"` placeholder, per the handover's explicit "a type-only generator... is a failure."
- `src/services/beautify.ts` orchestrates both: pulls successful `runs.response` rows for a resource (unwrapping `.body` for `http`, using the raw value for firebase kinds — see the comment there for why), runs it through inference, then either renders TS or hands the shape to `faker.ts`. Throws 400 if the resource has zero successful runs yet — there's nothing to infer from.

**Env validation** (`src/utils/env.ts`): all required vars (`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `EMAIL_ID`, `EMAIL_PASS`) are asserted eagerly via `requiredEnv()` — missing any one throws at import time, before the server starts.

**Email sending** (`src/services/transporter.ts`): nodemailer configured for Gmail service using `EMAIL_ID`/`EMAIL_PASS`. All templates share one HTML shell (`src/templates/emails/template.ts`) and are exported through `src/templates/emails/index.ts`.

## Known dead code (do not build on these without checking first)

- `src/schema/auth.ts` is a stale duplicate of `src/db/schema/auth.ts`. Only `src/db/schema/auth.ts` is imported by `lib/auth.ts` and referenced by `drizzle.config.ts`. Don't edit the one under `src/schema/`.
- `src/routes/auth.ts` (`authRouter`) is not imported anywhere — `src/index.ts` reimplements the same `/auth/*` passthrough inline instead of using it.

## Tooling notes

- Package manager: pnpm (pnpm-workspace.yaml present) — use pnpm, not npm, despite any README wording.
- ESM (`"type": "module"`), TypeScript strict mode, `verbatimModuleSyntax: true` — local imports need explicit `.js` extensions once compiled output matters.
- `jsxImportSource: hono/jsx` configured — Hono JSX rendering available if needed, unused so far.
- `rootDir: src`, `outDir: dist`.
