# Requirements Document

## Introduction

This feature adds one authenticated TanStack Start server function to the existing Bastion app and the client plumbing it needs. The project already contains the generated server middleware `requireSupabaseAuth` (in `src/integrations/supabase/auth-middleware.ts`), which expects an `Authorization: Bearer <access token>` header. Nothing in the repository sends that header. The name `attachSupabaseAuth` appears only in a comment in `src/start.ts`. It is not defined or exported anywhere in the repository (a repository-wide text search finds only that comment). This workspace has no `node_modules`, so the installed packages could not be searched. Instead, the tarballs of `@tanstack/react-start`, `@tanstack/start-client-core`, `@tanstack/start-server-core`, `@tanstack/start-plugin-core`, `@tanstack/router-core`, `@tanstack/start-fn-stubs`, and `@lovable.dev/vite-tanstack-config` at the versions in `bun.lock` and `package.json` were downloaded into a temporary directory outside the repository and searched. None of them contains the name. A local client function middleware is therefore defined instead, under a different name, and the comment's name and import are not used.

The feature has four parts:

1. A client function middleware that reads the current Supabase session access token and sends it as a Bearer header, registered through `functionMiddleware` in `src/start.ts`.
2. A server function middleware, registered in the same place, that turns the generated `requireSupabaseAuth` failures into a plain 401 response. This is needed because `requireSupabaseAuth` is generated and cannot be edited.
3. One server function in `src/lib/auth.functions.ts`, protected by `requireSupabaseAuth`, that returns only the authenticated user's ID.
4. Verification through automated tests, lint, build, a local rejection check, and one pending manual signed-in check. This working environment has no `node_modules` and no `bun`, so some of these checks may not be runnable here (see Requirement 6).

Existing login and logout behavior, the existing Supabase backend, and all generated files stay unchanged.

## Glossary

- **App**: The Bastion web application in this repository, built with TanStack Start.
- **Client_Auth_Middleware**: The new local client function middleware that attaches the Supabase access token to server function requests. Its exact name is chosen in the design and differs from `attachSupabaseAuth`.
- **Unauthorized_Mapping_Middleware**: The new local server function middleware, defined in the same local module as Client_Auth_Middleware, that converts an `Error` whose message starts with `Unauthorized` into a plain 401 `Response`. Its exact name is chosen in the design.
- **Start_Config**: The TanStack Start configuration in `src/start.ts`, which exports `startInstance`.
- **Request_Middleware**: The `requestMiddleware` array in Start_Config, currently containing `errorMiddleware` and `csrfMiddleware`.
- **Function_Middleware**: The `functionMiddleware` array in Start_Config, which runs only for server functions.
- **Require_Auth_Middleware**: The existing generated server function middleware `requireSupabaseAuth`, which validates the Bearer token and supplies `supabase` (a user-scoped client), `userId`, and `claims` in the middleware context.
- **Auth_Server_Function**: The one new server function defined in `src/lib/auth.functions.ts` that returns the authenticated user's ID.
- **Session**: The Supabase auth session held by the browser Supabase client in `src/integrations/supabase/client.ts`.
- **Access_Token**: The JWT access token contained in the Session.
- **User_Scoped_Client**: The Supabase client that Require_Auth_Middleware creates from the caller's Access_Token and exposes as `context.supabase`.
- **Admin_Client**: The service-role Supabase client in `src/integrations/supabase/client.server.ts`.
- **Generated_Files**: Files marked as automatically generated, including everything in `src/integrations/supabase/` and `src/routeTree.gen.ts`.
- **Test_Suite**: The automated Vitest tests run by `bun run test` (`vitest run`), with new tests placed in `src/test/`.
- **Local_Dev_Server**: A TanStack Start development server started on the developer's machine.
- **Manual_Check**: The single signed-in verification the user performs in the browser after signing in on the existing login page.

## Requirements

### Requirement 1: Client token attachment

**User Story:** As a developer, I want the client to send the signed-in user's access token with server function calls, so that protected server functions can identify the caller.

#### Acceptance Criteria

1. THE Client_Auth_Middleware SHALL be a local client function middleware defined in the repository, with a name other than `attachSupabaseAuth`.
2. WHEN a server function call is made and the Session exists, THE Client_Auth_Middleware SHALL send the Access_Token in the request header `Authorization` with the value `Bearer ` followed by the Access_Token.
3. WHEN a server function call is made and no Session exists, THE Client_Auth_Middleware SHALL send the request without an `Authorization` header.
4. THE Client_Auth_Middleware SHALL read the Access_Token from the Session of the existing browser Supabase client in `src/integrations/supabase/client.ts`.
5. THE Client_Auth_Middleware SHALL leave the request payload and the server function result unchanged.
6. THE Client_Auth_Middleware SHALL refrain from writing the Access_Token to any log, console output, or error message.

### Requirement 2: Middleware registration

**User Story:** As a developer, I want the client middleware registered for all server functions without disturbing existing request handling, so that protected server functions work and existing behavior stays intact.

