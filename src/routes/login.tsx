import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DemoBanner, Wordmark } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-provider";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Bastion" },
      { name: "description", content: "Sign in to the Bastion incident-response workspace." },
      { property: "og:title", content: "Sign in — Bastion" },
      { property: "og:description", content: "Sign in to the Bastion incident-response workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: "/dashboard", replace: true }); });
  }, [navigate]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError(error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message);
        return;
      }
      navigate({ to: "/dashboard", replace: true });
    } catch {
      setError("Could not reach the sign-in service. Check your connection and try again.");
    } finally { setLoading(false); }
  };
  return (
    <div className="relative min-h-screen bg-background">
      <DemoBanner />
      <div className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-10"><Wordmark /><ThemeToggle compact /></div>
      <div className="relative mx-auto grid max-w-7xl justify-items-center gap-8 px-6 pb-16 pt-6 sm:px-10 sm:pt-10">
        <div className="fade-in max-w-xl text-center">
          <p className="eyebrow">Incident response workspace</p>
          <h1 className="mt-3 text-5xl font-medium leading-tight sm:text-6xl">Bastion</h1>
          <p className="mt-4 text-lg text-muted-foreground">A calm command center above the storm.</p>
        </div>
        <div className="panel fade-in w-full max-w-[420px] p-6 sm:p-8">
          <h2 className="text-2xl font-medium">Sign in</h2>
          <p className="mt-2 text-sm text-muted-foreground">Use your own Bastion account. Accounts are created by an administrator or with an invitation from an incident commander.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" required className="h-11" autoComplete="email" disabled={loading} value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" required autoComplete="current-password" className="h-11" disabled={loading} value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
            </div>
            {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Signing in…</> : "Sign in"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New to Bastion? <Link to="/signup" className="font-medium text-primary underline-offset-4 hover:underline">Create an account with an invitation</Link>
          </p>
          {/* Static guidance; mirrors docs/isolation-boundary.md. Sign-in itself is unchanged. */}
          <details className="group mt-6 border-t border-border pt-4 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />Access during an outage
            </summary>
            <div className="mt-2 space-y-2 text-muted-foreground">
              <p>Sign-in uses only your Bastion email and password. It does not use your company&rsquo;s single sign-on or VPN, and nothing is sent to your email or phone.</p>
              <p>You still need internet access to this site and to Bastion&rsquo;s hosting provider. Bastion does not work offline. If company systems may be compromised, use a trusted device on a separate connection, such as a phone hotspot.</p>
              <p>Set up your account in advance. Accounts are created only by an administrator or with a one-use invitation code from an incident commander, and there is no self-service password reset, so if you cannot sign in, contact your Bastion administrator.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
