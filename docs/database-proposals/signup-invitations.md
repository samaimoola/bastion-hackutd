# Proposal: invitation-only account creation (NOT APPLIED)

Status: **not deployed.** Nothing here has been applied to the hosted Supabase project, and public sign-up is still disabled (`enable_signup = false` in `supabase/config.toml` and in the dashboard).

`AGENTS.md` reserves schema changes for Lovable and forbids editing generated files, so the SQL lives in `signup-invitations.sql`, outside `supabase/migrations/`.

## Two kinds of invitation
| | Incident access link (already deployed) | Account invitation code (this proposal) |
| --- | --- | --- |
| For | Someone who **already has** a Bastion account | Someone with **no** Bastion account |
| Commander action | Team access → "Add someone with an existing account" → Generate invitation link | Team access → "Invite someone without an account" → email + role → Create invitation code |
| What is shared | A link `/invite#invite=…` | A 32-character code; the person opens `/signup` |
| Bound to | Whoever redeems it while signed in | One email address |
| Result | Existing account joins the incident | New account is created and joins the incident |
| Tables / functions | `incident_invitations`, `redeem_incident_invitation` | `signup_invitations`, Auth hook + `auth.users` triggers |

Both are single use, expire after 24 hours, grant responder or viewer only, store only a SHA-256 hash, and stop working if the issuer is no longer a commander of that incident.

### User journey (new person)
1. A commander opens the incident → Team access → "Invite someone without an account", enters the person's email and Viewer or Responder, and selects Create invitation code. The code is shown once.
2. The commander sends the code privately, through a channel that still works during the incident.
3. The person opens `https://incident-command-harbor.lovable.app/signup` (or "Create an account with an invitation" on the sign-in or welcome page), enters the code, the invited email and a password.
4. Supabase Auth asks the database hook whether this email has a usable invitation. If not, nothing is created.
5. The account is inserted. In the same transaction, the database locks the invitation, re-checks it, marks it used, removes the code from the account's metadata, and adds the person to that one incident with that one role. If any step fails, the account is not created and the invitation stays unused.
6. With email confirmation on, the person confirms by email, then signs in and sees the incident.

## Enforcement (what the browser cannot bypass)
- **Before User Created hook** `public.bastion_before_user_created`. Supabase Auth calls it before every self-service creation: email/phone sign-up, magic link or OTP sign-up, OAuth/SAML/Web3, anonymous sign-in and dashboard "Send invitation". It refuses with HTTP 403 unless the metadata carries a usable code for that exact email. It does **not** run for administrator "Create new user" (`admin.createUser`), which is how the outage readiness checklist provisions accounts. That path keeps working.
  - This is checked against the Supabase Auth source (`supabase/auth`, `internal/api`): the hook is called from `signup.go`, `invite.go`, `mail.go`, `external.go`, `anonymous.go`, `samlacs.go`, `token_oidc.go` and `web3.go`, but not from `admin.go`. Re-check this if Supabase changes it.
- **`auth.users` triggers** `private.redeem_signup_invitation` (BEFORE INSERT) and `private.assign_signup_membership` (AFTER INSERT). They run in the insert's own transaction. Locking the incident row and then the invitation row (`FOR UPDATE`), plus a guarded `UPDATE … WHERE redeemed_at IS NULL`, means concurrent attempts with one code serialize and only one wins. Inserts without an `invitation_code` key are untouched.
- **Role and scope** come only from the stored invitation row. Any `role` or `incident_id` in sign-up metadata is ignored.
- **Activity log:** the new member appears as `member_added`, with the issuing commander as the actor.
- **Switch:** `private.signup_settings.enabled` (default `false`) gates issuing codes, the hook and redemption. The sign-up page and the commander section show a setup message while it is `false`. Setting it back to `false` blocks all outstanding codes at once.
- **No direct access:** `signup_invitations` and `signup_settings` have no grants for `anon`, `authenticated` or `service_role`. The hook is executable only by `supabase_auth_admin`.

The tasks and signup proposals are independent: either order works, and together they keep activity recording intact (`src/test/database-proposals-combined.test.ts`). Apply tasks first so a newly signed-up member can be assigned tasks straight away.

Tested against real PostgreSQL (PGlite with every deployed migration plus this file) in `src/test/signup-invitations-database.test.ts`. That suite covers:
- no code, a guessed or malformed code, and an anonymous user
- the wrong email
- an expired invitation
- a reused invitation, including the race where two requests both passed the hook
- an issuer who has been demoted
- role or incident injected through metadata
- rollback when adding the membership fails
- administrator-created accounts
- the off switch
- denial of direct access

PGlite has one connection, so real concurrent sessions are not exercised. The lock-plus-guarded-update design covers that case.

