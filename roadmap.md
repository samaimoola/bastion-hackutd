# Bastion frontend improvements

## This increment
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
- Communications sending/failure/retry flow with retained drafts.
- Team invitations and access controls driven by backend-provided permissions; backend contract required for live enforcement.
- Live adapter and permission integration: partner's API contract required; never fall back to demo after errors.