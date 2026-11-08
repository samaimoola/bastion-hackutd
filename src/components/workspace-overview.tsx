import { FileText, Plus } from "lucide-react";
import { SimpleHint } from "@/components/simple-mode";
import { terms } from "@/lib/plain-language";
import { useState, type ReactNode } from "react";
import { fmt } from "@/lib/demo-store";
import { responseBrief, useWorkspace, workspaceStats } from "@/lib/workspace-api";
import { Button } from "@/components/ui/button";
import { TaskBadge } from "@/components/app-shell";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Disclosure, WorkspaceActionList, type WorkspaceAction } from "@/components/workspace-sections";
import { stageMeaning } from "@/lib/workspace-models";

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const demoActions: WorkspaceAction[] = [
  { tab: "systems", title: "Review affected systems", description: "See which systems are involved and update their status." },
  { tab: "tasks", title: "Manage tasks", description: "Create tasks, assign people and mark progress." },
  { tab: "timeline", title: "Review the timeline", description: "See what happened, in order, and record new events." },
  { tab: "chat", title: "Message the response team", description: "Read and post team messages (demo only, not delivered)." },
  { tab: "lab", title: "Compare isolation options", description: "Simulate isolating a system to see the tradeoff. Nothing is actually isolated." },
];

/** Demo incident overview. Reads and writes only demo-store records through useWorkspace. */
export function WorkspaceOverview({ onUpdate, nextActions, editors }: { onUpdate: () => void; nextActions: ReactNode; editors: ReactNode }) {
  const { incident, systems, tasks, timeline, memberName } = useWorkspace();
  const { affected, open, urgent } = workspaceStats(systems, tasks);
  const [briefOpen, setBriefOpen] = useState(false);
  const brief = responseBrief(incident, systems, tasks, timeline);
  const latest = [...timeline].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 3);
  const encrypted = systems.filter((s) => s.status === "Encrypted").length;
  return <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <div className="min-w-0 space-y-8">
      <section aria-labelledby="what-happened">
        <h2 id="what-happened" className="text-xl font-medium">What happened</h2>
        <p className="mt-3 text-base leading-7">{incident.summary}</p>
        <p className="mt-3 text-base leading-7"><span className="font-medium">Current impact:</span> {incident.impact}</p>
      </section>
      <section aria-labelledby="current-status">
        <h2 id="current-status" className="text-xl font-medium">Current status</h2>
        <dl className="mt-3 space-y-3 text-base">
          <div><dt className="inline font-medium">Stage: {incident.stage}.</dt> <dd className="inline text-muted-foreground">{stageMeaning[incident.stage] ?? ""}</dd></div>
          <div><dt className="inline font-medium">Severity:</dt> <dd className="inline">{incident.severity}</dd><SimpleHint>{terms.severity}</SimpleHint></div>
          <div><dt className="inline font-medium">Commander:</dt> <dd className="inline">{memberName(incident.commanderId)}</dd><SimpleHint>{terms.commander}</SimpleHint></div>
          <div><dt className="inline font-medium">Records:</dt> <dd className="inline">{count(affected.length, "affected system")} ({encrypted} encrypted) · {count(open.length, "open task")} · {count(urgent.length, "urgent task")}</dd></div>
        </dl>
      </section>
      <section aria-labelledby="next-actions-title">
        <h2 id="next-actions-title" className="text-xl font-medium">Next actions</h2>
        <p className="mt-1 text-sm text-muted-foreground">Actions the team recorded for this incident.</p>
        <div className="mt-3">{nextActions}</div>
      </section>
      <div className="space-y-3">
        <Disclosure title="Urgent tasks and latest updates">
          <div className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="urgent-title"><h3 id="urgent-title" className="font-medium">Urgent tasks</h3><p className="text-xs text-muted-foreground">Blocked or overdue · UTC</p><ul className="mt-1 divide-y divide-border">{urgent.slice(0, 4).map((task) => <li key={task.id} className="py-3"><div className="flex items-start justify-between gap-3"><span>{task.title}</span><TaskBadge s={task.status} /></div><p className="mt-1 text-xs text-muted-foreground">{memberName(task.assigneeId)} · Due {fmt(task.due)}</p></li>)}{urgent.length === 0 && <li className="py-3 text-muted-foreground">No blocked or overdue tasks.</li>}</ul></section>
            <section aria-labelledby="updates-title"><h3 id="updates-title" className="font-medium">Latest updates</h3><ul className="mt-1 divide-y divide-border">{latest.map((entry) => <li key={entry.id} className="py-3"><p className="text-xs text-muted-foreground">{entry.type} · {fmt(entry.at)}</p><p className="mt-1">{entry.text}</p><p className="mt-1 text-xs text-muted-foreground">{entry.author}</p></li>)}{latest.length === 0 && <li className="py-3 text-muted-foreground">No updates recorded.</li>}</ul></section>
          </div>
        </Disclosure>
        <Disclosure title="Change severity, stage or commander">{editors}</Disclosure>
        <Disclosure title="Incident details and reference">
          <dl className="space-y-3">
            <div><dt className="text-muted-foreground">Declared</dt><dd className="mt-0.5">{fmt(incident.declaredAt)}</dd></div>
            <div><dt className="text-muted-foreground">Last update</dt><dd className="mt-0.5">{fmt(incident.lastUpdate)}</dd></div>
            <div><dt className="text-muted-foreground">Incident reference</dt><dd className="mt-0.5 font-mono text-xs">{incident.id}</dd></div>
          </dl>
        </Disclosure>
      </div>
    </div>
    <section aria-labelledby="what-you-can-do" className="min-w-0">
      <h2 id="what-you-can-do" className="text-xl font-medium">What you can do here</h2>
      <Button className="mt-3 w-full sm:w-auto" onClick={onUpdate}><Plus aria-hidden className="size-4" />Add an update</Button>
      <div className="mt-4"><WorkspaceActionList incidentId={incident.id} items={demoActions} /></div>
      <Button variant="outline" className="mt-4 w-full sm:w-auto" onClick={() => setBriefOpen(true)}><FileText aria-hidden className="size-4" />View response brief</Button>
    </section>
    <Dialog open={briefOpen} onOpenChange={setBriefOpen}><DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Response Brief</DialogTitle><DialogDescription>{incident.id} · Synthetic records · As of {fmt(incident.lastUpdate)}</DialogDescription></DialogHeader>
      <section><h3 className="font-medium">Current impact</h3><p className="mt-1 text-sm">{brief.impact}</p></section>
      {[["Recorded findings (not independently verified)", brief.facts], ["Unknowns", brief.unknowns], ["Recent decisions", brief.decisions], ["Next actions", brief.nextActions]].map(([title, rows]) => <section key={String(title)}><h3 className="font-medium">{title}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{Array.isArray(rows) && rows.map((row, index) => <li key={index}>{row}</li>)}{Array.isArray(rows) && rows.length === 0 && <li className="text-muted-foreground">None recorded.</li>}</ul></section>)}
    </DialogContent></Dialog>
  </div>;
}
