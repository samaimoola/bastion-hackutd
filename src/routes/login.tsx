import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DemoBanner, Wordmark } from "@/components/app-shell";
import { CitySkyline } from "@/components/city-skyline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <div className="pointer-events-none absolute left-1/2 top-[18%] h-72 w-72 -translate-x-1/2 rounded-full bg-haze/10 blur-3xl" aria-hidden />
      <div className="relative grid min-h-[calc(100vh-29px)] items-center gap-12 px-8 py-12 lg:grid-cols-[1.1fr_440px] lg:px-20">
        <div className="fade-in max-w-xl">
          <Wordmark />
          <h1 className="mt-10 text-5xl font-medium leading-[1.05] lg:text-6xl">A calm command center above the storm.</h1>
          <p className="mt-6 max-w-md text-lg text-muted-foreground">Coordinate containment, tasks, and your team from one steady place while an incident unfolds.</p>
        </div>
        <div className="panel fade-in p-8">
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
