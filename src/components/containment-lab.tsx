import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, Plus, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { affectedOptions } from "@/lib/affected-system-queries";
import { incidentMembershipOptions } from "@/lib/incident-queries";
import { canEditIncident } from "@/lib/incident-models";
import { labKey, labOptions } from "@/lib/containment-queries";
import { saveContainmentModel, saveContainmentPlan } from "@/lib/containment.functions";
import { assumptions, demoActions, demoModel, demoNames, edgeKey, emptyModel, MAX_EDGES, MAX_SYSTEMS, planTitleSchema, pruneModel, simulate, type ContainmentModel, type ContainmentResults, type Edge } from "@/lib/containment-graph";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const time = (value: string) => `${new Date(value).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`;
type Names = (id: string) => string;

export function ContainmentLab({ incidentId, userId }: { incidentId: string; userId: string }) {
  const [sandbox, setSandbox] = useState(false);
  return <section className="py-6">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <h2 className="text-xl font-medium">Containment Lab</h2>
        <p className="mt-2 text-sm text-muted-foreground">Compare “what if we isolate this system?” before acting. This is a simulation only: it never disconnects systems, runs commands or changes containment status.</p>
      </div>
      <Button variant={sandbox ? "default" : "outline"} onClick={() => setSandbox(!sandbox)}><FlaskConical className="size-4" />{sandbox ? "Back to this incident" : "Try synthetic example"}</Button>
    </header>
    {sandbox ? <SandboxLab /> : <RealLab incidentId={incidentId} userId={userId} />}
  </section>;
}

function SandboxLab() {
  const [model, setModel] = useState<ContainmentModel>(demoModel);
  const [isolated, setIsolated] = useState(demoActions[0]!);
  const names: Names = (id) => demoNames[id] ?? "Unknown system";
  return <div className="space-y-8">
    <p role="note" className="rounded-md border border-border bg-muted px-4 py-3 text-sm"><strong>Synthetic example.</strong> Fictional systems kept only in this browser tab. Nothing is saved or added to the incident. Compare isolating the phished laptop with isolating the domain controller.</p>
    <div className="flex flex-wrap gap-2">{demoActions.map((id) => <Button key={id} size="sm" variant={isolated === id ? "default" : "outline"} onClick={() => setIsolated(id)}>Isolate {names(id)}</Button>)}<Button size="sm" variant="ghost" onClick={() => { setModel(demoModel); setIsolated(demoActions[0]!); }}>Reset example</Button></div>
    <LabBody model={model} setModel={setModel} options={Object.keys(demoNames)} names={names} isolated={isolated} setIsolated={setIsolated} editable />
  </div>;
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
      : <LabBody model={draft} setModel={(m) => { setDraft(m); setDirty(true); }} options={options} names={names} isolated={isolated} setIsolated={setIsolated} editable={allowed && !busy} />}
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

