# Bastion isolation boundary

## Independent of the investigated company's systems
- Bastion runs on separate hosting (Lovable/Cloudflare) and a separate Supabase project. It does not use the affected company's identity provider, email, chat, file shares, or network.
- Sign-in uses Bastion's own Supabase Auth accounts. Public signup is turned off, and invitations are single-use links that never need company email.
- Incident data, messages, affected-system records and the activity log live only in Bastion's database. Database rules limit them to incident members.

## Still depends on
- **Hosting providers:** Lovable/Cloudflare (the app), Supabase (database, auth, live updates), and the Lovable AI Gateway (Guide only). If any of these has an outage or is compromised, Bastion is affected.
- **Trusted devices:** a compromised laptop or browser (for example an infected responder machine) can see and do anything its signed-in user can. Sessions stay in browser storage.
- **Internet access:** there is no offline mode. Responders need a network path that doesn't go through the compromised environment, such as a phone hotspot.
- **Account hygiene:** Supabase leaked-password protection is currently off, and there is no MFA yet.
