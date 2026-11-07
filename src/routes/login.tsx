import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DemoBanner, Wordmark } from "@/components/app-shell";
import { CitySkyline } from "@/components/city-skyline";
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
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: "/", replace: true }); });
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
      navigate({ to: "/", replace: true });
    } catch {
      setError("Could not reach the sign-in service. Check your connection and try again.");
    } finally { setLoading(false); }
  };
  return (
    <div className="sky relative min-h-screen overflow-hidden">
      <DemoBanner />
      <CitySkyline variant="hero" className="pointer-events-none absolute inset-x-0 bottom-0 h-[75vh] w-full" />
      <div className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-10"><Wordmark /><ThemeToggle compact /></div>
      <div className="relative mx-auto grid max-w-7xl justify-items-center gap-8 px-6 pb-16 pt-6 sm:px-10 sm:pt-10">
        <div className="fade-in max-w-xl text-center">
          <p className="eyebrow">Incident response workspace</p>
          <h1 className="mt-3 text-5xl font-medium leading-tight sm:text-6xl">Bastion</h1>
          <p className="mt-4 text-lg text-muted-foreground">A calm command center above the storm.</p>
        </div>
        <div className="panel fade-in w-full max-w-[420px] p-6 sm:p-8">
          <h2 className="text-2xl font-medium">Sign in</h2>
          <p className="mt-2 text-sm text-muted-foreground">Use the account your administrator created for you. There is no public sign-up.</p>
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
        </div>
      </div>
    </div>
  );
}
