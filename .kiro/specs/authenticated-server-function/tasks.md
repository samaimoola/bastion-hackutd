# Implementation Plan: authenticated-server-function

## Overview

The plan adds one client function middleware, one protected server function, and the registration in `src/start.ts`, then verifies them. Language: TypeScript (existing project, bun and Vitest). Steps run in order. Dependencies are never added or changed. File changes are limited to the files allowed by Requirement 7.8, on branch `backend-setup`.

Rules for every task:

- Do not edit generated files (`src/integrations/supabase/*`, `src/routeTree.gen.ts`), UI screens, schema, `supabase/migrations/`, `drizzle/`, `package.json`, or `bun.lock`.
- Do not run `npm install` (or `npm`, `pnpm`, `yarn` installs) in the repository.
- Do not commit, push, rebase, amend, or stage anything.
- Do not print or read tokens, credentials, full claims objects, or `.env` values in any command or report. Fake tokens come only from the tests.

## Tasks

- [ ] 1. Environment check and smoke import
  - [ ] 1.1 Check the working environment (read-only)
    - Run `git branch --show-current` and confirm it prints `backend-setup`.
    - Check whether `node_modules/` exists and whether `bun` is available (`command -v bun`). Report which of these are missing.
    - If `node_modules/` is missing, ask the user (`user_input`) whether to install dependencies. If `bun` is available, the command is `bun install --frozen-lockfile`. If `bun` is missing, offer `npx bun install --frozen-lockfile` (untested) or installing bun themselves. Run an install only after the user agrees. If the user declines or no option works, record "dependencies not installed" and continue with the code tasks. Every later task that needs dependencies (1.2, the test runs in 5.x, 6.x, 7.x) is then recorded as NOT RUN with that reason, never as passed, and the tests written in 5.x are reported as unexecuted.
    - Never use `npm install` in the repository.
    - After any install, confirm that `git status --short` shows no change to `package.json` or `bun.lock`.
    - _Requirements: 7.6, 7.7, 6.4_

  - [ ] 1.2 Smoke import of the framework in Vitest
    - Only if dependencies are installed. Create a temporary `src/test/smoke-start-import.test.ts` that imports `createMiddleware`, `createServerFn`, `createStart`, and `createCsrfMiddleware` from `@tanstack/react-start` and asserts they are functions.
    - Run it with `bun run test -- --run src/test/smoke-start-import.test.ts`, then delete the file.
    - Record the result. If the import fails in jsdom, tasks 5.1 to 5.5 use `vi.mock("@tanstack/react-start", ...)` with a minimal `createMiddleware` stub that records `client` and `server` in `options`, and the `startInstance` registration example in 5.1 becomes a source-text check (design, "Test environment risk").
    - _Requirements: 5.7_

- [ ] 2. Create the client and server function middleware module
  - [ ] 2.1 Create `src/lib/supabase-bearer-middleware.ts`
    - Export `forwardSupabaseToken`: `createMiddleware({ type: "function" }).client(...)`. Return `next()` when `typeof window === "undefined"`. Otherwise read `supabase.auth.getSession()` from `@/integrations/supabase/client`. Return `next()` when there is no `data.session?.access_token`. Otherwise return `next({ headers: { Authorization: \`Bearer ${token}\` } })` and pass nothing else.
    - Export `unauthorizedToResponse`: `createMiddleware({ type: "function" }).server(...)` that awaits `next()` in a `try`. In the `catch`, throw `new Response("Unauthorized", { status: 401, headers: { "content-type": "text/plain;charset=UTF-8", "www-authenticate": "Bearer" } })` only for an `Error` whose message starts with `Unauthorized`. Rethrow every other value by identity.
    - No `console` calls, no token in any message, no import of `client.server.ts`, no symbol named `attachSupabaseAuth`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.4, 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 4.8_

- [ ] 3. Create the protected server function
  - [ ] 3.1 Create `src/lib/auth.functions.ts`
    - Export `getAuthenticatedUserId = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => ({ userId: context.userId }))`, importing `requireSupabaseAuth` from `@/integrations/supabase/auth-middleware`.
    - Assign `createServerFn` directly to the exported variable (compiler requirement). Do not import `client.server.ts`. Read only `context.userId`. No logging.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.4_

