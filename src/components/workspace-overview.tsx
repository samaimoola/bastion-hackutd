import { FileText, Plus, Server, ListTodo, ArrowRight } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/lib/demo-store";
import { responseBrief, useWorkspace, workspaceStats } from "@/lib/workspace-api";
import { Button } from "@/components/ui/button";
import { TaskBadge } from "@/components/app-shell";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function WorkspaceOverview({ onUpdate, onSystems, onTasks, children }: { onUpdate: () => void; onSystems: () => void; onTasks: () => void; children: React.ReactNode }) {
  const { incident, systems, tasks, timeline, memberName } = useWorkspace();
  const { affected, open, urgent } = workspaceStats(systems, tasks);
  const [briefOpen, setBriefOpen] = useState(false);
  const brief = responseBrief(incident, systems, tasks, timeline);
  const latest = [...timeline].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 3);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={onUpdate}><Plus aria-hidden className="size-4" /> Add update</Button>
      <Button variant="outline" onClick={onSystems}><Server aria-hidden className="size-4" /> Add affected system</Button>
      <Button variant="outline" onClick={onTasks}><ListTodo aria-hidden className="size-4" /> Create task</Button>
      <Button variant="ghost" onClick={() => setBriefOpen(true)}><FileText aria-hidden className="size-4" /> Response Brief</Button>
    </div>
    <dl className="grid grid-cols-2 gap-4 border-y border-border py-4 sm:grid-cols-4">
      {[["Affected systems", affected.length], ["Encrypted (demo)", systems.filter((s) => s.status === "Encrypted").length], ["Open tasks", open.length], ["Urgent tasks", urgent.length]].map(([label, count]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-2xl">{count}</dd></div>)}
    </dl>
    <section aria-labelledby="impact-title"><h2 id="impact-title" className="text-lg font-medium">Current impact</h2><p className="mt-2 text-sm leading-relaxed">{incident.impact}</p></section>
    {children}
    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-labelledby="urgent-title"><div className="flex items-center justify-between"><h2 id="urgent-title" className="text-lg font-medium">Urgent tasks</h2><Button variant="ghost" size="icon" aria-label="View all tasks" onClick={onTasks}><ArrowRight className="size-4" /></Button></div><p className="mb-2 text-xs text-muted-foreground">Blocked or overdue · UTC</p><ul className="divide-y divide-border">{urgent.slice(0, 4).map((task) => <li key={task.id} className="py-3 text-sm"><div className="flex items-start justify-between gap-3"><span>{task.title}</span><TaskBadge s={task.status} /></div><p className="mt-1 text-xs text-muted-foreground">{memberName(task.assigneeId)} · Due {fmt(task.due)}</p></li>)}{urgent.length === 0 && <li className="py-3 text-sm text-muted-foreground">No blocked or overdue tasks.</li>}</ul></section>
      <section aria-labelledby="updates-title"><h2 id="updates-title" className="mb-2 text-lg font-medium">Latest updates</h2><ul className="divide-y divide-border">{latest.map((entry) => <li key={entry.id} className="py-3 text-sm"><p className="text-xs text-muted-foreground">{entry.type} · {fmt(entry.at)}</p><p className="mt-1">{entry.text}</p><p className="mt-1 text-xs text-muted-foreground">{entry.author}</p></li>)}{latest.length === 0 && <li className="py-3 text-sm text-muted-foreground">No updates recorded.</li>}</ul></section>
    </div>
    <Dialog open={briefOpen} onOpenChange={setBriefOpen}><DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Response Brief</DialogTitle><DialogDescription>{incident.id} · Synthetic records · As of {fmt(incident.lastUpdate)}</DialogDescription></DialogHeader>
      <section><h3 className="font-medium">Current impact</h3><p className="mt-1 text-sm">{brief.impact}</p></section>
      {[["Recorded findings (not independently verified)", brief.facts], ["Unknowns", brief.unknowns], ["Recent decisions", brief.decisions], ["Next actions", brief.nextActions]].map(([title, rows]) => <section key={String(title)}><h3 className="font-medium">{title}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{Array.isArray(rows) && rows.map((row, index) => <li key={index}>{row}</li>)}{Array.isArray(rows) && rows.length === 0 && <li className="text-muted-foreground">None recorded.</li>}</ul></section>)}
    </DialogContent></Dialog>
  </div>;
}