function LabBody({ model, setModel, options, names, isolated, setIsolated, editable }: { model: ContainmentModel; setModel: (m: ContainmentModel) => void; options: string[]; names: Names; isolated: string; setIsolated: (id: string) => void; editable: boolean }) {
  const results = isolated && model.systems.includes(isolated) ? simulate(model, isolated) : null;
  return <div className="space-y-8">
    <ModelEditor model={model} setModel={setModel} options={options} names={names} editable={editable} />
    <div className="max-w-md space-y-2">
      <Label htmlFor="isolate-pick">System to hypothetically isolate</Label>
      <Select value={isolated || undefined} onValueChange={setIsolated} disabled={model.systems.length === 0}>
        <SelectTrigger id="isolate-pick"><SelectValue placeholder="Choose one modeled system" /></SelectTrigger>
        <SelectContent>{model.systems.map((id) => <SelectItem key={id} value={id}>{names(id)}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <Graph model={model} names={names} results={results} />
    {results ? <Comparison model={model} results={results} names={names} /> : <p className="text-sm text-muted-foreground">Choose a system to isolate to see the before and after comparison.</p>}
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
        <Select value={from || undefined} onValueChange={setFrom}><SelectTrigger aria-label="From system"><SelectValue placeholder="From (A)" /></SelectTrigger><SelectContent>{model.systems.map((id) => <SelectItem key={id} value={id}>{names(id)}</SelectItem>)}</SelectContent></Select>
        <Select value={to || undefined} onValueChange={setTo}><SelectTrigger aria-label="To system"><SelectValue placeholder="To (B)" /></SelectTrigger><SelectContent>{model.systems.map((id) => <SelectItem key={id} value={id}>{names(id)}</SelectItem>)}</SelectContent></Select>
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

function Graph({ model, names, results }: { model: ContainmentModel; names: Names; results: ContainmentResults | null }) {
  const n = model.systems.length;
  if (n === 0) return null;
  const W = 640, H = 380, R = Math.min(150, 40 + n * 18);
  const pos = new Map(model.systems.map((id, i) => [id, { x: W / 2 + R * 1.4 * Math.cos((2 * Math.PI * i) / n - Math.PI / 2), y: H / 2 + R * Math.sin((2 * Math.PI * i) / n - Math.PI / 2) }]));
  const remaining = new Set(results?.remaining_paths.map(edgeKey));
  const interrupted = new Set(results?.interrupted_paths.map(edgeKey));
  const offline = new Set(results?.offline); const unreachable = new Set(results?.newly_unreachable); const reachable = new Set(results ? results.reachable_after : simulate(model, "").baseline_reachable);
  const line = (e: Edge, cls: string, marker: string, dash?: string) => {
    const a = pos.get(e.from)!, b = pos.get(e.to)!; const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1; const k = 24 / len;
    return <line key={`${marker}${edgeKey(e)}`} x1={a.x + dx * k} y1={a.y + dy * k} x2={b.x - dx * k} y2={b.y - dy * k} className={cls} strokeWidth={2} strokeDasharray={dash} markerEnd={`url(#${marker})`} />;
  };
  return <figure className="rounded-lg border border-border bg-card p-3">
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Containment model graph. The lists below describe the same information.">
      <defs>{["arrow-muted", "arrow-primary", "arrow-destructive"].map((m) => <marker key={m} id={m} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className={m === "arrow-primary" ? "fill-primary" : m === "arrow-destructive" ? "fill-destructive" : "fill-muted-foreground"} /></marker>)}</defs>
      {model.dependencies.map((e) => line(e, "stroke-muted-foreground/50", "arrow-muted", "2 5"))}
      {model.spread.map((e) => { const k = edgeKey(e); return results && interrupted.has(k) ? line(e, "stroke-destructive", "arrow-destructive", "7 5") : results && remaining.has(k) ? line(e, "stroke-primary", "arrow-primary") : line(e, "stroke-muted-foreground", "arrow-muted"); })}
      {model.systems.map((id) => { const p = pos.get(id)!; const isIso = results?.isolated === id; const crit = model.critical.includes(id);
        const fill = isIso ? "fill-accent" : offline.has(id) ? "fill-muted" : reachable.has(id) ? "fill-destructive/20" : "fill-card";
        return <g key={id}>
          <circle cx={p.x} cy={p.y} r={20} className={`${fill} ${isIso ? "stroke-primary" : crit ? "stroke-warning" : "stroke-border"}`} strokeWidth={isIso ? 4 : crit ? 3 : 1.5} strokeDasharray={offline.has(id) && !isIso ? "4 3" : undefined} />
          <text x={p.x} y={p.y + 4} textAnchor="middle" className="fill-foreground text-[11px] font-medium">{model.starts.includes(id) ? "S" : crit ? "!" : ""}</text>
          <text x={p.x} y={p.y + 38} textAnchor="middle" className="fill-foreground text-[12px]">{names(id).slice(0, 26)}</text>
          {unreachable.has(id) && <text x={p.x} y={p.y + 52} textAnchor="middle" className="fill-primary text-[10px]">no longer reachable</text>}
        </g>; })}
    </svg>
    <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>S = suspected start</span><span>! / amber ring = business-critical</span><span>Thick ring = isolated</span><span>Tinted = reachable</span><span>Dashed circle = offline</span><span>Solid line = remaining path</span><span>Red dashed line = interrupted path</span><span>Dotted line = business dependency</span>
    </figcaption>
  </figure>;
}

function NameList({ ids, names, empty }: { ids: string[]; names: Names; empty: string }) {
  return ids.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="list-disc space-y-1 pl-5 text-sm">{ids.map((id) => <li key={id}>{names(id)}</li>)}</ul>;
}
function Comparison({ model, results, names }: { model: ContainmentModel; results: ContainmentResults; names: Names }) {
  const path = (e: Edge) => `${names(e.from)} → ${names(e.to)}`;
  return <div className="space-y-4">
    <h3 className="text-base font-medium">Before and after isolating {names(results.isolated)}</h3>
    {model.starts.includes(results.isolated) && <p className="text-sm text-muted-foreground">This system is a suspected starting point. It still counts as reachable because isolating it does not undo compromise already there.</p>}
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2"><h4 className="text-sm font-medium">Reachable before ({results.baseline_reachable.length})</h4><NameList ids={results.baseline_reachable} names={names} empty="Nothing is reachable from the starting points." /></div>
      <div className="space-y-2"><h4 className="text-sm font-medium">Reachable after ({results.reachable_after.length})</h4><NameList ids={results.reachable_after} names={names} empty="Nothing is reachable from the starting points." /></div>
      <div className="space-y-2"><h4 className="text-sm font-medium"><Badge variant="info">Cut off</Badge> No longer reachable</h4><NameList ids={results.newly_unreachable} names={names} empty="No previously reachable system is cut off by this isolation." /></div>
      <div className="space-y-2"><h4 className="text-sm font-medium"><Badge variant="neutral">Offline</Badge> Taken offline by this isolation</h4><NameList ids={results.offline} names={names} empty="None." />
        <p className="pt-1 text-sm"><strong>Business-critical offline:</strong> {results.critical_offline.length ? results.critical_offline.map(names).join(", ") : "none in this model"}</p>
        <p className="text-sm"><strong>Business-critical still reachable:</strong> {results.critical_reachable_after.length ? results.critical_reachable_after.map(names).join(", ") : "none in this model"}</p></div>
      <div className="space-y-2"><h4 className="text-sm font-medium">Paths that remain ({results.remaining_paths.length})</h4>{results.remaining_paths.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{results.remaining_paths.map((e) => <li key={edgeKey(e)}>{path(e)}</li>)}</ul> : <p className="text-sm text-muted-foreground">No modeled path remains in use.</p>}</div>
      <div className="space-y-2"><h4 className="text-sm font-medium">Paths interrupted ({results.interrupted_paths.length})</h4>{results.interrupted_paths.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{results.interrupted_paths.map((e) => <li key={edgeKey(e)}>{path(e)}</li>)}</ul> : <p className="text-sm text-muted-foreground">No modeled path is interrupted.</p>}</div>
    </div>
  </div>;
}
function Assumptions({ model }: { model: ContainmentModel }) {
  return <div className="rounded-md border border-border p-4"><h3 className="text-sm font-medium">Assumptions and missing information</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{assumptions(model).map((a) => <li key={a}>{a}</li>)}</ul><p className="mt-2 text-xs text-muted-foreground">This compares models only. It does not estimate likelihood, cost, or whether the incident is actually contained.</p></div>;
}
function SavedPlans({ plans, names }: { plans: { id: string; title: string; isolated_system_id: string; results: ContainmentResults; created_by: string; author_name: string | null; created_at: string }[]; names: Names }) {
  return <div className="border-t border-border pt-6">
    <h3 className="text-base font-medium">Saved proposed plans</h3>
    {plans.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No plans saved yet. Saved plans are proposals only and do not change any real system.</p> : <ul className="mt-3 divide-y divide-border border-y border-border">{plans.map((p) => <li key={p.id} className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h4 className="break-words font-medium">{p.title}</h4><span className="text-xs text-muted-foreground">{p.author_name?.trim() || `Member ${p.created_by.slice(0, 8)}`} · {time(p.created_at)}</span></div>
      <p className="mt-1 text-sm">Proposed isolation: <strong>{names(p.isolated_system_id)}</strong></p>
      <p className="mt-1 text-sm text-muted-foreground">Cuts off {p.results.newly_unreachable.length} system(s) · {p.results.interrupted_paths.length} path(s) interrupted · {p.results.remaining_paths.length} remain · critical offline: {p.results.critical_offline.length ? p.results.critical_offline.map(names).join(", ") : "none"}</p>
    </li>)}</ul>}
  </div>;
}