- [ ] 4. Register the middleware in `src/start.ts`
  - [ ] 4.1 Edit `src/start.ts`
    - Import `forwardSupabaseToken` and `unauthorizedToResponse` from `./lib/supabase-bearer-middleware`.
    - Add `functionMiddleware: [forwardSupabaseToken, unauthorizedToResponse]` to the object returned to `createStart`.
    - Keep `requestMiddleware: [errorMiddleware, csrfMiddleware]`, `errorMiddleware`, `csrfMiddleware`, and the `ctx.handlerType === "serverFn"` filter byte-identical.
    - Replace the stale `attachSupabaseAuth` comment with a short accurate one saying a local client middleware sends the Bearer token and a local server middleware maps auth failures to 401. Import no symbol named `attachSupabaseAuth`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 5. Add tests in `src/test/`
  - [ ] 5.1 Create `src/test/supabase-bearer-middleware.test.ts` with mocks, generator, and example tests
    - Mock `@/integrations/supabase/client` with `vi.mock` so `supabase.auth.getSession` is a `vi.fn`. No network calls, no `.env` reads, fake tokens only.
    - Add a small seeded pseudo-random generator (strings, objects, opaque values) for 100-iteration property loops. Do not add `fast-check`.
    - Example tests: `await startInstance.getOptions()` (it is async) has `functionMiddleware` containing both middleware; `requestMiddleware` has length 2 with the CSRF marker `Symbol.for("tanstack-start:csrf-middleware")` on the second element only; the CSRF middleware calls `next` for `handlerType: "router"` and returns 403 for `handlerType: "serverFn"` without `Sec-Fetch-Site`, `Origin`, or `Referer`; `src/start.ts` text has no import binding named `attachSupabaseAuth`.
    - Calls handlers directly through `forwardSupabaseToken.options.client(...)` and `unauthorizedToResponse.options.server(...)` with a fake `next`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 5.6_

  - [ ] 5.2 Write property test for token forwarding
    - **Property 1: Token present produces exactly one Bearer header, transparently and silently**
    - 100 iterations with generated non-empty tokens and opaque `next` results. Spy on all `console` methods and assert the token never appears.
    - **Validates: Requirements 1.2, 1.4, 1.5, 1.6, 5.3**

  - [ ] 5.3 Write property test for the no-session case
    - **Property 2: No usable session produces no Authorization header**
    - Cover null session, session without token, empty token, and `window` undefined (stub with `vi.stubGlobal`, restore after). Assert `getSession` is not called in the non-browser state.
    - **Validates: Requirements 1.3, 1.5, 5.4**

  - [ ] 5.4 Write property test for the 401 mapping
    - **Property 4: Unauthorized errors become a plain 401**
    - Generated messages `Unauthorized` plus arbitrary text. Assert status 401, `text/plain` content type, body exactly `Unauthorized`, and that the arbitrary text appears in neither body nor headers.
    - **Validates: Requirements 4.1, 4.2, 4.3, 5.8**

  - [ ] 5.5 Write property test for pass-through
    - **Property 5: Everything else passes through unchanged**
    - Thrown values: other `Error` messages, `Unauthorized` only after other text, objects with `statusCode`, non-`Error` values, `Response` objects. Assert identity on rethrow and identity of returned values.
    - **Validates: Requirements 4.1, 4.2, 4.8, 5.8**

  - [ ] 5.6 Create `src/test/auth-functions.test.ts` with mocks and example tests
    - Mock `@tanstack/react-start` so `createServerFn(opts).middleware(m).handler(fn)` records `opts` and `m` and returns `fn`. Mock `@/integrations/supabase/auth-middleware` with a sentinel object.
    - Example tests: `createServerFn` receives `{ method: "POST" }`; `.middleware()` receives exactly `[sentinel]`; the text of `src/lib/auth.functions.ts` has no import or `import()` specifier containing `client.server`.
    - _Requirements: 3.2, 3.5, 5.1, 5.5, 5.6_

  - [ ] 5.7 Write property test for the handler result
    - **Property 3: The handler returns only the authenticated user ID**
    - Generated contexts with a string `userId` plus extra fields (claims, email, tokens, stand-in `supabase`). Assert the only own key is `userId`, the value matches, the serialized result contains none of the extra values, and no `console` output occurs.
    - **Validates: Requirements 3.3, 3.4, 3.6, 3.7, 5.2**

- [ ] 6. Run lint, build, and the full test suite
  - [ ] 6.1 Run `bun run lint`
    - Report only whether files added or modified by this feature have errors. Do not fix unrelated existing findings. Do not run `bun run format` on the repository.
    - _Requirements: 6.1_

  - [ ] 6.2 Run `bun run test`
    - The full suite must pass, including `src/test/app-routing.test.tsx`. Fix failures in the new files only.
    - _Requirements: 5.7_

  - [ ] 6.3 Run `bun run build`
    - The build must succeed. Do not commit build output.
    - _Requirements: 6.2_

  If `bun` or dependencies are unavailable (task 1.1), record 6.1 to 6.3 as NOT RUN, with the reason, and continue. Do not report them as passed.

