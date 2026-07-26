# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Action Wise

This repo is the current stand-in for the future `apps/api` in the "Action Wise" monorepo (full product spec: `../.claude/handover.md`, cross-repo notes: `../.claude/CLAUDE.md`). Action Wise is a backend knowledge base/execution layer — Resources, Actions, Flows, Runs, Registry, Workspaces — none of which exist here yet. This repo is only the Phase 1 **Foundation + Auth** slice (handover sections A/B), built before the monorepo restructure happened.

Stack already matches the target spec: Hono, Postgres+Drizzle, TypeScript strict, Zod. **Gaps vs. the spec to know about before extending:**
- No `packages/shared` — schemas aren't shared with the frontend; each repo defines its own.
- Auth is email/password only — handover also calls for GitHub OAuth (not implemented).
- No Workspace concept, no `owner|admin|editor|viewer` roles, no `can(user, action, subject)` permission helper, no per-user `connection_secrets` table, no auto-created personal workspace on signup — all spec'd, none built.
- No Vitest — no test runner configured at all currently.

Where handover conventions and the global CLAUDE.md coding rules disagree, global wins for code-writing patterns (see `../.claude/CLAUDE.md` → Global conventions). Concretely here: implement the handover's "single `AppError` type, consistent JSON error envelope" as `{ message: string }`, matching the existing global response convention — don't invent a new envelope shape.

## State of repo

Auth-focused Hono backend built on `better-auth`, Drizzle (Postgres/Neon), and Redis. Not a bare skeleton anymore — email/password auth, email verification, password reset, and account deletion are wired end-to-end. There are no custom routes/controllers beyond auth; new features should follow the layered structure in the global CLAUDE.md (routes → controllers → services) once they're added.

## Commands

- `pnpm dev` — tsx watch src/index.ts (dev server, hot reload, port 3000)
- `pnpm build` — tsc compile to dist/
- `pnpm start` — node dist/index.js (run compiled build)
- `pnpm drizzle-kit generate` / `pnpm drizzle-kit push` — generate/apply migrations from `src/db/schema` (config in `drizzle.config.ts`, output to `./drizzle`)

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
