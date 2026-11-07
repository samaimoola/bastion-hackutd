import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { redeemIncidentInvitation } from "@/lib/incident-access.functions";
import { captureInvitation, clearInvitation, hashInvitation } from "@/lib/incident-access-models";
import { clearIncidentCache } from "@/lib/incident-queries";
import { Wordmark } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-provider";

export const Route = createFileRoute("/invite")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Incident invitation — Bastion" }, { name: "description", content: "Accept a private Bastion incident invitation using your existing account." },
    { property: "og:title", content: "Incident invitation — Bastion" }, { property: "og:description", content: "Sign in to accept access to a Bastion incident." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "referrer", content: "no-referrer" },
  ] }),
  component: InvitationPage,
});
function InvitationPage() {
  const navigate = Route.useNavigate();
  const client = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);
  const lock = useRef(false);
  const redeem = useServerFn(redeemIncidentInvitation);
  const mutation = useMutation({ mutationFn: redeem, gcTime: 0 });
  useEffect(() => {
    setToken(captureInvitation());
    void supabase.auth.getUser().then(({ data }) => { setAccount(data.user?.email ?? (data.user ? "Your account" : null)); setReady(true); });
  }, []);
  return <div className="sky min-h-screen px-4 py-6 sm:px-8"><div className="mx-auto flex max-w-5xl items-center justify-between"><Wordmark /><ThemeToggle compact /></div>
    <main className="mx-auto mt-16 max-w-lg space-y-6"><h1 className="text-3xl font-medium">Incident invitation</h1>
      {!ready ? <p role="status">Checking your account…</p> : accepted ? <><p>Your incident access is ready.</p><Button onClick={() => { void navigate({ to: "/incidents/$id", params: { id: accepted } }); }}>Open incident</Button></> : !token ? <><p>This invitation is missing or unavailable. Ask a commander for a new link.</p><Button asChild variant="outline"><Link to="/login">Sign in</Link></Button></> : !account ? <>
        <p className="text-sm text-muted-foreground">Sign in with your existing account before accepting. This link does not create an account.</p>
        <form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (busy) return; setBusy(true); setError(null); try { const result = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (result.error) { setError("Sign in failed. Check your email and password."); } else { setAccount(result.data.user?.email ?? "Your account"); setPassword(""); } } catch { setError("Sign in is unavailable. Please try again."); } finally { setBusy(false); } }}>
          <div className="space-y-2"><Label htmlFor="invite-email">Work email</Label><Input id="invite-email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="invite-password">Password</Label><Input id="invite-password" type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} /></div><Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
      </> : <><p className="text-sm text-muted-foreground">Signed in as {account}</p><p>Accept access to the incident shared by its commander.</p><Button disabled={mutation.isPending || Boolean(accepted)} onClick={() => { if (lock.current || !token) return; lock.current = true; setError(null); void (async () => { try { const result = await mutation.mutateAsync({ data: { hash: await hashInvitation(token) } }); clearInvitation(); setToken(null); setAccepted(result.id); clearIncidentCache(client); try { await navigate({ to: "/incidents/$id", params: { id: result.id } }); } catch { setError("Access granted. Use Open incident to continue."); } } catch { setError("This invitation is invalid, expired, already used, or no longer authorized. Ask for a new link."); clearInvitation(); setToken(null); } finally { lock.current = false; mutation.reset(); } })(); }}>{mutation.isPending ? "Accepting…" : "Accept invitation"}</Button></>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {token && <Button variant="ghost" onClick={() => { clearInvitation(); setToken(null); }}>Decline invitation</Button>}
    </main>
  </div>;
}