import { createFileRoute, Link } from "@tanstack/react-router";
import { SimpleHint } from "@/components/simple-mode";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { incidentListOptions } from "@/lib/incident-queries";
import { IncidentError, IncidentLoading, IncidentNotFound } from "@/components/incident-states";
import { NewIncidentForm } from "@/components/new-incident-form";
import { StakeholderUpdateCard } from "@/components/stakeholder-update-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AppShell, SeverityBadge, StageBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/demo-store";

export const Route = createFileRoute("/_authenticated/dashboard")({
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
    <header className="mb-8 grid min-w-0 gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="eyebrow">Incidents</p>
        <h1 className="mt-2 text-3xl font-medium text-foreground">Active response</h1>
        <p className="mt-2 text-sm text-muted-foreground">{incidents.length} accessible {incidents.length === 1 ? "incident" : "incidents"}</p>
        <SimpleHint className="mt-2 max-w-xl">These are the incidents your account can open. Select one to see its workspace, or select New Incident to start one. You become its commander.</SimpleHint>
      </div>
      <Button size="lg" className="w-full shrink-0 sm:w-auto" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />New Incident</Button>
    </header>
    {incidents.length > 0 && <StakeholderUpdateCard incidents={incidents} userId={authUser.id} />}
    {incidents.length === 0 ? <section className="border-y border-border py-12"><h2 className="text-xl font-medium">No incidents yet</h2><p className="mt-3 text-sm text-muted-foreground">Create an incident to start a response. Only incidents accessible to your account appear here.</p><Button className="mt-5 w-full sm:w-auto" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />Create your first incident</Button></section> : <ul className="divide-y divide-border border-y border-border">{incidents.map((i) => <li key={i.id} className="py-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><SeverityBadge s={i.severity} /><StageBadge s={i.stage} /></div><h2 className="mt-3 break-words text-xl font-medium">{i.title}</h2><p className="mt-2 break-all font-mono text-xs text-muted-foreground">{i.id}</p><p className="mt-3 text-xs text-muted-foreground">Last update: {fmt(i.lastUpdate)} · Commander details not connected</p></div><Button asChild variant="outline"><Link to="/incidents/$id" params={{ id: i.id }}>Open workspace <ArrowRight className="size-4" /></Link></Button></div></li>)}</ul>}
    <section className="mt-10 border-t border-border pt-5"><p className="text-sm text-muted-foreground">Synthetic demo · separate from your real incidents</p><Button asChild variant="ghost" className="mt-2"><Link to="/incidents/$id" params={{ id: "INC-2026-0412" }}>Open demo workspace <ArrowRight className="size-4" /></Link></Button></section>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>New Incident</DialogTitle><DialogDescription>Create a real incident saved to your account.</DialogDescription></DialogHeader><NewIncidentForm key={authUser.id} userId={authUser.id} onBusyChange={setBusy} onCreated={async (i) => { await navigate({ to: "/incidents/$id", params: { id: i.id } }); }} /></DialogContent></Dialog>
  </AppShell>;
}

