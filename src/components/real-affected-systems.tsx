import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { affectedKey, affectedOptions } from "@/lib/affected-system-queries";
import { addAffectedSystem, editAffectedSystem } from "@/lib/affected-systems.functions";
import { affectedFields, assessmentSchema, conditionSchema, containmentSchema, systemFields, type AffectedSystem } from "@/lib/affected-system-models";
import { canEditIncident } from "@/lib/incident-models";
import { incidentMembershipOptions } from "@/lib/incident-queries";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const time = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "UTC" });
export function RealAffectedSystems({ incidentId, userId }: { incidentId: string; userId: string }) {
  const client = useQueryClient();
  const records = useQuery(affectedOptions(userId, incidentId));
  const membership = useQuery(incidentMembershipOptions(userId, incidentId));
  const allowed = !membership.isError && !membership.isFetching && canEditIncident(membership.data);
  const [editing, setEditing] = useState<AffectedSystem | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("Connecting to live updates…");
  useEffect(() => {
    const channel = supabase.channel(`affected-${crypto.randomUUID()}`).on("postgres_changes", {
      event: "*", schema: "public", table: "incident_affected_systems", filter: `incident_id=eq.${incidentId}`,
    }, () => { void client.invalidateQueries({ queryKey: affectedKey(userId, incidentId) }); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") { setLive("Live updates connected"); void client.invalidateQueries({ queryKey: affectedKey(userId, incidentId) }); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("Live updates unavailable. Use Refresh to check for changes.");
      });
    return () => { void supabase.removeChannel(channel); };
  }, [client, userId, incidentId]);
  return <section className="py-6">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-medium">Affected systems &amp; data</h2><p className="mt-2 text-sm text-muted-foreground">{live}</p></div><div className="flex gap-2"><Button variant="outline" disabled={records.isFetching} onClick={() => { void records.refetch(); }}>Refresh</Button><Button disabled={!allowed} onClick={() => setEditing("new")}><Plus className="size-4" />Add system</Button></div></header>
    {!allowed && <p className="mb-5 text-sm text-muted-foreground">{membership.isPending || membership.isFetching ? "Checking your access…" : membership.isError ? "Your editing access could not be checked." : "Only commanders and responders can add or edit systems."}</p>}
    {records.isPending ? <p role="status">Loading affected systems…</p> : records.isError ? <p role="alert" className="text-destructive">{records.error.message}</p> : records.data.length === 0 ? <div className="border-y border-border py-10"><h3 className="text-lg font-medium">No affected systems recorded</h3><p className="mt-3 text-sm text-muted-foreground">No systems or data have been recorded for this incident yet.</p>{allowed && <Button variant="outline" className="mt-5" onClick={() => setEditing("new")}><Plus className="size-4" />Add the first system</Button>}</div> : <ul className="divide-y divide-border border-y border-border">{records.data.map((record) => <li key={record.id} className="py-6">
      <div className="flex items-start justify-between gap-3"><h3 className="break-words text-xl font-medium">{record.resource_name}</h3>{allowed && <Button variant="outline" size="sm" onClick={() => setEditing(record)}><Pencil className="size-4" />Edit</Button>}</div>
      <div className="mt-3 flex flex-wrap gap-2"><Badge variant="neutral" className="capitalize">{record.assessment}</Badge>{record.data_conditions.map((value) => <Badge key={value} variant="neutral" className="capitalize">{value}</Badge>)}<Badge variant="info" className="capitalize">Containment: {record.containment_status}</Badge></div>
      <dl className="mt-5 grid gap-5 md:grid-cols-2"><div><dt className="text-xs font-medium text-muted-foreground">Data involved</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm">{record.data_description || "No data description yet."}</dd></div><div><dt className="text-xs font-medium text-muted-foreground">Investigation notes</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm">{record.investigation_notes || "No notes yet."}</dd></div></dl>
      <details className="mt-5 text-xs text-muted-foreground"><summary className="cursor-pointer">Record history</summary><div className="mt-2 space-y-2 break-all"><p>Created {time(record.created_at)} UTC by {record.created_by}</p><p>Updated {time(record.updated_at)} UTC by {record.updated_by}</p></div></details>
    </li>)}</ul>}
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editing === "new" ? "Add affected system" : "Edit affected system"}</DialogTitle><DialogDescription>Keep suspected findings separate from confirmed findings.</DialogDescription></DialogHeader>{editing && <AffectedSystemForm key={editing === "new" ? "new" : editing.id} incidentId={incidentId} userId={userId} record={editing === "new" ? undefined : editing} onBusy={setBusy} onSaved={() => setEditing(null)} />}</DialogContent></Dialog>
  </section>;
}

