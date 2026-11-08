# Bastion

Bastion is a cyber incident-response workspace. It gives a response team one place to keep the incident record, affected systems, tasks, a timeline, team chat and access control, with an optional guide that explains how to use the app.

Built for a hackathon with React, TypeScript, Tailwind, shadcn/ui, TanStack Start and Supabase.

## What it does

- **Incident dashboard:** lists incidents with severity, response stage and last update. Start a real incident with only a title, and fill in the rest later.
- **Incident workspace:** Overview, Affected Systems, Tasks, Timeline, Team Chat and a Containment Lab.
- **Containment Lab:** model how systems connect, isolate one, and compare options. Each result comes with a plain-language "Why" explanation.
- **Team access:** commanders manage roles (commander, responder, viewer) and share one-use incident links with people who already have an account.
- **Simple mode:** everyday wording, guided summaries, and secondary tools grouped under "More tools".
- **Bastion Guide:** a floating assistant that answers questions about using the app and can navigate to pages. It only gives guidance and never changes incident records.
- **Stakeholder update:** a plain-language summary you can copy for non-technical readers.
- **Light and dark themes.**

## Real data and demo data

- **Real incidents** are stored in Supabase. Access is limited to incident members by database rules, and every server call runs as the signed-in user.
- **The demo incident** (`INC-2026-0412`, a fictional ransomware case) uses clearly labeled synthetic data. It lives only in memory in `src/lib/demo-store.tsx`, resets on reload, and never touches the database. Demo role labels are display-only and do not grant access.

## Accounts and access

- Sign-in uses individual Supabase Auth accounts with an email and password. Accounts are created in the Supabase dashboard (Authentication → Users → Add user → Create new user).
- Public sign-up is off. An invitation-only "Create an account" flow is built but stays switched off until its database changes are installed (see below).
- Incident links (`/invite`) add an existing account to one incident. They are single use, expire after 24 hours, and never grant more than responder or viewer access.
- There is no MFA and no self-service password reset. Contact your administrator if you cannot sign in.

## Pending database changes

Schema changes are managed through Lovable, so two features are kept as reviewed SQL proposals in `docs/database-proposals/`. Neither is applied yet, and the app shows an honest "not set up yet" state until it is.

| Proposal | Adds | Docs |
| --- | --- | --- |
| `incident-tasks.sql` | Shared, role-checked incident tasks with activity logging | `incident-tasks.md` |
| `signup-invitations.sql` | Invitation-only account creation (needs a Supabase Auth hook) | `signup-invitations.md` |

Each document has the deployment order, verification steps and rollback. Do not enable sign-up in Supabase until the signup steps are complete.

## Dependencies outside Bastion

Bastion is not independent of outside services. It needs:

- **Lovable and Cloudflare** to host the app.
- **Supabase** for authentication, the database and live updates.
- **The Lovable AI Gateway** for the Guide only. It needs `LOVABLE_API_KEY` on the server.
- **Working email** for account confirmation, once sign-up is enabled.

There is no offline mode. See `docs/isolation-boundary.md` for what sign-in needs during an outage.

## Development

This project uses [Bun](https://bun.sh).

```sh
bun install
bun --bun run dev      # local dev server
bunx tsc --noEmit      # type check
bun run test           # tests (Vitest)
bun run build          # production build
```

Configuration goes in a local `.env` file. Never commit secrets or put them in browser code.

## Project layout

- `src/routes/` holds the pages. Signed-in pages are under `_authenticated/`.
- `src/lib/*.functions.ts` are authenticated server functions.
- `src/lib/demo-store.tsx` holds all demo data.
- `supabase/migrations/` is managed by Lovable. Do not edit it by hand.
- `docs/` has the isolation notes and database proposals.

## Working with Lovable

This project is connected to [Lovable](https://lovable.dev/projects/9ba069c6-8ccc-4ed0-a83b-625dfa770c44). Commits pushed to the connected branch sync back to the Lovable editor. Avoid rewriting published git history, because that rewrites it on Lovable's side too.
