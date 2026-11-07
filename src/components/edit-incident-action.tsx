import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";
import { updateIncident } from "@/lib/incidents.functions";
import { canEditIncident, updateIncidentInputSchema, TITLE_MAX, DESCRIPTION_MAX, incidentSeveritySchema, incidentStageSchema, type IncidentRecord, type UpdateIncidentInput } from "@/lib/incident-models";
import { incidentKeys, incidentMembershipOptions } from "@/lib/incident-queries";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function EditIncidentAction({ incident, userId }: { incident: IncidentRecord; userId: string }) {
  const membership = useQuery(incidentMembershipOptions(userId, incident.id));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const allowed = !membership.isError && !membership.isFetching && canEditIncident(membership.data);
  const explanation = membership.isFetching ? "Checking your incident membership…" : membership.isError ? "Membership could not be checked. Editing is unavailable." : !allowed ? "Only commanders and responders can edit this incident." : null;
  return <div className="mt-4">
    <Button variant="outline" className="w-full sm:w-auto" disabled={!allowed} aria-describedby={explanation ? "edit-permission" : undefined} onClick={() => setOpen(true)}><Pencil className="size-4" aria-hidden />Edit incident</Button>
    {explanation && <p id="edit-permission" className="mt-2 text-xs text-muted-foreground">{explanation}</p>}
    {membership.isError && <Button variant="ghost" size="sm" onClick={() => { void membership.refetch(); }}>Retry membership check</Button>}
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Edit incident</DialogTitle><DialogDescription>Save changes to this real incident.</DialogDescription></DialogHeader>
        <EditIncidentForm key={`${userId}:${incident.id}`} incident={incident} userId={userId} onBusyChange={setBusy} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  </div>;
}

export function EditIncidentForm({ incident, userId, onSaved, onBusyChange }: { incident: IncidentRecord; userId: string; onSaved: () => void; onBusyChange?: (busy: boolean) => void }) {
  const client = useQueryClient();
  const save = useServerFn(updateIncident);
  const lock = useRef(false);
  const [input, setInput] = useState<UpdateIncidentInput>({ id: incident.id, title: incident.title, description: incident.summary, severity: incident.severity, stage: incident.stage });
  const [validation, setValidation] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: save,
    onSuccess: async (record) => {
      client.setQueryData(incidentKeys.detail(userId, record.id), record);
      await Promise.all([
        client.invalidateQueries({ queryKey: incidentKeys.detail(userId, record.id) }),
        client.invalidateQueries({ queryKey: incidentKeys.list(userId) }),
        client.invalidateQueries({ queryKey: incidentKeys.membership(userId, record.id) }),
      ]);
      onSaved();
    },
    onError: () => { void client.invalidateQueries({ queryKey: incidentKeys.membership(userId, incident.id) }); },
  });
  return <form className="space-y-5" onSubmit={async (event) => {
    event.preventDefault();
    if (lock.current) return;
    const parsed = updateIncidentInputSchema.safeParse(input);
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Check the incident details."); return; }
    setValidation(null); lock.current = true; onBusyChange?.(true);
    try { await mutation.mutateAsync({ data: parsed.data }); } catch { /* mutation displays the error */ }
    finally { lock.current = false; onBusyChange?.(false); }
  }}>
    <fieldset disabled={mutation.isPending} className="space-y-5">
      <div className="space-y-2"><Label htmlFor="edit-title">Title</Label><Input id="edit-title" required maxLength={TITLE_MAX} value={input.title} onChange={(e) => setInput({ ...input, title: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="edit-description">Description</Label><Textarea id="edit-description" rows={4} maxLength={DESCRIPTION_MAX} value={input.description} onChange={(e) => setInput({ ...input, description: e.target.value })} /></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="edit-severity">Severity</Label><Select value={input.severity} onValueChange={(value) => setInput({ ...input, severity: incidentSeveritySchema.parse(value) })}><SelectTrigger id="edit-severity"><SelectValue /></SelectTrigger><SelectContent>{incidentSeveritySchema.options.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="edit-stage">Response stage</Label><Select value={input.stage} onValueChange={(value) => setInput({ ...input, stage: incidentStageSchema.parse(value) })}><SelectTrigger id="edit-stage"><SelectValue /></SelectTrigger><SelectContent>{incidentStageSchema.options.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      </div>
    </fieldset>
    {(validation || mutation.isError) && <p role="alert" className="text-sm text-destructive">{validation ?? (mutation.error instanceof Error ? mutation.error.message : "The incident could not be saved. Please try again.")}</p>}
    <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : "Save changes"}</Button>
  </form>;
}