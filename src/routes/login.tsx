import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DemoBanner, Wordmark } from "@/components/app-shell";
import { CitySkyline } from "@/components/city-skyline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDemo } from "@/lib/demo-store";

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
  const { signIn, members } = useDemo();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (signIn(email)) navigate({ to: "/" });
    else setError("No active demo account with that email.");
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
          <p className="mt-2 text-sm text-muted-foreground">Demo sign-in only. No password is checked and nothing is sent to a server. Real authentication comes next.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" required className="h-11" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" className="h-11" placeholder="Not checked in demo mode" />
            </div>
            <Button type="submit" className="h-11 w-full text-base">Sign in</Button>
          </form>
          <div className="mt-6 border-t border-border pt-4">
            <p className="eyebrow">Demo accounts</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {members.filter((m) => m.active).slice(0, 3).map((m) => (
                <button key={m.id} type="button" onClick={() => setEmail(m.email)} className="rounded text-left text-sm text-primary hover:underline">
                  <span className="font-mono text-xs">{m.email}</span> <span className="text-muted-foreground">· {m.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