export function AffectedSystemForm({ incidentId, userId, record, onBusy, onSaved }: { incidentId: string; userId: string; record?: AffectedSystem; onBusy?: (busy: boolean) => void; onSaved: () => void }) {
  const [input, setInput] = useState(() => systemFields(record));
  const [validation, setValidation] = useState<string | null>(null);
  const lock = useRef(false);
  const client = useQueryClient();
  const add = useServerFn(addAffectedSystem); const edit = useServerFn(editAffectedSystem);
  const mutation = useMutation({ mutationFn: async () => record ? edit({ data: { ...affectedFields.parse(input), id: record.id } }) : add({ data: { ...affectedFields.parse(input), incidentId } }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: affectedKey(userId, incidentId) }); onSaved(); },
    onError: () => { void client.invalidateQueries({ queryKey: incidentMembershipOptions(userId, incidentId).queryKey }); },
  });
  return <form className="space-y-5" onSubmit={async (event) => {
    event.preventDefault(); if (lock.current) return;
    const parsed = affectedFields.safeParse(input);
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Check the details."); return; }
    setValidation(null); lock.current = true; onBusy?.(true);
    try { await mutation.mutateAsync(); } catch { /* mutation owns error state */ } finally { lock.current = false; onBusy?.(false); }
  }}><fieldset disabled={mutation.isPending} className="space-y-5">
    <div className="space-y-2"><Label htmlFor="resource-name">System or resource name</Label><Input id="resource-name" required maxLength={200} value={input.resourceName} onChange={(e) => setInput({ ...input, resourceName: e.target.value })} /></div>
    <div className="space-y-2"><Label htmlFor="data-description">Data involved</Label><Textarea id="data-description" maxLength={10000} rows={3} value={input.dataDescription} onChange={(e) => setInput({ ...input, dataDescription: e.target.value })} /></div>
    <div className="space-y-2"><Label htmlFor="assessment">How certain is this finding?</Label><Select value={input.assessment} onValueChange={(value) => setInput({ ...input, assessment: assessmentSchema.parse(value) })}><SelectTrigger id="assessment"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="suspected">Suspected</SelectItem><SelectItem value="confirmed">Confirmed</SelectItem></SelectContent></Select></div>
    <fieldset className="space-y-3"><legend className="text-sm font-medium">What happened to the data?</legend><div className="grid grid-cols-2 gap-3">{conditionSchema.options.map((condition) => <label key={condition} className="flex items-center gap-2 text-sm capitalize"><Checkbox checked={input.dataConditions.includes(condition)} onCheckedChange={(checked) => setInput({ ...input, dataConditions: checked ? [...input.dataConditions, condition] : input.dataConditions.filter((value) => value !== condition) })} />{condition}</label>)}</div></fieldset>
    <div className="space-y-2"><Label htmlFor="containment">Containment status</Label><Select value={input.containmentStatus} onValueChange={(value) => setInput({ ...input, containmentStatus: containmentSchema.parse(value) })}><SelectTrigger id="containment"><SelectValue /></SelectTrigger><SelectContent>{containmentSchema.options.map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-2"><Label htmlFor="investigation-notes">Investigation notes</Label><Textarea id="investigation-notes" rows={3} maxLength={10000} value={input.investigationNotes} onChange={(e) => setInput({ ...input, investigationNotes: e.target.value })} /></div>
  </fieldset>{(validation || mutation.isError) && <p role="alert" className="text-sm text-destructive">{validation ?? (mutation.error instanceof Error ? mutation.error.message : "The system could not be saved.")}</p>}<Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save system"}</Button></form>;
}