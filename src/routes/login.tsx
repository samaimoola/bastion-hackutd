import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shield } from "lucide-react";
import { DemoBanner } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="min-h-screen bg-background">
      <DemoBanner />
      <div className="flex justify-center px-4 py-20">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="mb-2 flex items-center gap-2 font-semibold"><Shield className="h-5 w-5 text-primary" /> Bastion</div>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Demo sign-in only. No password is checked and nothing is sent to a server. Real authentication comes next.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw">Password</Label>
                <Input id="pw" type="password" placeholder="Not checked in demo mode" />
              </div>
              <Button type="submit" className="w-full">Sign in</Button>
            </form>
            <div className="mt-6 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">Demo accounts:</p>
              <div className="mt-2 flex flex-col gap-1">
                {members.filter((m) => m.active).slice(0, 3).map((m) => (
                  <button key={m.id} type="button" onClick={() => setEmail(m.email)} className="text-left font-mono text-xs text-primary hover:underline">
                    {m.email} <span className="text-muted-foreground">({m.role})</span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
