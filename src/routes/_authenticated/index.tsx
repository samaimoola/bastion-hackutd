import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { incidentListOptions } from "@/lib/incident-queries";
import { IncidentError, IncidentLoading, IncidentNotFound } from "@/components/incident-states";
import { NewIncidentForm } from "@/components/new-incident-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowRight, Clock, UserRound, CircleDot } from "lucide-react";
import { AppShell, PageHeader, SeverityBadge, StageBadge, SystemBadge, TaskBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { fmt, useDemo } from "@/lib/demo-store";

export const Route = createFileRoute("/_authenticated/")({
  loader: async ({ context }) => { await context.queryClient.fetchQuery(incidentListOptions(context.authUser.id)); },
  pendingComponent: IncidentLoading,
  errorComponent: IncidentError,
  notFoundComponent: IncidentNotFound,
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
  const { authUser } = Route.useRouteContext();
  const { data: incidents } = useSuspenseQuery(incidentListOptions(authUser.id));
  const navigate = Route.useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return <AppShell mode="live">
    <div className="flex flex-wrap items-start justify-between gap-4"><PageHeader eyebrow="Incidents" title="Active response"><p className="mt-2 text-sm text-muted-foreground">{incidents.length} accessible {incidents.length === 1 ? "incident" : "incidents"}</p></PageHeader><Button onClick={() => setOpen(true)}><Plus className="size-4" /> New Incident</Button></div>
    {incidents.length === 0 ? <section className="border-y border-border py-12"><h2 className="text-xl font-medium">No incidents yet</h2><p className="mt-3 text-sm text-muted-foreground">Create an incident to start a response. Only incidents accessible to your account appear here.</p><Button className="mt-5" onClick={() => setOpen(true)}><Plus className="size-4" /> New Incident</Button></section> : <ul className="divide-y divide-border border-y border-border">{incidents.map((i) => <li key={i.id} className="py-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><SeverityBadge s={i.severity} /><StageBadge s={i.stage} /></div><h2 className="mt-3 break-words text-xl font-medium">{i.title}</h2><p className="mt-2 break-all font-mono text-xs text-muted-foreground">{i.id}</p><p className="mt-3 text-xs text-muted-foreground">Last update: {fmt(i.lastUpdate)} UTC · Commander details not connected</p></div><Button asChild variant="outline"><Link to="/incidents/$id" params={{ id: i.id }}>Open workspace <ArrowRight className="size-4" /></Link></Button></div></li>)}</ul>}
    <section className="mt-10 border-t border-border pt-5"><p className="text-sm text-muted-foreground">Synthetic demo · separate from your real incidents</p><Button asChild variant="ghost" className="mt-2"><Link to="/incidents/$id" params={{ id: "INC-2026-0412" }}>Open demo workspace <ArrowRight className="size-4" /></Link></Button></section>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>New Incident</DialogTitle><DialogDescription>Create a real incident saved to your account.</DialogDescription></DialogHeader><NewIncidentForm key={authUser.id} userId={authUser.id} onBusyChange={setBusy} onCreated={async (i) => { await navigate({ to: "/incidents/$id", params: { id: i.id } }); }} /></DialogContent></Dialog>
  </AppShell>;
}

export function DemoOverview() {
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
