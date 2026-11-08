import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { AppShell, SeverityBadge, StageBadge } from "./app-shell";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import type { IncidentRecord } from "@/lib/incident-models";
import type { WorkspaceTab } from "@/lib/guide-navigation";
import { EditIncidentAction } from "./edit-incident-action";
import { IncidentTeamAccess } from "./incident-team-access";
import { RealAffectedSystems } from "./real-affected-systems";
import { RealCommunications } from "./real-communications";
import { RealTimeline } from "./real-timeline";
import { ContainmentLab } from "./containment-lab";

const formatTime = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });

function UnconnectedSection({ title, action }: { title: string; action: string }) {
  return <section className="py-6"><h2 className="text-xl font-medium">{title}</h2><p className="mt-3 text-sm text-muted-foreground">{title} are not connected for real incidents yet. No records are available here.</p><Button disabled variant="outline" className="mt-5" aria-describedby={`unconnected-${action.replaceAll(" ", "-")}`}>{action}</Button><p id={`unconnected-${action.replaceAll(" ", "-")}`} className="mt-2 text-xs text-muted-foreground">Unavailable until this section is connected.</p></section>;
}

export function LiveIncidentWorkspace({ incident: i, userId, tab, setTab }: { incident: IncidentRecord; userId: string; tab: WorkspaceTab; setTab: (value: string) => void }) {
  return <AppShell mode="live">
    <Link to="/" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> All incidents</Link>
    <header className="border-b border-border pb-4">
      <div className="flex flex-wrap items-center gap-2"><SeverityBadge s={i.severity} /><StageBadge s={i.stage} /></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0"><h1 className="break-words text-3xl font-medium">{i.title}</h1><p className="mt-3 text-xs text-muted-foreground">Updated {formatTime(i.lastUpdate)} UTC</p></div>
        <div className="flex flex-wrap items-end gap-3 [&>div]:mt-0"><EditIncidentAction key={`${userId}:${i.id}`} incident={i} userId={userId} /><IncidentTeamAccess key={`team:${userId}:${i.id}`} id={i.id} userId={userId} /></div>
      </div>
    </header>
    <Tabs value={tab} onValueChange={setTab} className="mt-3">
      <div className="max-w-full overflow-x-auto"><TabsList aria-label="Incident workspace" className="h-auto min-w-max justify-start gap-4 rounded-none border-b border-border bg-transparent p-0 [&>button]:min-h-11 [&>button]:rounded-none [&>button]:border-b-2 [&>button]:border-transparent [&>button]:px-1 [&>button]:text-muted-foreground [&>button[data-state=active]]:border-primary [&>button[data-state=active]]:bg-transparent [&>button[data-state=active]]:text-foreground [&>button[data-state=active]]:shadow-none"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="systems">Affected Systems &amp; Data</TabsTrigger><TabsTrigger value="tasks">Tasks</TabsTrigger><TabsTrigger value="timeline">Timeline</TabsTrigger><TabsTrigger value="chat">Communications</TabsTrigger><TabsTrigger value="lab">Containment Lab</TabsTrigger></TabsList></div>
      <TabsContent value="overview" className="mt-8"><div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)]"><section className="min-w-0"><h2 className="text-xl font-medium">What happened</h2><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{i.summary || "No description yet."}</p><div className="mt-10 border-t border-border pt-6"><h2 className="text-xl font-medium">Next steps</h2><p className="mt-3 text-sm text-muted-foreground">Next steps are not available for real incidents yet.</p><Button disabled variant="outline" className="mt-4" aria-describedby="real-edit-disabled">Add next action</Button></div></section><section className="min-w-0 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"><h2 className="text-xl font-medium">Incident details</h2><dl className="mt-4 space-y-5 text-sm"><div><dt className="text-muted-foreground">Severity</dt><dd className="mt-1">{i.severity}</dd></div><div><dt className="text-muted-foreground">Response stage</dt><dd className="mt-1">{i.stage}</dd></div><div><dt className="text-muted-foreground">Created</dt><dd className="mt-1">{formatTime(i.declaredAt)} UTC</dd></div></dl><details className="mt-6 text-xs text-muted-foreground"><summary className="cursor-pointer">Incident reference</summary><p className="mt-2 break-all font-mono">{i.id}</p></details></section></div><p id="real-edit-disabled" className="mt-5 text-xs text-muted-foreground">Next steps are not connected yet.</p></TabsContent>
      <TabsContent value="systems"><RealAffectedSystems key={`${userId}:${i.id}`} incidentId={i.id} userId={userId} /></TabsContent>
      <TabsContent value="tasks"><UnconnectedSection title="Tasks" action="Add task" /></TabsContent>
      <TabsContent value="timeline"><RealTimeline key={`${userId}:${i.id}`} incidentId={i.id} userId={userId} /></TabsContent>
      <TabsContent value="chat"><RealCommunications key={`${userId}:${i.id}`} incidentId={i.id} userId={userId} /></TabsContent>
      <TabsContent value="lab"><ContainmentLab key={`${userId}:${i.id}`} incidentId={i.id} userId={userId} /></TabsContent>
    </Tabs>
  </AppShell>;
}