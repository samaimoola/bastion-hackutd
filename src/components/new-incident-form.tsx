import { useRef, useState } from "react";
import { SimpleHint } from "./simple-mode";
import { useSimpleMode } from "@/lib/simple-mode-context";
import { fieldHints } from "@/lib/plain-language";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createIncident } from "@/lib/incidents.functions";
import { createIncidentInputSchema, DESCRIPTION_MAX, TITLE_MAX, incidentSeveritySchema, incidentStageSchema, type CreateIncidentInput, type IncidentRecord } from "@/lib/incident-models";
import { incidentKeys } from "@/lib/incident-queries";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

/** Every line starts as Unknown; nothing is presented as confirmed. */
export const UNKNOWN_TEMPLATE = "Attacker access: Unknown\nObserved impact: Unknown\nAffected communication channels: Unknown\nConfirmed findings: None yet";
export function NewIncidentForm({ userId, onCreated, onBusyChange }: { userId: string; onCreated: (incident: IncidentRecord) => Promise<void>; onBusyChange?: (busy: boolean) => void }) {
  const { simple } = useSimpleMode();
  const describe = (id: string) => (simple ? id : undefined);
  const queryClient = useQueryClient();
  const create = useServerFn(createIncident);
  const lock = useRef(false);
  const [input, setInput] = useState<CreateIncidentInput>({ title: "", description: "", severity: "Medium", stage: "Detection" });
  const [validation, setValidation] = useState<string | null>(null);
  const [created, setCreated] = useState<IncidentRecord | null>(null);
  const [navigationError, setNavigationError] = useState(false);
  const mutation = useMutation({
    mutationFn: create,
    onSuccess: async (record) => {
      setCreated(record);
      queryClient.setQueryData(incidentKeys.detail(userId, record.id), record);
      await queryClient.invalidateQueries({ queryKey: incidentKeys.list(userId) });
      try { await onCreated(record); } catch { setNavigationError(true); }
    },
  });
  return <form className="space-y-5" aria-describedby="incident-minimum" onSubmit={async (event) => {
    event.preventDefault();
    if (lock.current || created) return;
    const parsed = createIncidentInputSchema.safeParse(input);
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? "Check the incident details."); return; }
    setValidation(null);
    lock.current = true;
    onBusyChange?.(true);
    try { await mutation.mutateAsync({ data: parsed.data }); } catch { /* mutation owns the error */ }
    finally { lock.current = false; onBusyChange?.(false); }
  }}>
    <p id="incident-minimum" className="text-sm text-muted-foreground">Only a title is required. Start with what you know now and add details as you learn more.</p>
    <fieldset disabled={mutation.isPending || Boolean(created)} className="space-y-5">
      <div className="space-y-2"><Label htmlFor="incident-title">Title</Label><SimpleHint id="hint-incident-title">{fieldHints.incidentTitle}</SimpleHint><Input id="incident-title" aria-describedby={describe("hint-incident-title")} required maxLength={TITLE_MAX} value={input.title} onChange={(e) => setInput({ ...input, title: e.target.value })} /></div>
      <div className="space-y-2"><Label htmlFor="incident-description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label><SimpleHint id="hint-incident-description">{fieldHints.incidentDescription}</SimpleHint><Textarea id="incident-description" aria-describedby={describe("hint-incident-description")} rows={4} maxLength={DESCRIPTION_MAX} value={input.description} onChange={(e) => setInput({ ...input, description: e.target.value })} /></div>
      {/* Ported from the teammate's version: a starting outline where every point is explicitly Unknown. */}
      <div className="space-y-1">
        <Button type="button" variant="outline" size="sm" aria-describedby="unknown-template-note" disabled={Boolean(input.description?.trim())}
          onClick={() => setInput({ ...input, description: UNKNOWN_TEMPLATE })}>
          Start with unknown details
        </Button>
        <p id="unknown-template-note" className="text-xs text-muted-foreground">{input.description?.trim() ? "Clear the description to use the outline." : "Fills the description with an outline marked Unknown. Unknown means not checked yet, not ruled out. Replace each line as facts are confirmed."}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="incident-severity">Severity <span className="font-normal text-muted-foreground">(initial estimate)</span></Label><SimpleHint id="hint-incident-severity">{fieldHints.incidentSeverity}</SimpleHint><Select value={input.severity ?? "Medium"} onValueChange={(value) => setInput({ ...input, severity: incidentSeveritySchema.parse(value) })}><SelectTrigger id="incident-severity" aria-describedby={describe("hint-incident-severity")}><SelectValue /></SelectTrigger><SelectContent>{incidentSeveritySchema.options.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="incident-stage">Response stage <span className="font-normal text-muted-foreground">(current stage)</span></Label><SimpleHint id="hint-incident-stage">{fieldHints.incidentStage}</SimpleHint><Select value={input.stage ?? "Detection"} onValueChange={(value) => setInput({ ...input, stage: incidentStageSchema.parse(value) })}><SelectTrigger id="incident-stage" aria-describedby={describe("hint-incident-stage")}><SelectValue /></SelectTrigger><SelectContent>{incidentStageSchema.options.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      </div>
    </fieldset>
    <p className="text-sm text-muted-foreground">Severity starts at Medium and stage at Detection. These are starting values to update as the team learns more, not a verified assessment.</p>
    {(validation || mutation.isError) && <p role="alert" className="text-sm text-destructive">{validation ?? (mutation.error instanceof Error ? mutation.error.message : "The incident could not be created. Please try again.")}</p>}
    {navigationError && created && <div role="alert" className="space-y-3"><p className="text-sm">Incident saved, but the workspace could not be opened.</p><Button type="button" variant="outline" onClick={() => { void onCreated(created).catch(() => setNavigationError(true)); }}>Open saved incident</Button></div>}
    <Button type="submit" disabled={mutation.isPending || Boolean(created)}>{mutation.isPending ? "Creating incident…" : created ? "Incident created" : "Create incident"}</Button>
  </form>;
}