## Deployment steps (in this order)
Signup must not be enabled before the hook is active. Otherwise accounts without codes could be created.

1. **Back up.** Confirm a recent backup of project `foazktlfalnhvafuvpkj` exists, or take one.
2. **Re-run the tests** on the branch you deploy: `bun run test src/test/signup-invitations-database.test.ts`.
3. **Apply the SQL once.**
   - Preferred: ask Lovable to add `docs/database-proposals/signup-invitations.sql` as a migration and apply it.
   - Otherwise an administrator runs the whole file once in the Supabase SQL editor (as `postgres`), then has Lovable add the same SQL under `supabase/migrations/` so the repository matches.
   - If creating triggers on `auth.users` is refused, stop: do not enable signup. The hook alone would not mark invitations used or add memberships.
4. **Turn on the hook.** Dashboard → Authentication → Hooks → "Before User Created" → type Postgres → schema `public`, function `bastion_before_user_created` → enable.
   **Verify the hook while sign-up is still off** (Supabase runs the hook on dashboard "Send invitation" even when sign-up is disabled): Authentication → Users → Add user → Send invitation for a throwaway address. It must fail with "A valid, unused Bastion invitation…". If it succeeds, the hook is not active: delete the user and do not continue.
5. **Configure email and redirects.**
   - Authentication → Sign In / Providers → Email: keep "Confirm email" on.
   - Authentication → URL Configuration:
     - set Site URL to `https://incident-command-harbor.lovable.app`;
     - add `https://incident-command-harbor.lovable.app/login` to Redirect URLs.
   - Check the confirmation email template and that the project's email sending (default or custom SMTP) works.
6. **Enable sign-up.** Authentication → Sign In / Providers → turn on "Allow new users to sign up", with email as the provider.
   - Keep anonymous sign-ins and other providers off.
   - Also update `supabase/config.toml` through Lovable so `[auth] enable_signup` and `[auth.email] enable_signup` match the dashboard. `src/test/login-outage.test.tsx` asserts they are `false` today, so update that assertion in the same change.
7. **Switch it on in the database** (SQL editor, as `postgres`):
   ```sql
   UPDATE private.signup_settings SET enabled = true, updated_at = now();
   ```
8. **Regenerate types** (`src/integrations/supabase/types.ts`) through Lovable or `npx supabase gen types typescript --project-id foazktlfalnhvafuvpkj`. Optional afterwards: drop the `untyped(...)` casts in `src/lib/signup-invitations.functions.ts` and `signupReadiness`.
9. **Browser checks** (below).

Emergency stop: `UPDATE private.signup_settings SET enabled = false;` and/or turn off "Allow new users to sign up".

## Rollback
First turn off sign-up in the dashboard and disable the hook. Then, in one transaction:
```sql
DROP TRIGGER bastion_signup_invitation_membership ON auth.users;
DROP TRIGGER bastion_signup_invitation_redeem ON auth.users;
DROP FUNCTION private.assign_signup_membership();
DROP FUNCTION private.redeem_signup_invitation();
DROP FUNCTION public.bastion_before_user_created(jsonb);
DROP FUNCTION public.issue_signup_invitation(uuid, text, public.incident_member_role, text);
DROP FUNCTION private.signup_invitation_usable(public.signup_invitations, text);
DROP FUNCTION private.signup_code_hash(text);
DROP FUNCTION public.invitation_signup_ready();
DROP TABLE public.signup_invitations;
DROP TABLE private.signup_settings;
```
Accounts and memberships created through invitations stay.

## Known limits
- If a person never confirms their email, their invitation is still used up, and their membership exists but cannot be used until they confirm. Issue a new code only if the old account is deleted.
- Signing up with an email that already has an account creates nothing, and Supabase may still report success to avoid revealing which emails exist. That person should sign in and use an incident access link.
- Codes are 128-bit random values. Supabase Auth's rate limits apply to guessing.
- Dashboard "Send invitation" emails are blocked by the hook. Use "Create new user" for administrator provisioning.

## Browser checks after deployment
- Before step 7, `/signup` shows "Account creation is not set up yet" and no form.
- A commander creates a code for `new@…` as Viewer. A Responder or Viewer does not see that section.
- On `/signup`:
  - a wrong code, a different email, an expired code or a reused code each show "This invitation could not be used", and no user appears under Authentication → Users;
  - the right code and email lead to "Check your email". After confirming and signing in, the person sees exactly that incident as Viewer, and the Timeline shows them added by the commander.
- The new user's metadata in Authentication → Users does not contain `invitation_code`.
- Existing sign-in and `/invite#invite=…` links still work for existing accounts.
- An administrator can still create a user with "Create new user".
