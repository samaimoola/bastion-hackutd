import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, FlaskConical, Plus, RefreshCw, RotateCcw, ShieldOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { affectedOptions } from "@/lib/affected-system-queries";
import { incidentMembershipOptions } from "@/lib/incident-queries";
import { canEditIncident } from "@/lib/incident-models";
import { labKey, labOptions } from "@/lib/containment-queries";
import { saveContainmentModel, saveContainmentPlan } from "@/lib/containment.functions";
import { assumptions, demoActions, demoModel, demoNames, edgeKey, emptyModel, explainTradeoff, MEASURES_NOTE, offlineReasons, MAX_EDGES, MAX_SYSTEMS, planTitleSchema, pruneModel, simulate, type ContainmentModel, type ContainmentResults, type Edge } from "@/lib/containment-graph";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const time = (value: string) => `${new Date(value).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`;
type Names = (id: string) => string;

function LabHeader({ sandbox, children }: { sandbox: boolean; children?: ReactNode }) {
  return <header className="mb-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-medium">Containment Lab</h2><p className="text-sm text-muted-foreground">What changes if we isolate one system?</p></div>
      {children}
    </div>
    <div role="note" className="flex gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
      <ShieldOff className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p><strong>Simulation only. No real system is being isolated.</strong> {sandbox
        ? "These fictional systems exist only in this browser tab and are never saved to an incident."
        : "Choosing a system only recalculates this model. Nothing is scanned or disconnected, and containment status is not changed."}</p>
    </div>
  </header>;
}

export function ContainmentLab({ incidentId, userId }: { incidentId: string; userId: string }) {
  const [sandbox, setSandbox] = useState(false);
  return <section className="py-6">
    <LabHeader sandbox={sandbox}><Button variant={sandbox ? "default" : "outline"} onClick={() => setSandbox(!sandbox)}><FlaskConical className="size-4" />{sandbox ? "Back to this incident" : "Try synthetic example"}</Button></LabHeader>
    {sandbox ? <SandboxLab /> : <RealLab incidentId={incidentId} userId={userId} />}
  </section>;
}

/** Sandbox-only Containment Lab for the synthetic demo workspace. Never reads or writes incident records. */
export function ContainmentSandbox() {
  return <section className="py-6"><LabHeader sandbox /><SandboxLab /></section>;
}

function SandboxLab() {
  const [model, setModel] = useState<ContainmentModel>(demoModel);
  const [isolated, setIsolated] = useState("");
  const names: Names = (id) => demoNames[id] ?? "Unknown system";
  const actions = <>
    <span className="text-sm text-muted-foreground">or try an example:</span>
    {demoActions.map((id) => <Button key={id} size="sm" variant={isolated === id ? "default" : "outline"} aria-pressed={isolated === id} onClick={() => setIsolated(id)}>Isolate {names(id)}</Button>)}
    <Button size="sm" variant="ghost" onClick={() => { setModel(demoModel); setIsolated(""); }}><RotateCcw className="size-4" />Reset</Button>
  </>;
  return <LabBody model={model} setModel={setModel} options={Object.keys(demoNames)} names={names} isolated={isolated} setIsolated={setIsolated} editable actions={actions}
    extraDetails={<ChoiceComparison model={model} choices={demoActions} names={names} selected={isolated} />} />;
}

