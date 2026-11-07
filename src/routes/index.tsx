import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Clock, UserRound, CircleDot } from "lucide-react";
import { AppShell, PageHeader, SeverityBadge, StageBadge, SystemBadge, TaskBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { fmt, useDemo } from "@/lib/demo-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Incidents — Bastion" },
      { name: "description", content: "Overview of active cyber incidents, severity, stage, and next actions." },
      { property: "og:title", content: "Incidents — Bastion" },
      { property: "og:description", content: "Overview of active cyber incidents, severity, stage, and next actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { incident: i, memberName, tasks, systems } = useDemo();
  const openTasks = tasks.filter((t) => t.status !== "Done");
  const hit = systems.filter((s) => s.status !== "Unaffected");
  return (
    <AppShell>
      <PageHeader eyebrow="Incidents" title="Active response">
        <p className="mt-2 text-sm text-muted-foreground">1 active incident · synthetic demo record</p>
      </PageHeader>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-border p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{i.id}</span>
              <SeverityBadge s={i.severity} />
              <StageBadge s={i.stage} />
            </div>
            <h2 className="mt-3 text-2xl font-medium">{i.title}</h2>
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-muted-foreground" aria-hidden /><dt className="text-muted-foreground">Commander</dt><dd className="font-medium">{memberName(i.commanderId)}</dd></div>
              <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" aria-hidden /><dt className="text-muted-foreground">Last update</dt><dd className="font-mono text-xs">{fmt(i.lastUpdate)}</dd></div>
            </dl>
          </div>
          <Button asChild>
            <Link to="/incidents/$id" params={{ id: i.id }}>Open workspace <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </div>

        <div className="grid md:grid-cols-[1.2fr_1fr]">
          <div className="border-b border-border p-6 md:border-b-0 md:border-r">
            <h3 className="eyebrow">Next actions</h3>
            <ol className="mt-4 space-y-3">
              {i.nextActions.map((a, n) => (
                <li key={a} className="flex gap-4 text-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/40 font-mono text-xs text-primary">{n + 1}</span>
                  <span className="pt-0.5">{a}</span>
                </li>
              ))}
              {i.nextActions.length === 0 && <li className="text-sm text-muted-foreground">No pending actions.</li>}
            </ol>
          </div>
          <div className="p-6">
            <h3 className="eyebrow">Affected systems · {hit.length}</h3>
            <ul className="mt-4 divide-y divide-border">
              {hit.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-mono text-xs">{s.name}</span><SystemBadge s={s.status} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-medium">Open tasks</h2>
          <span className="text-sm text-muted-foreground">{openTasks.length} remaining</span>
        </div>
        <ul className="panel divide-y divide-border">
          {openTasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-4 px-5 py-3 text-sm hover:bg-accent/40">
              <CircleDot className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">{t.title}</span>
              <span className="text-muted-foreground">{memberName(t.assigneeId)}</span>
              <span className="w-32 font-mono text-xs text-muted-foreground">{fmt(t.due)}</span>
              <TaskBadge s={t.status} />
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
