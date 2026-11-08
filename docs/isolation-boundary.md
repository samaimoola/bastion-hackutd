# Bastion isolation boundary

## Independent of the investigated company's systems
- Bastion runs on separate hosting (Lovable/Cloudflare) and a separate Supabase project. It does not use the affected company's identity provider, email, chat, file shares, or network.
- Sign-in uses Bastion's own Supabase Auth accounts. There is no open sign-up: accounts are created by an administrator or, once `docs/database-proposals/signup-invitations.sql` is deployed, with a one-use account invitation code from a commander. Incident invitations are single-use links for existing accounts. Neither needs company email to be shared.
- Incident data, messages, affected-system records and the activity log live only in Bastion's database. Database rules limit them to incident members.

## Still depends on
- **Hosting providers:** Lovable/Cloudflare (the app), Supabase (database, auth, live updates), and the Lovable AI Gateway (Guide only). If any of these has an outage or is compromised, Bastion is affected.
- **Trusted devices:** a compromised laptop or browser (for example an infected responder machine) can see and do anything its signed-in user can. Sessions stay in browser storage.
- **Internet access:** there is no offline mode. Responders need a network path that doesn't go through the compromised environment, such as a phone hotspot.
- **Account hygiene:** Supabase leaked-password protection is currently off, and there is no MFA yet.

## Signing in during an outage

### What sign-in actually needs
Checked against the current code (`src/routes/login.tsx`, `src/routes/_authenticated/route.tsx`, `supabase/config.toml`):

| Needed at incident time | Why |
| --- | --- |
| The published Bastion address, `https://incident-command-harbor.lovable.app` | The app is served from Lovable/Cloudflare hosting. |
| A working connection to Supabase (`*.supabase.co`) | Sign-in calls Supabase Auth `signInWithPassword`, and every signed-in page re-checks the session with Supabase before it opens. |
| The person's own Bastion email address and password | This is the only sign-in method. The email address is just the account name; nothing is sent to it at sign-in. |
| An account created and confirmed beforehand | Sign-up is disabled today (`enable_signup = false`). After the invitation-only sign-up proposal is deployed, a person can create an account at `/signup` with a commander's code, but confirming it needs working email. An unconfirmed account cannot sign in. |

Not needed at sign-in: the company's single sign-on or identity provider, its VPN or network, receiving email, receiving a text message or one-time code (none is configured), or the Bastion Guide and AI Gateway.

### Limits to plan around
- **No self-service password reset.** The app has no "forgot password" flow. A person who forgets their password needs a Bastion administrator with access to the Supabase dashboard to set a new one. Do not rely on a recovery email if company email may be down.
- **Administrator access is a dependency too.** Make sure at least one administrator can reach the Supabase dashboard without the company's single sign-on, VPN or email.
- **Adding people mid-incident** needs either an existing account plus a one-use incident link, or (once deployed) a one-use account invitation code. A commander shares either through a channel that still works; Bastion does not send them. A new account also needs its confirmation email, so create accounts in advance where possible.
- **Not offline.** If the hosting provider or Supabase is unreachable, sign-in and every incident page fail. Already-open pages cannot save changes without Supabase either.
- **Fonts** are loaded from Google Fonts. If they are blocked, pages fall back to system fonts and still work.

### Readiness checklist
Do these before an incident, and repeat them periodically (for example each quarter) and after any account change.

1. **Provision individual accounts.** In the Supabase dashboard (Authentication → Users → Add user → Create new user), create one account per person, set a password, and mark the email as confirmed. Do not use "Send invitation": the account-invitation hook blocks it once deployed. Never share an account or password between people.
2. **Verify sign-in.** Each person signs in once at the published address and opens an incident they belong to (or the demo workspace).
3. **Retain the published URL.** Keep `https://incident-command-harbor.lovable.app` somewhere that does not depend on company systems, such as a personal password manager entry or a printed card.
4. **Store credentials independently.** Keep each password in a personal password manager that does not unlock through company single sign-on.
5. **Test from a trusted device on an independent connection.** Use a device you trust and a connection that avoids the company network and VPN, such as a phone hotspot, and confirm sign-in works there.
6. **Pre-assign incident access.** Add people to standing incidents in advance and keep at least two commanders, so access can still be managed if one person is unavailable.
7. **Know who resets passwords.** Name the administrators who can set new passwords in Supabase, and confirm their own access does not depend on company systems.
