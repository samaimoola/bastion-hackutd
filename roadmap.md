# Bastion frontend improvements

## This increment
- [x] Add trusted atomic incident activity and connect Timeline with member-only reads, live updates and access/cache cleanup; all 245 tests pass, generated types/build and live grants/publication verified. Recording began 2026-11-07 23:32:19 UTC with no history backfill; no new linter findings.
- [ ] Verify signed-in Timeline change → event → reload, two-session live delivery, membership removal/account-switch cleanup and concurrent change/revocation; blocked by external unmanaged Supabase browser sessions. Isolated database tests cover actor/time trust, exact changes, rollback, immutable activity and secret/body exclusion.
- [x] Add persistent member-scoped incident communications with protected posting, trusted authors/times, live updates and account/membership cleanup; all 223 tests pass, generated types and preview build verified, signed-out route redirects to login.
- [ ] Verify signed-in communications sending/reload, two-session live delivery, viewer/nonmember behavior, removal/account-switch cleanup and concurrent send/revocation; blocked by external unmanaged Supabase browser sessions. Database permissions and deterministic revocation are tested in isolated PostgreSQL; protected-send scanner warning is intentional and reviewed, pre-existing security/password warnings remain.
- [x] Fix invitation address selection to use the public runtime origin or confirmed canonical published address from preview; preserve fragment credentials and existing invitation protections, with focused URL regression checks.
- [x] Add persistent real affected systems with assessment, multiple data conditions, containment, notes and trusted actors/times; member-scoped reads, protected writes and Realtime updates.
- [ ] Verify signed-in affected-system create/edit → reload and two-session Realtime delivery/isolation, including revoked membership; blocked by unavailable external Supabase browser sessions. Concurrent write/revocation locking remains unverified.
- [x] Add incident-specific team access, commander role/removal controls and 24-hour single-use hash-only invitation RPCs; existing-account acceptance and inherited-grant hardening applied.
- [x] Simplify workspace wording, center Guide content and balance incident summary/details spacing; chatbot behavior, auth gate and demo separation preserved.
- [ ] Verify signed-in team management, invitation generation → existing-account sign-in → acceptance → reload, account switching, and Guide/workspace visuals in both themes; blocked by external unmanaged Supabase session. Concurrent two-client redemption remains unverified.
- [x] Connect real incident editing to the existing update RPC, read verified caller membership, refresh identity-scoped caches, and test editing permissions and submissions.
- [ ] Verify signed-in editing and reload in the browser as commander, responder and viewer; blocked by external unmanaged Supabase session.
- [x] Make the real-list New Incident header action prominent at laptop and smaller widths, add the first-incident entry point, and reuse the existing creation dialog and backend function.
- [x] Connect real incident list, creation, ID loading and refresh through existing functions; separate demo content, disable unconnected actions, isolate account caches, and run focused checks.
- [ ] Verify signed-in real incident creation → workspace → reload → list, inaccessible IDs and account switching in the browser; blocked by external unmanaged Supabase session (tools cannot supply a signed-in session).
- [x] Apply incident database foundation with member-only access, atomic creation, commander-managed membership, and last-commander protection; regenerate types and test permissions. Application screens, authentication, Guide, and demo state unchanged. Two-session concurrency testing remains unavailable because the sandbox PostgreSQL installation cannot initialize; shared parent-row serialization was reviewed.
- [x] Fix Guide validation so short greetings remain valid after empty or oversized assistant turns; only the new question is submitted and validated against the 12,000-character limit.
- [x] Add automatic page/tab navigation for explicit guide requests; destination tests pass and preview build is clean. Signed-in end-to-end navigation remains unverified because the external Supabase browser session is unavailable.
- [x] Add a Bastion AI usage guide with one account-saved conversation, protected streaming, and theme-aware AI Elements presentation; eleven tests pass and preview build is clean.
- [x] Verify real AI answers and follow-up history plus signed-out page/API rejection. New guide files pass lint; repository-wide lint retains pre-existing formatting issues and registry warnings.
- [ ] Verify signed-in guide saving/reload, cross-account isolation, Stop and both-theme chat appearance; blocked by unavailable external Supabase browser session.
- [x] Research Apple HIG, Material, NN/g, and WCAG guidance; apply neutral pearl/charcoal surfaces with restrained teal/mint. Login text/button contrast exceeds 4.5:1, input outlines exceed 3:1; both themes pass mobile checks and theme tests. Signed-in visual checks remain unavailable.
- [x] Polish shared presentation and add saved light/dark appearance controls; nine tests passed, and login checked in both themes at desktop, 873px, and 390px widths. Signed-in visual checks remain unavailable with external Supabase.
- [x] Fix demo provider/context mismatch during hot updates; seven tests passed and the affected signed-in preview renders Active response again.
- [x] Compact, accessible workspace header and responsive tabs.
- [x] Typed frontend service boundary; retain explicit in-memory demo mode and existing authentication.
- [x] Overview with record-derived counts, urgent tasks, latest updates, and action shortcuts.
- [x] Validated Timeline entries with type, author, event time, recorded time, and UTC labels.
- [x] Deterministic Response Brief from existing records.
- [x] Test derived rules, validation, Timeline form submission, and signed-out redirect in the browser.
- Signed-in workspace visual/end-to-end checks unavailable: external Supabase session cannot be supplied by the testing tools.

## Subsequent increments (deliberately deferred per brief)
- Independent impact/containment and exfiltration fields, searchable assets, add/edit forms.
- Task priority, owner and due-date editing, overdue highlighting.
- Live adapter and permission integration: partner's API contract required; never fall back to demo after errors.