/** Side-by-side summary of the example isolation choices, recalculated from the current sandbox model. */
function ChoiceComparison({ model, choices, names, selected }: { model: ContainmentModel; choices: string[]; names: Names; selected: string }) {
  const rows = choices.filter((id) => model.systems.includes(id)).map((id) => ({ id, r: simulate(model, id) }));
  if (rows.length < 2) return null;
  const show = (ids: string[]) => ids.length ? ids.map(names).join(", ") : "None";
  return <Details title="Compare both example choices side by side">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">Hypothetical results of the two example isolation choices</caption>
        <thead className="text-xs text-muted-foreground"><tr><th scope="col" className="py-2 pr-4 font-medium">If you isolate</th><th scope="col" className="py-2 pr-4 font-medium">Other systems no longer reachable</th><th scope="col" className="py-2 pr-4 font-medium">Business-critical still reachable</th><th scope="col" className="py-2 font-medium">Business-critical unavailable</th></tr></thead>
        <tbody className="divide-y divide-border">{rows.map(({ id, r }) => <tr key={id} className={selected === id ? "bg-muted" : undefined}>
          <th scope="row" className="py-2 pr-4 font-medium">{names(id)}{selected === id && <span className="sr-only"> (selected)</span>}</th>
          <td className="py-2 pr-4">{show(r.newly_unreachable.filter((x) => x !== id))}</td>
          <td className="py-2 pr-4">{show(r.critical_reachable_after)}</td>
          <td className="py-2">{show(r.critical_offline)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </Details>;
}

function RealLab({ incidentId, userId }: { incidentId: string; userId: string }) {
  const client = useQueryClient();
  const membership = useQuery({ ...incidentMembershipOptions(userId, incidentId), refetchInterval: 5000, refetchIntervalInBackground: true });
  const role = membership.isError ? null : membership.data;
  const member = Boolean(role);
  const allowed = member && !membership.isFetching && canEditIncident(role);
  const lab = useQuery({ ...labOptions(userId, incidentId), enabled: member });
  const systems = useQuery({ ...affectedOptions(userId, incidentId), enabled: member });
  const [draft, setDraft] = useState<ContainmentModel>(emptyModel);
  const [dirty, setDirty] = useState(false);
  const [isolated, setIsolated] = useState("");
  const [live, setLive] = useState("Connecting to live updates…");

  useEffect(() => {
    const key = labKey(userId, incidentId);
    const clear = () => { void client.cancelQueries({ queryKey: key }); client.removeQueries({ queryKey: key }); };
    if (!member) { clear(); setDraft(emptyModel()); setDirty(false); return; }
    let stopped = false;
    const checkAccess = () => { if (!stopped) void client.invalidateQueries({ queryKey: incidentMembershipOptions(userId, incidentId).queryKey }); };
    const refresh = () => { if (!stopped) { void client.invalidateQueries({ queryKey: key }); checkAccess(); } };
    const filter = `incident_id=eq.${incidentId}`;
    const channel = supabase.channel(`lab-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_containment_models", filter }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incident_containment_plans", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_members", filter }, () => { if (!stopped) { clear(); checkAccess(); } })
      .subscribe((status) => {
        if (stopped) return;
        if (status === "SUBSCRIBED") { setLive("Live updates connected"); refresh(); }
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setLive("Live updates unavailable. Use Refresh to check for changes.");
      });
    return () => { stopped = true; void supabase.removeChannel(channel); clear(); };
  }, [client, incidentId, userId, member, role]);

  const stored = lab.data?.model ?? null;
  useEffect(() => { if (!dirty) setDraft(stored ?? emptyModel()); }, [stored, dirty]);
  const nameMap = useMemo(() => new Map((systems.data ?? []).map((s) => [s.id, s.resource_name])), [systems.data]);
  const names: Names = (id) => nameMap.get(id) ?? "Unlisted system";
  useEffect(() => { if (isolated && !draft.systems.includes(isolated)) setIsolated(""); }, [draft.systems, isolated]);

  const lock = useRef(false);
  const saveModelFn = useServerFn(saveContainmentModel);
  const savePlanFn = useServerFn(saveContainmentPlan);
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const afterWrite = async () => { await client.invalidateQueries({ queryKey: labKey(userId, incidentId) }); setDirty(false); };
  const modelMutation = useMutation({ mutationFn: () => saveModelFn({ data: { incidentId, model: draft } }), onSuccess: afterWrite, onError: () => { void membership.refetch(); } });
  const planMutation = useMutation({ mutationFn: (t: string) => savePlanFn({ data: { incidentId, model: draft, title: t, isolatedSystemId: isolated } }), onSuccess: async () => { setTitle(""); await afterWrite(); }, onError: () => { void membership.refetch(); } });
  const run = async (task: () => Promise<unknown>) => { if (lock.current) return; lock.current = true; try { await task(); } catch { /* shown via mutation state */ } finally { lock.current = false; } };
  const busy = modelMutation.isPending || planMutation.isPending;

  if (membership.isPending) return <p role="status">Checking access…</p>;
  if (!member) return <div><p role="alert">Containment Lab is unavailable or you no longer have incident access.</p><Button variant="outline" className="mt-4" onClick={() => { void membership.refetch(); }}>Check access again</Button></div>;
  if (lab.isPending || systems.isPending) return <p role="status">Loading Containment Lab…</p>;
  if (lab.isError || systems.isError) return <p role="alert" className="text-destructive">{(lab.error ?? systems.error)?.message}</p>;

  const options = systems.data.map((s) => s.id);
  const error = formError ?? (modelMutation.error ?? planMutation.error)?.message ?? null;
  return <div className="space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p>{live}{lab.data.updatedAt ? ` · Model last saved ${time(lab.data.updatedAt)}` : " · No model saved yet"}{dirty ? " · Unsaved changes" : ""}</p>
      <Button variant="outline" size="sm" disabled={lab.isFetching} onClick={() => { void lab.refetch(); void systems.refetch(); }}><RefreshCw className="size-4" />Refresh</Button>
    </div>
    {!allowed && <p className="text-sm text-muted-foreground">{membership.isFetching ? "Checking your access…" : "You can view the shared model and saved plans. Only commanders and responders can change them."}</p>}
    {options.length === 0 ? <div className="border-y border-border py-10"><h3 className="text-lg font-medium">No affected systems yet</h3><p className="mt-3 text-sm text-muted-foreground">Add systems in the Affected Systems &amp; Data tab first, or try the synthetic example above.</p></div>
      : <LabBody model={draft} setModel={(m) => { setDraft(m); setDirty(true); }} options={options} names={names} isolated={isolated} setIsolated={setIsolated} editable={allowed && !busy} editorOpenByDefault={(lab.data.model?.systems.length ?? 0) === 0} />}
    {allowed && options.length > 0 && <div className="flex flex-wrap items-end gap-3 border-t border-border pt-6">
      <Button variant="outline" disabled={busy || !dirty} onClick={() => { void run(() => modelMutation.mutateAsync()); }}>{modelMutation.isPending ? "Saving model…" : "Save model"}</Button>
      <form className="flex flex-1 flex-wrap items-end gap-3" onSubmit={(e) => {
        e.preventDefault();
        const parsed = planTitleSchema.safeParse(title);
        if (!parsed.success) { setFormError(parsed.error.issues[0]?.message ?? "Check the plan name."); return; }
        if (!isolated) { setFormError("Choose a system to isolate first."); return; }
        setFormError(null); void run(() => planMutation.mutateAsync(parsed.data));
      }}>
        <div className="min-w-56 flex-1 space-y-2"><Label htmlFor="plan-title">Proposed plan name</Label><Input id="plan-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Isolate file server first" disabled={busy} /></div>
        <Button type="submit" disabled={busy || !isolated}>{planMutation.isPending ? "Saving plan…" : "Save proposed plan"}</Button>
      </form>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <SavedPlans plans={lab.data.plans} names={names} />
  </div>;
}

/** Native disclosure, matching other workspace sections. Keyboard accessible by default. */
function Details({ title, children, open, onToggle }: { title: ReactNode; children: ReactNode; open?: boolean; onToggle?: (open: boolean) => void }) {
  return <details className="group rounded-md border border-border" {...(open === undefined ? {} : { open })} onToggle={(e) => onToggle?.((e.currentTarget as HTMLDetailsElement).open)}>
    <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
      <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />{title}
    </summary>
    <div className="border-t border-border px-4 py-4">{children}</div>
  </details>;
}

function LabBody({ model, setModel, options, names, isolated, setIsolated, editable, actions, extraDetails, editorOpenByDefault }: { model: ContainmentModel; setModel: (m: ContainmentModel) => void; options: string[]; names: Names; isolated: string; setIsolated: (id: string) => void; editable: boolean; actions?: ReactNode; extraDetails?: ReactNode; editorOpenByDefault?: boolean }) {
  const results = isolated && model.systems.includes(isolated) ? simulate(model, isolated) : null;
  // Open the editor by default only when there is nothing to show yet. The real lab passes this from
  // the stored model, because its draft is filled in one render after mounting.
  const [editOpen, setEditOpen] = useState(editorOpenByDefault ?? model.systems.length === 0);
  const counts = `${count(model.systems.length, "system")}, ${count(model.spread.length, "attack/access link")}, ${count(model.dependencies.length, "business dependency", "business dependencies")}`;
  return <div className="space-y-6">
    <div className="rounded-lg border border-border bg-card p-4">
      <Label htmlFor="isolate-pick" className="text-base font-medium">Which system would you hypothetically isolate?</Label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={isolated} onValueChange={setIsolated} disabled={model.systems.length === 0}>
          <SelectTrigger id="isolate-pick" className="w-full sm:w-72"><SelectValue placeholder="Choose one modeled system" /></SelectTrigger>
          <SelectContent>{model.systems.map((id) => <SelectItem key={id} value={id}>{names(id)}</SelectItem>)}</SelectContent>
        </Select>
        {actions}
      </div>
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <OutcomeSummary model={model} results={results} names={names} />
      <Graph model={model} names={names} results={results} onSelect={model.systems.length ? setIsolated : undefined} />
    </div>
    <div className="space-y-3">
      <Details title={<>{editable ? "Edit systems and connections" : "Systems and connections (view only)"}<span className="font-normal text-muted-foreground">· {counts}</span></>} open={editOpen} onToggle={setEditOpen}>
        <ModelEditor model={model} setModel={setModel} options={options} names={names} editable={editable} />
      </Details>
      {extraDetails}
      <Details title="Calculation details, assumptions and before/after lists">
        <CalculationDetails model={model} results={results} names={names} />
      </Details>
    </div>
  </div>;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function OutcomeSummary({ model, results, names }: { model: ContainmentModel; results: ContainmentResults | null; names: Names }) {
  if (!results) {
    const base = simulate(model, "");
    const critical = base.baseline_reachable.filter((id) => model.critical.includes(id));
    return <section aria-labelledby="outcome-heading" aria-live="polite" className="rounded-lg border border-dashed border-border p-4">
      <h3 id="outcome-heading" className="text-base font-medium">Outcome</h3>
      <p className="mt-2 text-sm">Choose a system to isolate to see what changes.</p>
      {model.systems.length > 0 && <p className="mt-2 text-sm text-muted-foreground">Before any isolation, modeled attack paths reach {count(base.baseline_reachable.length, "system")}{critical.length ? `, including business-critical ${critical.map(names).join(", ")}` : ""}.</p>}
    </section>;
  }
  const t = explainTradeoff(model, results, names);
  const reasons = new Map(offlineReasons(model, results).map((r) => [r.id, r.dependsOn]));
  const why = (id: string) => { const d = reasons.get(id); return d ? ` (depends on ${names(d)})` : id === results.isolated ? " (isolated)" : ""; };
  const otherOffline = results.offline.filter((id) => id !== results.isolated && !model.critical.includes(id));
  const item = (badge: ReactNode, label: string, ids: string[], empty: string, withReasons = false) => <div className="py-3">
    <dt className="flex flex-wrap items-center gap-2 text-sm font-medium">{badge}{label} <span className="font-normal text-muted-foreground">({ids.length})</span></dt>
    <dd className="mt-1 text-sm">{ids.length ? <ul className="list-disc space-y-0.5 pl-5">{ids.map((id) => <li key={id}>{names(id)}{withReasons ? why(id) : ""}</li>)}</ul> : <span className="text-muted-foreground">{empty}</span>}</dd>
  </div>;
  return <section aria-labelledby="outcome-heading" aria-live="polite" className="rounded-lg border border-border bg-card p-4">
    <h3 id="outcome-heading" className="text-base font-medium">Outcome of isolating {names(results.isolated)}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{t.summary}</p>
    <dl className="mt-2 divide-y divide-border">
      <div className="py-3">
        <dt className="flex items-center gap-2 text-sm font-medium"><Badge variant="neutral">Isolated</Badge>Hypothetically isolated</dt>
        <dd className="mt-1 text-sm"><span className="font-medium">{names(results.isolated)}</span><span className="block text-muted-foreground">{t.isolatedNote}</span></dd>
      </div>
      {item(<Badge variant="info">Cut off</Badge>, "Other systems no longer reachable from modeled attack paths", t.otherUnreachable, "None. No other previously reachable system is cut off.")}
      {item(<Badge variant="critical">Exposed</Badge>, "Business-critical systems still reachable", results.critical_reachable_after, "None in this model.")}
      {item(<Badge variant="warning">Unavailable</Badge>, "Business-critical services unavailable", results.critical_offline, "None in this model.", true)}
    </dl>
    {otherOffline.length > 0 && <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Also unavailable:</span> {otherOffline.map((id) => `${names(id)}${why(id)}`).join("; ")}.</p>}
    {t.unavailableButReachableText && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">{t.unavailableButReachableText} <span className="text-muted-foreground">See “Calculation details” for why these measures differ.</span></p>}
  </section>;
}

function CalculationDetails({ model, results, names }: { model: ContainmentModel; results: ContainmentResults | null; names: Names }) {
  return <div className="space-y-6 text-sm">
    <div className="space-y-2">
      <h4 className="font-medium">How this is calculated</h4>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li><span className="font-medium text-foreground">Attack/access link A → B:</span> someone with access to A could reach B. Reachability follows these links from the suspected starting points.</li>
        <li><span className="font-medium text-foreground">Business dependency A → B:</span> A needs B to keep working. Only these links decide what becomes unavailable, including chains (A needs B, B needs C).</li>
        <li>Isolating a system removes every attack/access link into and out of it, then recalculates reachability. The calculation is deterministic: the same model and choice always give the same result.</li>
      </ul>
      <p className="text-muted-foreground">{MEASURES_NOTE}</p>
    </div>
    {results ? <Comparison model={model} results={results} names={names} /> : <p className="text-muted-foreground">Before/after lists appear once you choose a system to isolate.</p>}
    <Assumptions model={model} />
  </div>;
}

function ModelEditor({ model, setModel, options, names, editable }: { model: ContainmentModel; setModel: (m: ContainmentModel) => void; options: string[]; names: Names; editable: boolean }) {
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [kind, setKind] = useState<"spread" | "dependencies">("spread");
  const toggle = (list: "systems" | "starts" | "critical", id: string, on: boolean) => {
    const next = { ...model, [list]: on ? [...model[list], id] : model[list].filter((x) => x !== id) };
    setModel(list === "systems" ? pruneModel(next) : next);
  };
  const exists = model[kind].some((e) => e.from === from && e.to === to);
  const canAdd = editable && from && to && from !== to && !exists && model[kind].length < MAX_EDGES;
  const removeEdge = (list: "spread" | "dependencies", e: Edge) => setModel({ ...model, [list]: model[list].filter((x) => edgeKey(x) !== edgeKey(e)) });
  return <div className="grid gap-8 lg:grid-cols-2">
    <fieldset disabled={!editable}>
      <legend className="text-base font-medium">1. Systems in the model</legend>
      <p className="mt-1 text-xs text-muted-foreground">Up to {MAX_SYSTEMS} systems. Mark where the attacker may have started and which systems the business can’t do without.</p>
      <ul className="mt-3 divide-y divide-border border-y border-border">{options.map((id) => {
        const inModel = model.systems.includes(id);
        return <li key={id} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3 text-sm">
          <label className="flex min-w-48 flex-1 items-center gap-2 font-medium"><Checkbox checked={inModel} disabled={!inModel && model.systems.length >= MAX_SYSTEMS} onCheckedChange={(c) => toggle("systems", id, c === true)} />{names(id)}</label>
          <label className="flex items-center gap-2"><Checkbox checked={model.starts.includes(id)} disabled={!inModel} onCheckedChange={(c) => toggle("starts", id, c === true)} />Suspected start</label>
          <label className="flex items-center gap-2"><Checkbox checked={model.critical.includes(id)} disabled={!inModel} onCheckedChange={(c) => toggle("critical", id, c === true)} />Business-critical</label>
        </li>;
      })}</ul>
    </fieldset>
    <div>
      <h3 className="text-base font-medium">2. Connections</h3>
      <dl className="mt-1 space-y-1 text-xs text-muted-foreground">
        <div><dt className="inline font-medium text-foreground">Spread / access link A → B:</dt> <dd className="inline">someone on A could reach B.</dd></div>
        <div><dt className="inline font-medium text-foreground">Business dependency A → B:</dt> <dd className="inline">A needs B to keep working. Only these links decide what goes offline.</dd></div>
      </dl>
      {editable && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr]">
        <Select value={kind} onValueChange={(v) => setKind(v as "spread" | "dependencies")}><SelectTrigger aria-label="Connection type" className="sm:col-span-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="spread">Spread / access link</SelectItem><SelectItem value="dependencies">Business dependency</SelectItem></SelectContent></Select>
        <Select value={from} onValueChange={setFrom}><SelectTrigger aria-label="From system"><SelectValue placeholder="From (A)" /></SelectTrigger><SelectContent>{model.systems.map((id) => <SelectItem key={id} value={id}>{names(id)}</SelectItem>)}</SelectContent></Select>
        <Select value={to} onValueChange={setTo}><SelectTrigger aria-label="To system"><SelectValue placeholder="To (B)" /></SelectTrigger><SelectContent>{model.systems.map((id) => <SelectItem key={id} value={id}>{names(id)}</SelectItem>)}</SelectContent></Select>
        <Button variant="secondary" className="sm:col-span-2" disabled={!canAdd} onClick={() => { setModel({ ...model, [kind]: [...model[kind], { from, to }] }); setTo(""); }}><Plus className="size-4" />Add connection</Button>
        {from && to && from === to && <p className="text-xs text-muted-foreground sm:col-span-2">Pick two different systems.</p>}
        {exists && <p className="text-xs text-muted-foreground sm:col-span-2">This connection already exists.</p>}
      </div>}
      {(["spread", "dependencies"] as const).map((list) => <div key={list} className="mt-4">
        <h4 className="text-xs font-medium text-muted-foreground">{list === "spread" ? "Spread / access links" : "Business dependencies"} ({model[list].length})</h4>
        {model[list].length === 0 ? <p className="mt-1 text-sm text-muted-foreground">None yet.</p> : <ul className="mt-1 space-y-1">{model[list].map((e) => <li key={edgeKey(e)} className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-1.5 text-sm">
          <span>{names(e.from)} {list === "spread" ? "→ can reach →" : "→ depends on →"} {names(e.to)}</span>
          {editable && <Button size="icon" variant="ghost" className="size-7" aria-label={`Remove connection ${names(e.from)} to ${names(e.to)}`} onClick={() => removeEdge(list, e)}><X className="size-4" /></Button>}
        </li>)}</ul>}
      </div>)}
    </div>
  </div>;
}

const shorten = (text: string, max = 24) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function Graph({ model, names, results, onSelect }: { model: ContainmentModel; names: Names; results: ContainmentResults | null; onSelect?: ((id: string) => void) | undefined }) {
  const n = model.systems.length;
  if (n === 0) return <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Add systems in “Edit systems and connections” to see the graph.</div>;
  const W = 760, H = 420, RX = 190, RY = 128, NODE = 20;
  const angle = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2;
  const pos = new Map(model.systems.map((id, i) => [id, { x: W / 2 + RX * Math.cos(angle(i)), y: H / 2 + RY * Math.sin(angle(i)), a: angle(i) }]));
  const remaining = new Set(results?.remaining_paths.map(edgeKey));
  const interrupted = new Set(results?.interrupted_paths.map(edgeKey));
  const offline = new Set(results?.offline); const unreachable = new Set(results?.newly_unreachable); const reachable = new Set(results ? results.reachable_after : simulate(model, "").baseline_reachable);
  // Dependency lines are drawn offset to one side so a dependency and an attack/access link between
  // the same two systems stay visibly separate.
  const line = (e: Edge, cls: string, marker: string, dash?: string, offset = 0) => {
    const a = pos.get(e.from)!, b = pos.get(e.to)!; const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1; const k = (NODE + 4) / len;
    const ox = (-dy / len) * offset, oy = (dx / len) * offset;
    return <line key={`${marker}${edgeKey(e)}`} x1={a.x + dx * k + ox} y1={a.y + dy * k + oy} x2={b.x - dx * k + ox} y2={b.y - dy * k + oy} className={cls} strokeWidth={2} strokeDasharray={dash} markerEnd={`url(#${marker})`} />;
  };
  const status = (id: string) => {
    const parts: string[] = [];
    if (results?.isolated === id) parts.push("isolated");
    else if (unreachable.has(id)) parts.push("no longer reachable");
    else if (reachable.has(id)) parts.push("reachable");
    if (offline.has(id) && results?.isolated !== id) parts.push("unavailable");
    return parts.join(" · ");
  };
  const describe = (id: string) => [names(id), model.starts.includes(id) && "suspected starting point", model.critical.includes(id) && "business-critical", status(id) || "not reachable"].filter(Boolean).join(", ");
  return <figure className="rounded-lg border border-border bg-card p-3">
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label={`Containment model graph${onSelect ? ". Select a system to hypothetically isolate it" : ""}. The outcome summary and calculation details list the same information.`}>
      <defs>{["arrow-muted", "arrow-primary", "arrow-destructive", "arrow-warning"].map((m) => <marker key={m} id={m} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className={m === "arrow-primary" ? "fill-primary" : m === "arrow-destructive" ? "fill-destructive" : m === "arrow-warning" ? "fill-warning" : "fill-muted-foreground"} /></marker>)}</defs>
      {model.dependencies.map((e) => line(e, "stroke-warning/70", "arrow-warning", "2 5", 7))}
      {model.spread.map((e) => { const k = edgeKey(e); return results && interrupted.has(k) ? line(e, "stroke-destructive", "arrow-destructive", "7 5") : results && remaining.has(k) ? line(e, "stroke-primary", "arrow-primary") : line(e, "stroke-muted-foreground", "arrow-muted"); })}
      {model.systems.map((id) => {
        const p = pos.get(id)!; const isIso = results?.isolated === id; const crit = model.critical.includes(id);
        const fill = isIso ? "fill-accent" : offline.has(id) ? "fill-muted" : reachable.has(id) ? "fill-destructive/20" : "fill-card";
        // Labels sit outside the ring of nodes, pointing away from the centre where links cross.
        const cx = Math.cos(p.a), cy = Math.sin(p.a);
        const anchor = cx > 0.35 ? "start" : cx < -0.35 ? "end" : "middle";
        const lx = p.x + cx * (NODE + 10), above = cy < -0.35, below = cy > 0.35;
        const ly = above ? p.y - NODE - 22 : below ? p.y + NODE + 16 : p.y - 2;
        const label = shorten(names(id)); const st = status(id);
        const halo = { paintOrder: "stroke" as const, strokeLinejoin: "round" as const };
        const select = onSelect ? () => onSelect(id) : undefined;
        return <g key={id} {...(select ? {
          role: "button", tabIndex: 0, "aria-pressed": isIso, "aria-label": `${describe(id)}. Isolate hypothetically.`,
          onClick: select, onKeyDown: (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } },
          className: "group cursor-pointer outline-none",
        } : { "aria-label": describe(id) })}>
          <title>{describe(id)}</title>
          <circle cx={p.x} cy={p.y} r={NODE + 6} className="fill-none stroke-ring opacity-0 group-hover:opacity-40 group-focus-visible:opacity-100" strokeWidth={2} />
          <circle cx={p.x} cy={p.y} r={NODE} className={`${fill} ${isIso ? "stroke-primary" : crit ? "stroke-warning" : "stroke-border"}`} strokeWidth={isIso ? 4 : crit ? 3 : 1.5} strokeDasharray={offline.has(id) && !isIso ? "4 3" : undefined} />
          <text x={p.x} y={p.y + 4} textAnchor="middle" className="fill-foreground text-[12px] font-semibold" aria-hidden>{`${model.starts.includes(id) ? "S" : ""}${crit ? "!" : ""}`}</text>
          <text x={lx} y={ly} textAnchor={anchor} className="fill-foreground stroke-card text-[13px] font-medium" strokeWidth={5} style={halo} aria-hidden>
            <tspan x={lx}>{label}</tspan>
            {st && <tspan x={lx} dy={15} className={`text-[11px] font-normal ${isIso ? "fill-primary" : st.includes("unavailable") ? "fill-warning" : st.includes("no longer") ? "fill-info" : "fill-muted-foreground"}`}>{st}</tspan>}
          </text>
        </g>;
      })}
    </svg>
    <figcaption className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
      <p><span className="font-medium text-foreground">Systems:</span> S = suspected start · ! amber ring = business-critical · thick ring = isolated · tinted = reachable · dashed circle = unavailable</p>
      <p><span className="font-medium text-foreground">Links:</span> grey/solid = attack/access path (A → B: A can reach B) · red dashed = interrupted · amber dotted = business dependency (A → B: A needs B)</p>
    </figcaption>
  </figure>;
}

function NameList({ ids, names, empty }: { ids: string[]; names: Names; empty: string }) {
  return ids.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="list-disc space-y-1 pl-5 text-sm">{ids.map((id) => <li key={id}>{names(id)}</li>)}</ul>;
}
function Comparison({ model, results, names }: { model: ContainmentModel; results: ContainmentResults; names: Names }) {
  const t = explainTradeoff(model, results, names);
  const path = (e: Edge) => `${names(e.from)} → ${names(e.to)}`;
  const paths = (edges: Edge[], empty: string) => edges.length ? <ul className="list-disc space-y-1 pl-5">{edges.map((e) => <li key={edgeKey(e)}>{path(e)}</li>)}</ul> : <p className="text-muted-foreground">{empty}</p>;
  return <div className="space-y-4">
    <h4 className="font-medium">Before and after isolating {names(results.isolated)}</h4>
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2"><h5 className="font-medium">Reachable before ({results.baseline_reachable.length})</h5><NameList ids={results.baseline_reachable} names={names} empty="Nothing is reachable from the starting points." /></div>
      <div className="space-y-2"><h5 className="font-medium">Reachable after ({results.reachable_after.length})</h5><NameList ids={results.reachable_after} names={names} empty="Nothing is reachable from the starting points." /></div>
      <div className="space-y-2"><h5 className="font-medium">No longer reachable from modeled attack paths ({results.newly_unreachable.length})</h5><NameList ids={results.newly_unreachable} names={names} empty="No previously reachable system is cut off by this isolation." />
        <p className="text-muted-foreground">{t.isolatedNote} {t.otherUnreachableText}</p></div>
      <div className="space-y-2"><h5 className="font-medium">Unavailable because of business dependencies ({results.offline.length})</h5><ul className="list-disc space-y-1 pl-5">{t.businessCost.map((line) => <li key={line}>{line}</li>)}</ul></div>
      <div className="space-y-2"><h5 className="font-medium">Attack/access paths still in use ({results.remaining_paths.length})</h5>{paths(results.remaining_paths, "No modeled path remains in use.")}<p className="text-muted-foreground">{t.exposure}</p></div>
      <div className="space-y-2"><h5 className="font-medium">Attack/access paths interrupted ({results.interrupted_paths.length})</h5>{paths(results.interrupted_paths, "No modeled path is interrupted.")}</div>
    </div>
  </div>;
}
function Assumptions({ model }: { model: ContainmentModel }) {
  return <div className="space-y-2"><h4 className="font-medium">Assumptions and missing information</h4><ul className="list-disc space-y-1 pl-5 text-muted-foreground">{assumptions(model).map((a) => <li key={a}>{a}</li>)}<li>This compares models only. It does not estimate likelihood, cost, or whether the incident is actually contained.</li></ul></div>;
}
function SavedPlans({ plans, names }: { plans: { id: string; title: string; isolated_system_id: string; results: ContainmentResults; created_by: string; author_name: string | null; created_at: string }[]; names: Names }) {
  return <div className="border-t border-border pt-6">
    <h3 className="text-base font-medium">Saved proposed plans</h3>
    {plans.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No plans saved yet. A saved plan records a proposal; it does not isolate anything.</p> : <ul className="mt-3 divide-y divide-border border-y border-border">{plans.map((p) => <li key={p.id} className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="break-words font-medium">{p.title}</h4><span className="text-xs text-muted-foreground">{p.author_name?.trim() || `Member ${p.created_by.slice(0, 8)}`} · {time(p.created_at)}</span></div>
      <p className="mt-1 text-sm">Proposed isolation: <strong>{names(p.isolated_system_id)}</strong></p>
      <p className="mt-1 text-sm text-muted-foreground">{p.results.newly_unreachable.filter((x) => x !== p.isolated_system_id).length} other system(s) no longer reachable · {p.results.interrupted_paths.length} path(s) interrupted · {p.results.remaining_paths.length} remain · business-critical unavailable: {p.results.critical_offline.length ? p.results.critical_offline.map(names).join(", ") : "none"}</p>
    </li>)}</ul>}
  </div>;
}