- [ ] 7. Rejection_Check against a local dev server (if feasible)
  - [ ] 7.1 Start the dev server
    - Only if dependencies are installed. Ask the user to run `bun run dev` in their own terminal and give the port, or, with the user's agreement, start it with the background process tool and stop it after 7.2. If the server cannot be started, record the check as not run with the reason.
    - _Requirements: 6.3, 6.4_

  - [ ] 7.2 Send the two rejection requests and record status and body
    - Get the function id: `curl -s http://localhost:<port>/src/lib/auth.functions.ts | grep -o 'createClientRpc("[^"]*")'`.
    - Request without `Authorization`: `curl -i -X POST -H "x-tsr-serverFn: true" -H "Sec-Fetch-Site: same-origin" http://localhost:<port>/_serverFn/<id>`.
    - Request with a fake token: same command plus `-H "Authorization: Bearer invalid.token.value"`.
    - Expect status 401, `content-type: text/plain;charset=UTF-8`, and body exactly `Unauthorized` for both. Record only status and body. Do not read `.env`.
    - _Requirements: 4.1, 4.2, 4.3, 6.3, 6.4, 6.7_

- [ ] 8. Repository scope check (needs no dependencies, always run)
  - [ ] 8.1 Verify that only allowed files changed
    - Run `git branch --show-current` (expect `backend-setup`), `git diff --name-only`, and `git status --short`.
    - Search for `attachSupabaseAuth` under `src/` and confirm there is no match at all, because task 4.1 replaces the only existing mention (a comment in `src/start.ts`). Search `src/lib/auth.functions.ts` for `client.server` and confirm there is no match.
    - Confirm login and logout are untouched: no change to `src/routes/login.tsx`, `src/routes/_authenticated/`, `src/components/`, or `src/lib/demo-store.tsx`.
    - Allowed: `src/start.ts` (modified); `src/lib/supabase-bearer-middleware.ts`, `src/lib/auth.functions.ts`, `src/test/supabase-bearer-middleware.test.ts`, `src/test/auth-functions.test.ts` (new); `.kiro/specs/authenticated-server-function/*`.
    - Confirm no change under `src/integrations/supabase/`, no change to `src/routeTree.gen.ts`, `supabase/migrations/`, `drizzle/`, `package.json`, or `bun.lock`, and no `package-lock.json`. Confirm the smoke test file from 1.2 is gone. Report any other path and revert only files this plan created.
    - Do not commit or push. Leave the changes in the working tree.
    - _Requirements: 4.5, 6.9, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

- [ ] 9. Final verification report
  - [ ] 9.1 Present the report to the user
    - Section "Checks run": checks that actually executed (environment check, scope check, and, if dependencies were installed, smoke import, lint, tests, build, Rejection_Check), each with the command or method and the result (passed or failed).
    - Section "Not run": every check that did not execute, with the reason (for example "dependencies not installed"). State that the new test files are unexecuted when tests were not run.
    - Section "Pending": the Manual_Check (sign in on `/login`, run `await (await import("/src/lib/auth.functions.ts")).getAuthenticatedUserId()` in the DevTools console, confirm the result is `{ userId: "<uuid>" }` for the signed-in user), plus the note that it needs a running dev server.
    - End with one "Next action": the Manual_Check if all automated checks ran, otherwise "install dependencies" (Requirement 8.3). Do not list more than one action.
    - Include no `.env` value, token, or full claims object.
    - _Requirements: 6.5, 6.6, 6.7, 6.8, 6.10, 8.1, 8.2, 8.3, 8.4_

## Notes

- No task is optional. The property tests (5.2 to 5.5, 5.7) are required because Requirements 5.2, 5.3, 5.4, and 5.8 are only covered by them.
- Each task references specific requirements for traceability.
- Property tests use a local seeded generator and 100 iterations. No dependency is added.
- The Manual_Check is the only pending user action after the plan completes.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1"] },
    { "id": 3, "tasks": ["4.1", "5.6"] },
    { "id": 4, "tasks": ["5.1", "5.7"] },
    { "id": 5, "tasks": ["5.2"] },
    { "id": 6, "tasks": ["5.3"] },
    { "id": 7, "tasks": ["5.4"] },
    { "id": 8, "tasks": ["5.5"] },
    { "id": 9, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 10, "tasks": ["7.1"] },
    { "id": 11, "tasks": ["7.2"] },
    { "id": 12, "tasks": ["8.1"] },
    { "id": 13, "tasks": ["9.1"] }
  ]
}
```