#### Acceptance Criteria

1. THE Start_Config SHALL register Client_Auth_Middleware and Unauthorized_Mapping_Middleware in the Function_Middleware array of the object returned to `createStart`.
2. THE Start_Config SHALL keep the Request_Middleware array containing `errorMiddleware` and `csrfMiddleware` in their current order.
3. THE Start_Config SHALL keep the existing CSRF middleware filter `ctx.handlerType === "serverFn"` unchanged.
4. THE Start_Config SHALL import Client_Auth_Middleware and Unauthorized_Mapping_Middleware from a local module and SHALL import no symbol named `attachSupabaseAuth`.

### Requirement 3: Protected user ID server function

**User Story:** As a signed-in user, I want a protected server function that returns my user ID, so that I can confirm server-side authentication works.

#### Acceptance Criteria

1. THE Auth_Server_Function SHALL be defined in `src/lib/auth.functions.ts`.
2. THE Auth_Server_Function SHALL use Require_Auth_Middleware as its middleware.
3. WHEN an authenticated request invokes the Auth_Server_Function, THE Auth_Server_Function SHALL return an object whose only property is `userId`, with the value of the authenticated user's ID from the middleware context.
4. THE Auth_Server_Function SHALL obtain the user's identity from the middleware context supplied by Require_Auth_Middleware and from the User_Scoped_Client.
5. THE Auth_Server_Function SHALL leave the Admin_Client unused, with no import of `client.server.ts` in `src/lib/auth.functions.ts`.
6. THE Auth_Server_Function SHALL exclude the Access_Token, the claims object, email, and every other profile or session field from its return value.
7. THE Auth_Server_Function SHALL refrain from writing the Access_Token, credentials, claims, or environment values to any log or console output.

### Requirement 4: Unauthorized rejection

**User Story:** As a developer, I want unauthenticated and invalid-token requests rejected with a plain 401, so that callers receive a clear and uniform failure.

#### Acceptance Criteria

1. IF a request to the Auth_Server_Function carries no `Authorization` header, THEN THE App SHALL respond with HTTP status 401 and the plain-text body `Unauthorized`.
2. IF a request to the Auth_Server_Function carries an `Authorization` header that is not a well-formed Bearer token or whose token fails Supabase validation, THEN THE App SHALL respond with HTTP status 401 and the plain-text body `Unauthorized`.
3. IF a request is rejected as unauthorized, THEN THE App SHALL exclude the Access_Token, claims, environment values, and stack traces from the response body.
4. IF a request is rejected as unauthorized, THEN THE Auth_Server_Function SHALL leave its handler body unexecuted.
5. THE App SHALL produce the 401 response through Unauthorized_Mapping_Middleware, without editing Generated_Files.
6. WHEN a browser call to the Auth_Server_Function is rejected as unauthorized, THE call SHALL resolve with the 401 `Response` object instead of rejecting, because the framework returns raw responses to the caller. The design records this as expected behavior, and Client_Auth_Middleware SHALL NOT convert it, in line with Requirement 1.5.
7. THE Unauthorized_Mapping_Middleware SHALL apply to every server function that uses Require_Auth_Middleware, because it is registered in Function_Middleware. At the time of writing, no other server function in the repository uses Require_Auth_Middleware.
8. THE Unauthorized_Mapping_Middleware SHALL rethrow, unchanged, every error that is not an `Error` whose message starts with `Unauthorized`.

### Requirement 5: Automated tests

**User Story:** As a developer, I want automated tests for the new behavior, so that regressions are caught without a real Supabase session.

#### Acceptance Criteria

1. THE Test_Suite SHALL include tests in `src/test/` that use a mocked Supabase client and make no network calls to Supabase.
2. THE Test_Suite SHALL include a test that verifies the Auth_Server_Function handler returns an object containing only `userId`, with the value supplied by the mocked middleware context.
3. THE Test_Suite SHALL include a test that verifies Client_Auth_Middleware sends `Authorization: Bearer <token>` when the mocked Session contains an Access_Token.
4. THE Test_Suite SHALL include a test that verifies Client_Auth_Middleware sends no `Authorization` header when the mocked Session is empty.
5. THE Test_Suite SHALL include a test that verifies `src/lib/auth.functions.ts` does not import the Admin_Client.
6. THE Test_Suite SHALL use only fake token values created inside the tests and SHALL read no value from `.env`.
7. WHEN `bun run test` is run, THE Test_Suite SHALL pass, including all tests that existed before this feature.
8. THE Test_Suite SHALL include a test that verifies Unauthorized_Mapping_Middleware throws a 401 `Response` with the body `Unauthorized` for an `Error` whose message starts with `Unauthorized`, and rethrows any other error unchanged.

### Requirement 6: Lint, build, and rejection checks

**User Story:** As a developer, I want the change checked by lint, build, and a rejection check, so that I know the code is sound before the manual signed-in check.

#### Acceptance Criteria

