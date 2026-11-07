import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { FlaskConical, Siren, Users, LogOut, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-provider";
import { BastionEmblem, CitySkyline } from "@/components/city-skyline";
import { type Severity, type SystemStatus, type TaskStatus } from "@/lib/demo-store";

export function DemoBanner() {
  return (
    <div className="relative z-10 flex items-center justify-center gap-2 border-b border-warning/25 bg-background/90 px-4 py-1.5 text-xs text-warning">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden />
      <span><strong>Demo data:</strong> records on this screen are synthetic and stored only in this browser tab. Role labels are illustrative, not permissions.</span>
    </div>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <BastionEmblem className="h-8 w-8" />
          <span className="font-display text-xl font-medium">Bastion</span>
    </span>
  );
}

const navCls = "flex min-h-11 items-center justify-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:border-border hover:text-foreground";
const navActive = { className: "!border-primary !text-foreground" };

export function AppShell({ children, mode = "demo" }: { children: ReactNode; mode?: "demo" | "live" | "account" }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
  const handleSignOut = async () => {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setSigningOut(false);
    if (error) { toast.error("Sign out failed: " + error.message); return; }
    navigate({ to: "/login", replace: true });
  };
  return (
    <div className="sky relative min-h-screen">
      <CitySkyline className="shell-skyline pointer-events-none fixed inset-x-0 bottom-0 h-[35vh] w-full" />
      {mode === "demo" ? <DemoBanner /> : <div className="relative z-10 border-b border-border bg-background/90 px-4 py-1.5 text-center text-xs text-muted-foreground">{mode === "live" ? "Real incident · saved to your account" : "Bastion Guide · saved to your account"}</div>}
      <div className="relative flex min-h-[calc(100vh-29px)] flex-col">
        <header className="border-b border-border bg-transparent">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-x-5 gap-y-3 px-5 py-4 sm:px-8 md:px-10 lg:grid-cols-[auto_1fr_auto] lg:px-12">
          <Link to="/" aria-label="Bastion home"><Wordmark /></Link>
          <nav aria-label="Main navigation" className="order-3 col-span-2 grid grid-cols-3 gap-1 lg:order-none lg:col-span-1 lg:flex lg:justify-center">
            <Link to="/" className={navCls} activeProps={navActive} activeOptions={{ exact: true }}><Siren className="h-4 w-4" aria-hidden /> Incidents</Link>
            <Link to="/team" className={navCls} activeProps={navActive}><Users className="h-4 w-4" aria-hidden /> Team</Link>
            <Link to="/guide" className={navCls} activeProps={navActive}><BookOpen className="h-4 w-4" aria-hidden /> AI Guide</Link>
          </nav>
          <div className="flex items-center justify-end gap-2">
            <ThemeToggle compact />
            <Button size="icon" variant="ghost" title={email ? `Sign out (${email})` : "Sign out"} aria-label={signingOut ? "Signing out…" : "Sign out"} disabled={signingOut} onClick={handleSignOut}>
              <LogOut className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          </div>
        </header>
        <main className="fade-in mx-auto min-w-0 w-full max-w-6xl px-5 py-7 sm:px-8 md:px-10 md:py-10 lg:px-12">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-medium text-foreground">{title}</h1>
      {children}
    </div>
  );
}

const pill = "rounded-full px-2.5 py-0.5 font-medium";
const sevVariant: Record<Severity, BadgeProps["variant"]> = { Critical: "critical", High: "warning", Medium: "info", Low: "neutral" };
export const SeverityBadge = ({ s }: { s: Severity }) => (
  <Badge variant={sevVariant[s]} className={pill}><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden />Severity: {s}</Badge>
);
export const StageBadge = ({ s }: { s: string }) => <Badge variant="info" className={pill}>Stage: {s}</Badge>;

const sysVariant: Record<SystemStatus, BadgeProps["variant"]> = { Encrypted: "critical", Isolated: "warning", "Under review": "info", Restored: "success", Unaffected: "neutral" };
export const SystemBadge = ({ s }: { s: SystemStatus }) => <Badge variant={sysVariant[s]} className={pill}>{s}</Badge>;

const taskVariant: Record<TaskStatus, BadgeProps["variant"]> = { Open: "neutral", "In progress": "info", Blocked: "warning", Done: "success" };
export const TaskBadge = ({ s }: { s: TaskStatus }) => <Badge variant={taskVariant[s]} className={pill}>{s}</Badge>;
