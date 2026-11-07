import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Shield, FlaskConical } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDemo, type Severity, type SystemStatus, type TaskStatus } from "@/lib/demo-store";

export function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-xs text-warning">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden />
      <span><strong>Demo mode:</strong> synthetic data, stored only in this browser tab. Changes reset on reload. Not connected to a backend.</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useDemo();
  const navigate = useNavigate();
  const nav = "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground";
  const active = { className: "bg-accent text-foreground" };
  return (
    <div className="min-h-screen bg-background">
      <DemoBanner />
      <header className="border-b border-border bg-sidebar">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Shield className="h-5 w-5 text-primary" aria-hidden /> Bastion
          </Link>
          <nav className="flex gap-1">
            <Link to="/" className={nav} activeProps={active} activeOptions={{ exact: true }}>Incidents</Link>
            <Link to="/team" className={nav} activeProps={active}>Team</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="text-muted-foreground">{user.name} · {user.role}</span>
                <Button size="sm" variant="outline" onClick={() => { signOut(); navigate({ to: "/login" }); }}>Sign out</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" asChild><Link to="/login">Sign in (demo)</Link></Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

const sevVariant: Record<Severity, BadgeProps["variant"]> = { Critical: "critical", High: "warning", Medium: "info", Low: "neutral" };
export const SeverityBadge = ({ s }: { s: Severity }) => <Badge variant={sevVariant[s]}>Severity: {s}</Badge>;

const sysVariant: Record<SystemStatus, BadgeProps["variant"]> = { Encrypted: "critical", Isolated: "warning", "Under review": "info", Restored: "success", Unaffected: "neutral" };
export const SystemBadge = ({ s }: { s: SystemStatus }) => <Badge variant={sysVariant[s]}>{s}</Badge>;

const taskVariant: Record<TaskStatus, BadgeProps["variant"]> = { Open: "neutral", "In progress": "info", Blocked: "warning", Done: "success" };
export const TaskBadge = ({ s }: { s: TaskStatus }) => <Badge variant={taskVariant[s]}>{s}</Badge>;
