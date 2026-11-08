import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { canEditIncident } from "@/lib/incident-models";
import { incidentMembershipOptions } from "@/lib/incident-queries";
import { permissionNextStep } from "@/lib/plain-language";
import { membersOptions, tasksKey, tasksOptions } from "@/lib/task-queries";
import { addIncidentTask, editIncidentTask } from "@/lib/tasks.functions";
import { memberLabel, taskFields, taskStatusLabel, taskStatusSchema, TASK_DETAILS_MAX, TASK_TITLE_MAX, type IncidentTask, type TaskStatus } from "@/lib/task-models";
import { SimpleHint } from "./simple-mode";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const time = (value: string) => `${new Date(value).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`;
const UNASSIGNED = "unassigned";
const statusVariant: Record<TaskStatus, "neutral" | "info" | "success"> = { todo: "neutral", in_progress: "info", done: "success" };

/**
 * Shared tasks for a real incident. Reads and writes go only to the database (member-only reads,
 * RPC-only writes). If the task database update is not installed, the section says so and offers no
 * writes; tasks are never kept in the browser instead.
 */
export function RealTasks({ incidentId, userId }: { incidentId: string; userId: string }) {
  const client = useQueryClient();
  const membership = useQuery(incidentMembershipOptions(userId, incidentId));
  const role = membership.isError ? null : membership.data;
  const member = Boolean(role);
  const allowed = member && !membership.isFetching && canEditIncident(role);
  const tasks = useQuery({ ...tasksOptions(userId, incidentId), enabled: member });
  const available = tasks.data?.available === true;
  const members = useQuery({ ...membersOptions(userId, incidentId), enabled: allowed && available });
  const [editing, setEditing] = useState<IncidentTask | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("Connecting to live updates…");

  useEffect(() => {
    const key = tasksKey(userId, incidentId);
    if (!member) { void client.cancelQueries({ queryKey: key }); client.removeQueries({ queryKey: key }); return; }
    if (!available) return;
    let stopped = false;
    const refresh = () => { if (!stopped) void client.invalidateQueries({ queryKey: key }); };
    const access = () => { if (!stopped) { void client.invalidateQueries({ queryKey: incidentMembershipOptions(userId, incidentId).queryKey }); void client.invalidateQueries({ queryKey: membersOptions(userId, incidentId).queryKey }); refresh(); } };
    const filter = `incident_id=eq.${incidentId}`;
    const channel = supabase.channel(`tasks-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_tasks", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_members", filter }, access)
      .subscribe((status) => {
        if (stopped) return;
        if (status === "SUBSCRIBED") { setLive("Live updates connected"); refresh(); }
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setLive("Live updates unavailable. Use Refresh to check for changes.");
      });
    return () => { stopped = true; void supabase.removeChannel(channel); };
  }, [client, incidentId, userId, member, available]);

  if (membership.isPending) return <section className="py-6"><p role="status">Checking task access…</p></section>;
  if (!member) return <section className="py-6"><p role="alert">Tasks are unavailable or you no longer have incident access.</p><Button variant="outline" className="mt-4" onClick={() => { void membership.refetch(); }}>Check access again</Button></section>;
  if (tasks.isPending) return <section className="py-6"><p role="status">Loading tasks…</p></section>;
  if (tasks.isError) return <section className="py-6"><p role="alert" className="text-destructive">{tasks.error.message}</p><Button variant="outline" className="mt-4" onClick={() => { void tasks.refetch(); }}>Try again</Button></section>;

  if (!tasks.data.available) {
    return <section className="py-6">
      <h2 className="text-xl font-medium">Tasks</h2>
      <div className="mt-6 border-y border-border py-10">
        <h3 className="text-lg font-medium">Shared tasks are not set up yet</h3>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">This workspace&rsquo;s database does not include shared tasks yet. An administrator needs to install a database update before tasks can be added. Nothing is stored in your browser in the meantime.</p>
        <p className="mt-2 text-sm text-muted-foreground">The demo workspace shows how tasks will work.</p>
      </div>
    </section>;
  }

  const rows = tasks.data.tasks;
  const memberIds = (members.data ?? []).map((m) => m.user_id);
  return <section className="py-6">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-medium">Tasks</h2><p className="mt-2 text-sm text-muted-foreground">{live}</p></div>
      <div className="flex gap-2"><Button variant="outline" disabled={tasks.isFetching} onClick={() => { void tasks.refetch(); }}>Refresh</Button><Button disabled={!allowed} onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden />Add task</Button></div>
    </header>
    {!allowed && <div className="mb-5"><p className="text-sm text-muted-foreground">{membership.isFetching ? "Checking your access…" : "View-only access. Only commanders and responders can add or change tasks."}</p>{!membership.isFetching && <SimpleHint className="mt-1">{permissionNextStep}</SimpleHint>}</div>}
    {rows.length === 0 ? <div className="border-y border-border py-10">
      <h3 className="text-lg font-medium">No tasks yet</h3>
      <p className="mt-3 text-sm text-muted-foreground">Tasks added by commanders or responders appear here for everyone with access.</p>
      {allowed && <Button variant="outline" className="mt-5" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden />Add the first task</Button>}
    </div>
    : <ul aria-label="Incident tasks" className="divide-y divide-border border-y border-border">{rows.map((task) => <li key={task.id} className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className={`break-words text-base font-medium ${task.status === "done" ? "text-muted-foreground line-through" : ""}`}>{task.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><Badge variant={statusVariant[task.status]}>{taskStatusLabel[task.status]}</Badge><span className="text-muted-foreground">Assigned to: {memberLabel(task.assignee_id, userId)}</span></div>
        </div>
        {allowed && <div className="flex items-center gap-2">
          <TaskStatusSelect task={task} incidentId={incidentId} userId={userId} />
          <Button variant="outline" size="sm" onClick={() => setEditing(task)}><Pencil className="size-4" aria-hidden />Edit</Button>
        </div>}
      </div>
      {task.details && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{task.details}</p>}
      <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Record history</summary><div className="mt-2 space-y-1 break-all"><p>Created {time(task.created_at)} by {memberLabel(task.created_by, userId)}</p><p>Updated {time(task.updated_at)} by {memberLabel(task.updated_by, userId)}</p></div></details>
    </li>)}</ul>}
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing === "new" ? "Add task" : "Edit task"}</DialogTitle><DialogDescription>Saved for everyone with access to this incident.</DialogDescription></DialogHeader>
        {editing && <TaskForm key={editing === "new" ? "new" : editing.id} incidentId={incidentId} userId={userId} task={editing === "new" ? undefined : editing} memberIds={memberIds} membersLoading={members.isPending} onBusy={setBusy} onSaved={() => setEditing(null)} />}
      </DialogContent>
    </Dialog>
  </section>;
}

function useTaskSave(incidentId: string, userId: string) {
  const client = useQueryClient();
  const add = useServerFn(addIncidentTask); const edit = useServerFn(editIncidentTask);
  const after = async () => { await client.invalidateQueries({ queryKey: tasksKey(userId, incidentId) }); };
  const recheck = () => { void client.invalidateQueries({ queryKey: incidentMembershipOptions(userId, incidentId).queryKey }); void client.invalidateQueries({ queryKey: membersOptions(userId, incidentId).queryKey }); };
  return { add, edit, after, recheck };
}

function TaskStatusSelect({ task, incidentId, userId }: { task: IncidentTask; incidentId: string; userId: string }) {
  const { edit, after, recheck } = useTaskSave(incidentId, userId);
  const mutation = useMutation({ mutationFn: (status: TaskStatus) => edit({ data: { id: task.id, title: task.title, details: task.details, assigneeId: task.assignee_id, status } }), onSuccess: after, onError: recheck });
  return <div>
    <Select value={task.status} disabled={mutation.isPending} onValueChange={(value) => { void mutation.mutateAsync(taskStatusSchema.parse(value)).catch(() => undefined); }}>
      <SelectTrigger className="h-9 w-36" aria-label={`Status for ${task.title}`}><SelectValue /></SelectTrigger>
      <SelectContent>{taskStatusSchema.options.map((s) => <SelectItem key={s} value={s}>{taskStatusLabel[s]}</SelectItem>)}</SelectContent>
    </Select>
    {mutation.isError && <p role="alert" className="mt-1 max-w-48 text-xs text-destructive">{mutation.error instanceof Error ? mutation.error.message : "The status could not be saved."}</p>}
  </div>;
}

export function TaskForm({ incidentId, userId, task, memberIds, membersLoading, onBusy, onSaved }: { incidentId: string; userId: string; task?: IncidentTask | undefined; memberIds: string[]; membersLoading: boolean; onBusy?: (busy: boolean) => void; onSaved: () => void }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [details, setDetails] = useState(task?.details ?? "");
  const [assignee, setAssignee] = useState(task?.assignee_id ?? UNASSIGNED);
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [validation, setValidation] = useState<string | null>(null);
  const lock = useRef(false);
  const { add, edit, after, recheck } = useTaskSave(incidentId, userId);
  const mutation = useMutation({
    mutationFn: async (fields: { title: string; details: string; assigneeId: string | null }) => task ? edit({ data: { ...fields, id: task.id, status } }) : add({ data: { ...fields, incidentId } }),
    onSuccess: async () => { await after(); onSaved(); },
    onError: recheck,
  });
  // Only current members can be chosen. A stale assignee stays visible until saved; the database rejects it.
  const options = [...new Set([...memberIds, ...(task?.assignee_id ? [task.assignee_id] : [])])];
  return <form className="space-y-5" onSubmit={async (event) => {
    event.preventDefault(); if (lock.current) return;
    const parsed = taskFields.safeParse({ title, details, assigneeId: assignee === UNASSIGNED ? null : assignee });
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Check the task."); return; }
    setValidation(null); lock.current = true; onBusy?.(true);
    try { await mutation.mutateAsync(parsed.data); } catch { /* mutation owns the error */ } finally { lock.current = false; onBusy?.(false); }
  }}>
    <fieldset disabled={mutation.isPending} className="space-y-5">
      <div className="space-y-2"><Label htmlFor="task-title">Title</Label><Input id="task-title" required maxLength={TASK_TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="task-details">Details <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="task-details" rows={3} maxLength={TASK_DETAILS_MAX} value={details} onChange={(e) => setDetails(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="task-assignee">Assignee <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Select value={assignee} onValueChange={setAssignee}><SelectTrigger id="task-assignee"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={UNASSIGNED}>Unassigned</SelectItem>{options.map((id) => <SelectItem key={id} value={id}>{memberLabel(id, userId)}</SelectItem>)}</SelectContent></Select>
        <p className="text-xs text-muted-foreground">{membersLoading ? "Loading incident members…" : "Only people with access to this incident can be assigned."}</p>
      </div>
      {task && <div className="space-y-2"><Label htmlFor="task-status">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(taskStatusSchema.parse(v))}><SelectTrigger id="task-status"><SelectValue /></SelectTrigger>
          <SelectContent>{taskStatusSchema.options.map((s) => <SelectItem key={s} value={s}>{taskStatusLabel[s]}</SelectItem>)}</SelectContent></Select></div>}
    </fieldset>
    {(validation || mutation.isError) && <p role="alert" className="text-sm text-destructive">{validation ?? (mutation.error instanceof Error ? mutation.error.message : "The task could not be saved.")}</p>}
    <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : task ? "Save task" : "Add task"}</Button>
  </form>;
}