1. WHEN `bun run lint` is run after the change, THE App SHALL produce no lint errors in files added or modified by this feature.
2. WHEN `bun run build` is run after the change, THE App SHALL build successfully.
3. WHERE a Local_Dev_Server can be started in the working environment, THE verification process SHALL send one request with no `Authorization` header and one request with an invalid token to the Auth_Server_Function and SHALL confirm that each receives HTTP status 401 with the body `Unauthorized`.
4. IF a Local_Dev_Server cannot be started in the working environment, THEN THE verification process SHALL record the rejection check as not run, with the reason.
5. THE verification process SHALL record the signed-in success check as PENDING until the user performs the Manual_Check.
6. THE verification process SHALL define the Manual_Check as one action: sign in on the existing login page, run one call to the Auth_Server_Function from the browser console, and confirm that the result contains only the signed-in user's ID.
7. THE verification process SHALL print no token, credential, full claims object, or environment value in any command, log, or report.
8. IF `node_modules` or `bun` is unavailable and the user has not approved installing dependencies, THEN THE verification process SHALL record the Test_Suite run, lint, build, and Rejection check as NOT RUN with the reason, and SHALL NOT report them as passed. New test files written in that case are unexecuted.
9. THE verification process SHALL run the checks that need no dependencies regardless of the environment: the git branch check, the git scope check (Requirement 7), and text searches confirming that no `attachSupabaseAuth` import exists and that `src/lib/auth.functions.ts` does not reference `client.server`.
10. THE Manual_Check needs a running Local_Dev_Server, so it is also blocked while dependencies are unavailable.

### Requirement 7: Minimal and safe change scope

**User Story:** As a project owner, I want the change kept small and inside the existing setup, so that the current backend, login flow, and generated files stay safe.

#### Acceptance Criteria

1. THE App SHALL keep using the existing Supabase backend and existing authentication, without enabling Lovable Cloud, switching backends, or replacing authentication.
2. THE App SHALL leave every Generated_File byte-for-byte unchanged, including files in `src/integrations/supabase/` and `src/routeTree.gen.ts`.
3. THE App SHALL contain no new database schema changes, migrations, or edits under `supabase/migrations/` or `drizzle/`.
4. THE App SHALL keep all existing screens, routes, and components unchanged, with no new UI element.
5. THE App SHALL keep existing login and logout behavior unchanged.
6. THE App SHALL add no new dependencies to `package.json` or the lockfile.
7. THE App SHALL keep all file changes on the git branch `backend-setup` and SHALL add no force push, rebase, amend, or squash of pushed commits.
8. THE App SHALL limit file changes to `src/start.ts`, `src/lib/auth.functions.ts`, one new local module for Client_Auth_Middleware and Unauthorized_Mapping_Middleware, new tests in `src/test/`, and the spec files under `.kiro/specs/authenticated-server-function/`.
9. THE App SHALL create no git commit, push, or staged change as part of this feature unless the user asks for one. Changes stay in the working tree on `backend-setup`.

### Requirement 8: Verification report

**User Story:** As a project owner, I want a final report that separates what was run from what is still pending, so that I know exactly what remains for me to do.

#### Acceptance Criteria

1. WHEN the work is complete, THE verification process SHALL produce a report with one section listing checks actually run and their results, one section listing checks not run with the reason, and a separate section listing checks still pending.
2. THE report SHALL state, for each check, the command or method used and whether it passed, failed, or was not run.
3. THE report SHALL reduce everything the user still has to do to a single next action. WHEN all automated checks ran, that action is the Manual_Check. WHEN some checks were not run because dependencies are unavailable, that action is to make dependencies available (for example `bun install --frozen-lockfile` on a machine with bun), and the not-run checks and the Manual_Check follow from it without being presented as separate actions.
4. THE report SHALL contain no value from `.env`, no token, and no full claims object.

## Assumptions

The clarify phase used these defaults. The user has not confirmed them.

1. File layout: Client_Auth_Middleware lives in a new local module under `src/lib/`, and the Auth_Server_Function lives in `src/lib/auth.functions.ts`.
2. Error shape: rejected requests return a plain 401 with the text `Unauthorized`, not a structured JSON error.
3. Manual check method: the Manual_Check is run from the browser console on the existing login page's signed-in session.
4. No permanent UI element is added to display or test the result.
5. No sign-in script is written, so the signed-in success check relies on the Manual_Check.
6. The server function uses POST, not the default GET.
7. The 401 mapping is registered globally in Function_Middleware, not only on the one new server function.
8. Dependencies are not installed unless the user approves it (see Requirement 6.8).

## Resolved Design Note

Require_Auth_Middleware is generated and cannot be edited. It throws plain `Error` values, such as `Unauthorized: No authorization header provided`. The existing `errorMiddleware` never sees these errors, because the framework catches function middleware errors and serializes them with HTTP status 200. The design therefore adds Unauthorized_Mapping_Middleware (Requirement 4.5). This conclusion comes from reading the framework source at the locked versions. It has not been confirmed against a running server, which is the job of the Rejection check (Requirement 6.3).
