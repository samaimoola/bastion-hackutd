import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { AppShell, SeverityBadge, StageBadge } from "./app-shell";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import type { IncidentRecord } from "@/lib/incident-models";
import type { WorkspaceTab } from "@/lib/guide-navigation";
import { EditIncidentAction } from "./edit-incident-action";

const formatTime = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });

function UnconnectedSection({ title, action }: { title: string; action: string }) {
  return <section className="py-6"><h2 className="text-xl font-medium">{title}</h2><p className="mt-3 text-sm text-muted-foreground">{title} are not connected for real incidents yet. No records are available here.</p><Button disabled variant="outline" className="mt-5" aria-describedby={`unconnected-${action.replaceAll(" ", "-")}`}>{action}</Button><p id={`unconnected-${action.replaceAll(" ", "-")}`} className="mt-2 text-xs text-muted-foreground">Unavailable until this section is connected.</p></section>;
}

export function LiveIncidentWorkspace({ incident: i, userId, tab, setTab }: { incident: IncidentRecord; userId: string; tab: WorkspaceTab; setTab: (value: string) => void }) {
  return <AppShell mode="live">
    <Link to="/" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> All incidents</Link>
    <header className="border-b border-border pb-4">
      <div className="flex flex-wrap items-center gap-2"><span className="break-all font-mono text-xs text-muted-foreground">{i.id}</span><SeverityBadge s={i.severity} /><StageBadge s={i.stage} /></div>
      <h1 className="mt-3 break-words text-2xl font-medium">{i.title}</h1>
      <EditIncidentAction key={`${userId}:${i.id}`} incident={i} userId={userId} />
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs"><div><dt className="inline text-muted-foreground">Commander: </dt><dd className="inline">Membership details not connected</dd></div><div><dt className="inline text-muted-foreground">Last update: </dt><dd className="inline font-mono">{formatTime(i.lastUpdate)} UTC</dd></div></dl>
    </header>
    <Tabs value={tab} onValueChange={setTab} className="mt-3">
      <div className="max-w-full overflow-x-auto"><TabsList aria-label="Incident workspace" className="h-auto min-w-max justify-start gap-4 rounded-none border-b border-border bg-transparent p-0 [&>button]:min-h-11 [&>button]:rounded-none [&>button]:border-b-2 [&>button]:border-transparent [&>button]:px-1 [&>button]:text-muted-foreground [&>button[data-state=active]]:border-primary [&>button[data-state=active]]:bg-transparent [&>button[data-state=active]]:text-foreground [&>button[data-state=active]]:shadow-none"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="systems">Affected Systems &amp; Data</TabsTrigger><TabsTrigger value="tasks">Tasks</TabsTrigger><TabsTrigger value="timeline">Timeline</TabsTrigger><TabsTrigger value="chat">Communications</TabsTrigger></TabsList></div>
      <TabsContent value="overview" className="mt-6"><div className="grid gap-8 md:grid-cols-[2fr_1fr]"><section><h2 className="text-xl font-medium">Summary</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{i.summary || "No description provided."}</p><h2 className="mt-8 text-xl font-medium">Next actions</h2><p className="mt-3 text-sm text-muted-foreground">Next actions are not connected for real incidents yet.</p><Button disabled variant="outline" className="mt-4" aria-describedby="real-edit-disabled">Add next action</Button></section><section><h2 className="text-xl font-medium">Details</h2><dl className="mt-3 space-y-4 text-sm"><div><dt className="text-muted-foreground">Severity</dt><dd>{i.severity}</dd></div><div><dt className="text-muted-foreground">Response stage</dt><dd>{i.stage}</dd></div><div><dt className="text-muted-foreground">Created</dt><dd>{formatTime(i.declaredAt)} UTC</dd></div></dl></section></div><p id="real-edit-disabled" className="mt-5 text-xs text-muted-foreground">Membership management and next actions are not connected in this workflow.</p></TabsContent>
      <TabsContent value="systems"><UnconnectedSection title="Affected systems" action="Add system" /></TabsContent>
      <TabsContent value="tasks"><UnconnectedSection title="Tasks" action="Add task" /></TabsContent>
      <TabsContent value="timeline"><UnconnectedSection title="Timeline entries" action="Record update" /></TabsContent>
      <TabsContent value="chat"><UnconnectedSection title="Team messages" action="Send message" /></TabsContent>
    </Tabs>
  </AppShell>;
}