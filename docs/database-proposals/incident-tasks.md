# Proposal: shared incident tasks (NOT APPLIED)

Status: **not deployed.** Nothing in this folder has been applied to the hosted Supabase project.

`AGENTS.md` reserves schema changes for Lovable ("Do not add or edit `supabase/migrations/`") and forbids editing the generated `src/integrations/supabase/types.ts`. So the SQL lives here, outside `supabase/migrations/`, and the app treats tasks as unavailable until it is installed.

## What the app does today
- Real incidents: the Tasks tab asks the server for tasks. If the `incident_tasks` table does not exist, it shows "Shared tasks are not set up yet", offers no writes and opens no live subscription. Nothing is stored in the browser.
- Demo incident (`INC-2026-0412`): unchanged; its practice tasks stay in `src/lib/demo-store.tsx`.
- After the SQL is installed, the same tab starts working with no app redeploy, because availability is detected at request time.

## What `incident-tasks.sql` adds
| Piece | Behavior |
| --- | --- |
| `public.incident_tasks` | `title` (1–200), `details` (optional, ≤ 10,000), `assignee_id` (optional), `status` (`todo` / `in_progress` / `done`), trusted `created_by/updated_by/created_at/updated_at`. |
| Reads | `SELECT` only, through RLS `private.incident_role(incident_id) IS NOT NULL`, so only current members of the incident can read. Anonymous access is revoked. |
| Writes | No direct `INSERT/UPDATE/DELETE` grants. Only `public.add_incident_task` and `public.update_incident_task` (`SECURITY DEFINER`). Both lock the parent incident first and allow commanders and responders only. Tasks cannot be deleted. |
| Validation trigger | Trims the title, checks lengths and status, sets actor and times from the session, keeps identity fields immutable, and requires the assignee to be a **current member of the same incident**. |
| Access removal | An `AFTER DELETE` trigger on `incident_members` clears that person's task assignments in the same transaction, recorded as `task_updated`. |
| Activity | `private.record_incident_activity` is replaced with an identical copy plus an `incident_tasks` branch (field allowlist: title, details, assignee_id, status). It records `task_created` / `task_updated` atomically with the write. |
| Live updates | `incident_tasks` is added to the `supabase_realtime` publication. |

These rules are tested against real PostgreSQL (PGlite running every deployed migration plus this file) in `src/test/incident-tasks-database.test.ts`.

## Manual deployment steps
1. **Back up first.** In the Supabase dashboard, confirm a recent backup exists, or take one, for project `foazktlfalnhvafuvpkj`.
2. **Check it still matches.** Run `bun run test src/test/incident-tasks-database.test.ts` on the branch you are deploying. It must pass. If anyone has since changed `private.record_incident_activity`, update the copy in the SQL before applying.
3. **Apply it once, through the approved path.**
   - Preferred: ask Lovable to add `docs/database-proposals/incident-tasks.sql` as a new migration and apply it.
   - Otherwise an administrator pastes the whole file into the Supabase SQL editor and runs it once. In that case, also add the same SQL under `supabase/migrations/` (through Lovable) so the repository matches the database.
4. **Regenerate types.** Let Lovable regenerate `src/integrations/supabase/types.ts`, or run `npx supabase gen types typescript --project-id foazktlfalnhvafuvpkj > src/integrations/supabase/types.ts` with an account that has access.
5. **Optional clean-up after the types exist:** in `src/lib/tasks.functions.ts`, drop the `untyped(...)` cast and use `context.supabase` directly. In `src/lib/task-models.ts`, base `IncidentTask` on the generated row type. Behavior does not change.
6. **Verify in the deployed app.** See "Browser checks" below.

## Rollback
Run inside one transaction:
```sql
ALTER PUBLICATION supabase_realtime DROP TABLE public.incident_tasks;
DROP TRIGGER incident_member_task_cleanup ON public.incident_members;
DROP FUNCTION private.unassign_removed_member_tasks();
DROP TABLE public.incident_tasks;          -- also drops its triggers
DROP FUNCTION public.add_incident_task(uuid, text, text, uuid);
DROP FUNCTION public.update_incident_task(uuid, text, text, uuid, text);
DROP FUNCTION private.validate_incident_task();
```
Then restore the original `private.record_incident_activity` from `supabase/migrations/20261107233219_*.sql`, using `CREATE OR REPLACE`. Existing `task_*` activity rows stay in the log; activity is immutable by design.

## Browser checks after deployment
- A responder adds a task with only a title, then sets details, an assignee and each status. A second signed-in member sees each change without refreshing.
- A viewer can read tasks, but has no Add, Edit or status controls.
- Assigning someone who is not a member of the incident is rejected with "The assignee must be a current member of this incident."
- A commander removes a member who has tasks. Those tasks become "Unassigned", the removed person loses the Tasks view, and the Timeline shows the change.
- The Timeline shows "Task added: …" and "Task status changed from To do to In progress".
