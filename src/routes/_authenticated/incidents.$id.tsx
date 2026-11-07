import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { AppShell, StageBadge, SeverityBadge, SystemBadge, TaskBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fmt, useDemo, type Severity, type Stage, type SystemStatus, type TaskStatus } from "@/lib/demo-store";

const stages: Stage[] = ["Detection", "Containment", "Eradication", "Recovery", "Post-incident"];
const severities: Severity[] = ["Critical", "High", "Medium", "Low"];
const sysStatuses: SystemStatus[] = ["Encrypted", "Isolated", "Under review", "Restored", "Unaffected"];
const taskStatuses: TaskStatus[] = ["Open", "In progress", "Blocked", "Done"];

export const Route = createFileRoute("/_authenticated/incidents/$id")({
  head: () => ({
    meta: [
      { title: "Incident workspace — Bastion" },
      { name: "description", content: "Coordinate affected systems, tasks, timeline, and team chat for an incident." },
      { property: "og:title", content: "Incident workspace — Bastion" },
      { property: "og:description", content: "Coordinate affected systems, tasks, timeline, and team chat for an incident." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Workspace,
});

function Pick<T extends string>({ value, options, onChange, label, className = "w-40" }: { value: T; options: T[]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className={`h-8 ${className}`} aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function Workspace() {
  const { incident: i } = useDemo();
  return (
    <AppShell>
      <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /> All incidents</Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground">{i.id}</span>
        <SeverityBadge s={i.severity} />
        <StageBadge s={i.stage} />
      </div>
      <h1 className="mt-3 text-3xl font-medium">{i.title}</h1>
      <Tabs defaultValue="overview" className="mt-8">
        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0 [&>button]:rounded-none [&>button]:border-b-2 [&>button]:border-transparent [&>button]:bg-transparent [&>button]:px-0.5 [&>button]:pb-3 [&>button]:pt-1 [&>button]:text-sm [&>button]:text-muted-foreground [&>button]:shadow-none [&>button:hover]:text-foreground [&>button[data-state=active]]:border-primary [&>button[data-state=active]]:bg-transparent [&>button[data-state=active]]:text-foreground [&>button[data-state=active]]:shadow-none">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="systems">Affected Systems</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="chat">Team Chat</TabsTrigger>
        </TabsList>
        <TabsContent className="fade-in mt-6" value="overview"><OverviewTab /></TabsContent>
        <TabsContent className="fade-in mt-6" value="systems"><SystemsTab /></TabsContent>
        <TabsContent className="fade-in mt-6" value="tasks"><TasksTab /></TabsContent>
        <TabsContent className="fade-in mt-6" value="timeline"><TimelineTab /></TabsContent>
        <TabsContent className="fade-in mt-6" value="chat"><ChatTab /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function OverviewTab() {
  const { incident: i, updateIncident, members, memberName } = useDemo();
  const [action, setAction] = useState("");
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Card className="panel border-border md:col-span-2">
        <CardHeader><CardTitle className="font-display text-lg font-medium">Summary</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm leading-relaxed">{i.summary}</p>
          <div>
            <h3 className="eyebrow">Next actions</h3>
            <ul className="mt-2 space-y-2">
              {i.nextActions.map((a) => (
                <li key={a} className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm">
                  {a}
                  <Button size="sm" variant="ghost" onClick={() => updateIncident({ nextActions: i.nextActions.filter((x) => x !== a) })}>Mark done</Button>
                </li>
              ))}
              {i.nextActions.length === 0 && <li className="text-sm text-muted-foreground">No pending actions.</li>}
            </ul>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!action.trim()) return; updateIncident({ nextActions: [...i.nextActions, action.trim()] }); setAction(""); }}>
              <Input placeholder="Add next action" value={action} onChange={(e) => setAction(e.target.value)} />
              <Button type="submit" variant="secondary">Add</Button>
            </form>
          </div>
        </CardContent>
      </Card>
      <Card className="panel border-border">
        <CardHeader><CardTitle className="font-display text-lg font-medium">Details</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-1"><p className="text-muted-foreground">Severity</p><Pick label="Severity" value={i.severity} options={severities} onChange={(v) => updateIncident({ severity: v })} className="w-full" /></div>
          <div className="space-y-1"><p className="text-muted-foreground">Response stage</p><Pick label="Stage" value={i.stage} options={stages} onChange={(v) => updateIncident({ stage: v })} className="w-full" /></div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Commander</p>
            <Select value={i.commanderId} onValueChange={(v) => updateIncident({ commanderId: v })}>
              <SelectTrigger className="h-8 w-full" aria-label="Commander"><SelectValue>{memberName(i.commanderId)}</SelectValue></SelectTrigger>
              <SelectContent>{members.filter((m) => m.active).map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><p className="text-muted-foreground">Declared</p><p>{fmt(i.declaredAt)}</p></div>
          <div><p className="text-muted-foreground">Last update</p><p>{fmt(i.lastUpdate)}</p></div>
        </CardContent>
      </Card>
    </div>
  );
}

function SystemsTab() {
  const { systems, setSystemStatus, addSystem } = useDemo();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  return (
    <Card className="panel border-border">
      <Table>
        <TableHeader><TableRow><TableHead>System</TableHead><TableHead>Type</TableHead><TableHead>Owner</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead><TableHead>Update</TableHead></TableRow></TableHeader>
        <TableBody>
          {systems.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono text-xs">{s.name}</TableCell>
              <TableCell>{s.type}</TableCell>
              <TableCell className="text-muted-foreground">{s.owner}</TableCell>
              <TableCell><SystemBadge s={s.status} /></TableCell>
              <TableCell className="max-w-xs text-xs text-muted-foreground">{s.note}</TableCell>
              <TableCell><Pick label={`Status for ${s.name}`} value={s.status} options={sysStatuses} onChange={(v) => setSystemStatus(s.id, v)} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <form className="flex flex-wrap gap-2 border-t border-border p-4" onSubmit={(e) => { e.preventDefault(); addSystem({ name, type, owner: "Unassigned", status: "Under review", note: "" }); setName(""); setType(""); }}>
        <Input required placeholder="Hostname" value={name} onChange={(e) => setName(e.target.value)} className="w-48" />
        <Input required placeholder="Type" value={type} onChange={(e) => setType(e.target.value)} className="w-48" />
        <Button type="submit" variant="secondary">Add system</Button>
      </form>
    </Card>
  );
}

function TasksTab() {
  const { tasks, addTask, setTaskStatus, members, memberName } = useDemo();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("m2");
  return (
    <Card className="panel border-border">
      <Table>
        <TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Assignee</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead>Update</TableHead></TableRow></TableHeader>
        <TableBody>
          {tasks.map((t) => (
            <TableRow key={t.id}>
              <TableCell className={t.status === "Done" ? "text-muted-foreground line-through" : ""}>{t.title}</TableCell>
              <TableCell>{memberName(t.assigneeId)}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{fmt(t.due)}</TableCell>
              <TableCell><TaskBadge s={t.status} /></TableCell>
              <TableCell><Pick label={`Status for ${t.title}`} value={t.status} options={taskStatuses} onChange={(v) => setTaskStatus(t.id, v)} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <form className="flex flex-wrap gap-2 border-t border-border p-4" onSubmit={(e) => { e.preventDefault(); addTask({ title, assigneeId: assignee, status: "Open", due: new Date(Date.now() + 4 * 3600e3).toISOString() }); setTitle(""); }}>
        <Input required placeholder="New task" value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-64 flex-1" />
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-48" aria-label="Assignee"><SelectValue /></SelectTrigger>
          <SelectContent>{members.filter((m) => m.active).map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="submit" variant="secondary">Add task</Button>
      </form>
    </Card>
  );
}

function TimelineTab() {
  const { timeline, addEvent } = useDemo();
  const [text, setText] = useState("");
  return (
    <Card className="panel border-border">
      <CardContent className="pt-6">
        <form className="mb-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { addEvent(text.trim()); setText(""); } }}>
          <Input placeholder="Log an event" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="secondary">Log event</Button>
        </form>
        <ol className="relative space-y-5 border-l border-border pl-6">
          {[...timeline].reverse().map((e) => (
            <li key={e.id}>
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" aria-hidden />
              <p className="text-xs text-muted-foreground"><time className="font-mono">{fmt(e.at)}</time> · <span className="font-medium text-foreground/85">{e.author}</span></p>
              <p className="mt-0.5 text-sm">{e.text}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ChatTab() {
  const { chat, sendChat, memberName } = useDemo();
  const [text, setText] = useState("");
  const send = () => { if (text.trim()) { sendChat(text.trim()); setText(""); } };
  return (
    <Card className="panel border-border">
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-3">
          {chat.map((m) => (
            <div key={m.id} className="rounded-lg border border-border bg-muted/60 px-4 py-3">
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{memberName(m.authorId)}</span> · <span className="font-mono">{fmt(m.at)}</span></p>
              <p className="mt-1 text-sm">{m.text}</p>
            </div>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <Textarea rows={2} placeholder="Message the response team (demo, not delivered to anyone)" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <Button type="submit">Send</Button>
        </form>
      </CardContent>
    </Card>
  );
}
