import { Link } from "@tanstack/react-router";
import { SimpleHint } from "./simple-mode";
import { terms } from "@/lib/plain-language";
import { ChevronLeft } from "lucide-react";
import { AppShell, SeverityBadge, StageBadge } from "./app-shell";
import { Tabs, TabsContent } from "./ui/tabs";
import type { IncidentRecord } from "@/lib/incident-models";
import type { WorkspaceTab } from "@/lib/guide-navigation";
import { EditIncidentAction } from "./edit-incident-action";
import { IncidentTeamAccess } from "./incident-team-access";
import { YourAccess } from "./incident-access-summary";
import { RealAffectedSystems } from "./real-affected-systems";
import { RealCommunications } from "./real-communications";
import { RealTimeline } from "./real-timeline";
import { RealTasks } from "./real-tasks";
import { ContainmentLab } from "./containment-lab";
import { Disclosure, WorkspaceActionList, WorkspaceTabBar, type WorkspaceAction } from "./workspace-sections";
import { stageMeaning } from "@/lib/workspace-models";
import { useSimpleMode } from "@/lib/simple-mode-context";
import { SimpleIncidentSummary } from "./simple-incident-summary";

const formatTime = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });


// Only connected sections are offered as actions. Tasks stay reachable from the tab list.
const liveActions: WorkspaceAction[] = [
  { tab: "systems", title: "Record affected systems and data", description: "List what is involved and track whether each item is contained." },
  { tab: "timeline", title: "Review the timeline", description: "See recorded changes to this incident in the order they happened." },
  { tab: "chat", title: "Message the response team", description: "Post messages that everyone with access to this incident can read." },
  { tab: "lab", title: "Compare isolation options", description: "Simulate isolating a system to see the tradeoff before deciding. Nothing is actually isolated." },
];

function LiveOverview({ incident: i, userId }: { incident: IncidentRecord; userId: string }) {
  const { simple } = useSimpleMode();
  if (simple) return <div className="space-y-6"><SimpleIncidentSummary incident={i} userId={userId} /><IncidentReference incident={i} /></div>;
  return <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <div className="min-w-0 space-y-8">
      <section aria-labelledby="what-happened">
        <h2 id="what-happened" className="text-xl font-medium">What happened</h2>
        <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7">{i.summary || "No description has been written yet."}</p>
      </section>
      <section aria-labelledby="current-status">
        <h2 id="current-status" className="text-xl font-medium">Current status</h2>
        <dl className="mt-3 space-y-3 text-base">
          <div><dt className="inline font-medium">Stage: {i.stage}.</dt> <dd className="inline text-muted-foreground">{stageMeaning[i.stage] ?? ""}</dd></div>
          <div><dt className="inline font-medium">Severity:</dt> <dd className="inline">{i.severity}</dd><SimpleHint>{terms.severity}</SimpleHint></div>
          <div><dt className="inline font-medium">Last updated:</dt> <dd className="inline">{formatTime(i.lastUpdate)} UTC</dd></div>
        </dl>
      </section>
      <IncidentReference incident={i} />
    </div>
    <section aria-labelledby="what-you-can-do" className="min-w-0">
      <h2 id="what-you-can-do" className="text-xl font-medium">What you can do here</h2>
      <div className="mt-3"><WorkspaceActionList incidentId={i.id} items={liveActions} /></div>
    </section>
  </div>;
}

function IncidentReference({ incident: i }: { incident: IncidentRecord }) {
  return <Disclosure title="Incident details and reference">
    <dl className="space-y-3">
      <div><dt className="text-muted-foreground">Created</dt><dd className="mt-0.5">{formatTime(i.declaredAt)} UTC</dd></div>
      <div><dt className="text-muted-foreground">Incident reference</dt><dd className="mt-0.5 break-all font-mono text-xs">{i.id}</dd></div>
      <div><dt className="text-muted-foreground">Not connected yet</dt><dd className="mt-0.5">Next steps are not available for real incidents yet. The Tasks tab says whether shared tasks are set up for this workspace.</dd></div>
    </dl>
  </Disclosure>;
}

export function LiveIncidentWorkspace({ incident: i, userId, tab, setTab }: { incident: IncidentRecord; userId: string; tab: WorkspaceTab; setTab: (value: string) => void }) {
  const { simple } = useSimpleMode();
  // The Simple-mode Summary carries the editor in its "What happened?" entry point; don't repeat it.
  const editInHeader = !(simple && tab === "overview");
  return <AppShell mode="live">
    <Link to="/" className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> All incidents</Link>
    <header className="space-y-3 border-b border-border pb-5">
      <h1 className="break-words text-3xl font-medium">{i.title}</h1>
      <div className="flex flex-wrap items-center gap-2"><SeverityBadge s={i.severity} /><StageBadge s={i.stage} /><span className="text-xs text-muted-foreground">Updated {formatTime(i.lastUpdate)} UTC</span></div>
      <YourAccess incidentId={i.id} userId={userId} />
      <div className="flex flex-wrap items-start gap-3 [&>div]:mt-0">{editInHeader && <EditIncidentAction key={`${userId}:${i.id}`} incident={i} userId={userId} />}<IncidentTeamAccess key={`team:${userId}:${i.id}`} id={i.id} userId={userId} /></div>
    </header>
    <Tabs value={tab} onValueChange={setTab} className="mt-3">
      <WorkspaceTabBar tab={tab} setTab={setTab} mode="live" />
      <TabsContent value="overview" className="mt-8"><LiveOverview incident={i} userId={userId} /></TabsContent>
      <TabsContent value="systems"><RealAffectedSystems key={`${userId}:${i.id}`} incidentId={i.id} userId={userId} /></TabsContent>
      <TabsContent value="tasks"><RealTasks key={`${userId}:${i.id}`} incidentId={i.id} userId={userId} /></TabsContent>
      <TabsContent value="timeline"><RealTimeline key={`${userId}:${i.id}`} incidentId={i.id} userId={userId} /></TabsContent>
      <TabsContent value="chat"><RealCommunications key={`${userId}:${i.id}`} incidentId={i.id} userId={userId} /></TabsContent>
      <TabsContent value="lab"><ContainmentLab key={`${userId}:${i.id}`} incidentId={i.id} userId={userId} /></TabsContent>
    </Tabs>
  </AppShell>;
}
