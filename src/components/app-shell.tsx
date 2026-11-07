import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { FlaskConical, Siren, Users, LogOut } from "lucide-react";
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
      <span><strong>Demo data:</strong> incident records are synthetic and stored only in this browser tab. Sign-in is real; incident data is not yet connected. Role labels are illustrative, not permissions.</span>
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

const navCls = "flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground";
const navActive = { className: "!border-primary/30 !bg-sidebar-accent !text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--primary)]" };

export function AppShell({ children }: { children: ReactNode }) {
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
      <DemoBanner />
      <div className="relative flex min-h-[calc(100vh-29px)] flex-col md:flex-row">
        <aside className="flex shrink-0 flex-col border-b border-sidebar-border bg-sidebar px-4 py-3 md:sticky md:top-0 md:h-[calc(100vh-30px)] md:w-56 md:border-b-0 md:border-r md:py-6">
          <Link to="/" className="px-2" aria-label="Bastion home"><Wordmark /></Link>
          <p className="eyebrow mt-5 hidden px-3 md:block">Workspace</p>
          <nav aria-label="Main navigation" className="mt-2 flex gap-1 md:flex-col">
            <Link to="/" className={navCls} activeProps={navActive} activeOptions={{ exact: true }}><Siren className="h-4 w-4" aria-hidden /> Incidents</Link>
            <Link to="/team" className={navCls} activeProps={navActive}><Users className="h-4 w-4" aria-hidden /> Team</Link>
          </nav>
          <div className="mt-3 border-t border-sidebar-border pt-3 md:mt-auto">
            <div className="mb-4"><ThemeToggle /></div>
            <p className="px-2 text-xs text-muted-foreground">Signed in as</p>
            <p className="truncate px-2 font-mono text-xs" title={email ?? ""}>{email ?? "…"}</p>
            <Button size="sm" variant="ghost" className="mt-3 w-full justify-start" disabled={signingOut} onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </aside>
        <main className="fade-in mx-auto min-w-0 w-full max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-9">{children}</main>
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
