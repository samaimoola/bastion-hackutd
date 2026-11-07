<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Shared appearance is controlled by ThemeProvider using semantic CSS tokens and a saved browser preference; authentication and demo state remain independent of theme.
- All demo data and mutations live in src/lib/demo-store.tsx (React context, in-memory) so the upcoming backend can replace one module.
- App screens live under src/routes/_authenticated/ (client-only Supabase session gate redirecting to /login); demo role labels are display-only, never authorization.
- Workspace screens consume the typed adapter in src/lib/workspace-api.ts; demo mutations remain in demo-store, so a live implementation can replace the boundary without silent fallback.
- Timeline validation and event types live in workspace-models; event time and recorded time are distinct UTC instants so delayed reporting preserves chronology.
- DemoContext lives in a stable module and retains its identity through Vite hot updates so existing providers and refreshed consumers share the same context.
