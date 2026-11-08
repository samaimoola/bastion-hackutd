import { z } from "zod";

/**
 * Containment Lab model. Deterministic, mirrors private.containment_results in the database.
 * - spread {from,to}: someone with access to "from" could reach "to" (directed).
 * - dependencies {from,to}: "from" needs "to" to keep operating (directed).
 * Isolating X removes every spread link into or out of X, and takes X plus every
 * system that (transitively) depends on X offline. Spread links never imply outages.
 */
export type Edge = { from: string; to: string };
export type ContainmentModel = { systems: string[]; spread: Edge[]; dependencies: Edge[]; starts: string[]; critical: string[] };
export type ContainmentResults = {
  isolated: string;
  baseline_reachable: string[];
  reachable_after: string[];
  newly_unreachable: string[];
  remaining_paths: Edge[];
  interrupted_paths: Edge[];
  offline: string[];
  critical_offline: string[];
  critical_reachable_after: string[];
};

export const MAX_SYSTEMS = 25;
export const MAX_EDGES = 60;
const id = z.string().uuid();
const edge = z.object({ from: id, to: id }).strict();
export const modelSchema = z.object({
  systems: z.array(id).max(MAX_SYSTEMS), spread: z.array(edge).max(MAX_EDGES), dependencies: z.array(edge).max(MAX_EDGES),
  starts: z.array(id).max(MAX_SYSTEMS), critical: z.array(id).max(MAX_SYSTEMS),
}).strict();
export const planTitleSchema = z.string().trim().min(1, "Give the plan a name.").max(200, "Plan names can be up to 200 characters.");

export const emptyModel = (): ContainmentModel => ({ systems: [], spread: [], dependencies: [], starts: [], critical: [] });
const sortIds = (values: Iterable<string>) => [...new Set(values)].sort();
const sortEdges = (edges: Edge[]) => [...edges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
export const edgeKey = (e: Edge) => `${e.from}>${e.to}`;

function reach(starts: string[], edges: Edge[]): Set<string> {
  const seen = new Set(starts);
  const queue = [...starts];
  while (queue.length) {
    const current = queue.shift()!;
    for (const e of edges) if (e.from === current && !seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
  }
  return seen;
}

/** Keeps only references to modeled systems so removed systems never leave dangling links. */
export function pruneModel(model: ContainmentModel): ContainmentModel {
  const set = new Set(model.systems);
  const ok = (e: Edge) => set.has(e.from) && set.has(e.to) && e.from !== e.to;
  return { systems: model.systems, spread: model.spread.filter(ok), dependencies: model.dependencies.filter(ok), starts: model.starts.filter((s) => set.has(s)), critical: model.critical.filter((s) => set.has(s)) };
}

export function simulate(model: ContainmentModel, isolated: string): ContainmentResults {
  const base = reach(model.starts, model.spread);
  const kept = model.spread.filter((e) => e.from !== isolated && e.to !== isolated);
  const after = reach(model.starts, kept);
  const offline = new Set([isolated]);
  let grew = true;
  while (grew) { grew = false; for (const d of model.dependencies) if (offline.has(d.to) && !offline.has(d.from)) { offline.add(d.from); grew = true; } }
  const remaining = kept.filter((e) => after.has(e.from));
  const remainingKeys = new Set(remaining.map(edgeKey));
  const critical = new Set(model.critical);
  return {
    isolated,
    baseline_reachable: sortIds(base),
    reachable_after: sortIds(after),
    newly_unreachable: sortIds([...base].filter((s) => !after.has(s))),
    remaining_paths: sortEdges(remaining),
    interrupted_paths: sortEdges(model.spread.filter((e) => base.has(e.from) && !remainingKeys.has(edgeKey(e)))),
    offline: sortIds(offline),
    critical_offline: sortIds([...offline].filter((s) => critical.has(s))),
    critical_reachable_after: sortIds([...after].filter((s) => critical.has(s))),
  };
}

/** Why each offline system is offline: the isolated system itself, or the dependency it relies on. */
export function offlineReasons(model: ContainmentModel, results: ContainmentResults): { id: string; dependsOn: string | null }[] {
  const offline = new Set(results.offline);
  return results.offline.map((id) => {
    if (id === results.isolated) return { id, dependsOn: null };
    const via = model.dependencies.filter((e) => e.from === id && offline.has(e.to)).map((e) => e.to).sort();
    return { id, dependsOn: via[0] ?? null };
  });
}

export type Tradeoff = {
  /** One-sentence overview. Counts other systems separately from the isolated one. */
  summary: string;
  /** What happens to the isolated system itself in reachability terms. */
  isolatedNote: string;
  /** Previously reachable systems, other than the isolated one, that attack paths no longer reach. */
  otherUnreachable: string[];
  otherUnreachableText: string;
  exposure: string;
  businessCost: string[];
  /** Systems (other than the isolated one) that are unavailable yet still reachable. */
  unavailableButReachable: string[];
  unavailableButReachableText: string | null;
};
const list = (ids: string[], name: (id: string) => string) => ids.map(name).join(", ");
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Explains why availability and reachability can disagree; shown with every simulation. */
export const MEASURES_NOTE =
  "Attacker reachability and business-service availability are different measures. Reachability follows attack/access links from the suspected starting points. Availability follows business-dependency links from the isolated system. The model does not assume that a system which stops working also stops being reachable, so a system can be unavailable and still reachable.";

/**
 * Deterministic plain-language tradeoff for one hypothetical isolation. Wording only: it reads the
 * existing simulate() results and never recalculates them. Attack-path effects come only from
 * spread links; business effects come only from dependency links. No likelihoods, costs or
 * guarantees are stated.
 */
export function explainTradeoff(model: ContainmentModel, results: ContainmentResults, name: (id: string) => string): Tradeoff {
  const iso = name(results.isolated);
  const critical = new Set(model.critical);
  const isStart = model.starts.includes(results.isolated);
  const other = results.newly_unreachable.filter((id) => id !== results.isolated);
  const otherCritical = other.filter((id) => critical.has(id));
  const unavailable = results.critical_offline;
  const stillReachable = results.critical_reachable_after;

  const summary = `In this model, isolating ${iso} stops the modeled attack paths from reaching ${count(other.length, "other system")} and makes ${count(unavailable.length, "business-critical service")} unavailable.${stillReachable.length ? ` ${count(stillReachable.length, "business-critical system")} can still be reached.` : ""}`;

  const isolatedNote = isStart
    ? `${iso} is a suspected starting point, so it still counts as reachable: isolating it does not undo compromise already there.`
    : results.newly_unreachable.includes(results.isolated)
      ? `${iso} itself is no longer reachable from the suspected starting points.`
      : `${iso} was not reachable from the suspected starting points before isolation.`;

  const otherUnreachableText = other.length === 0
    ? "No other system that the modeled attack paths reached before is cut off."
    : `Modeled attack paths no longer reach ${list(other, name)}${otherCritical.length ? `, including business-critical ${list(otherCritical, name)}` : ""}.`;

  const exposure = stillReachable.length
    ? `Business-critical ${list(stillReachable, name)} can still be reached through ${count(results.remaining_paths.length, "remaining modeled path")}.`
    : results.remaining_paths.length
      ? `${count(results.remaining_paths.length, "modeled path")} remain, but none reaches a business-critical system.`
      : "No modeled attack path remains in use.";

  const businessCost = offlineReasons(model, results).map(({ id, dependsOn }) => {
    const label = `${name(id)}${critical.has(id) ? " (business-critical)" : ""}`;
    if (dependsOn === null) return `${label} is unavailable while it is isolated.`;
    return `${label} becomes unavailable because it depends on ${name(dependsOn)}${dependsOn === results.isolated ? "" : ", which is unavailable"}.`;
  });
  if (results.offline.length === 1) businessCost.push(`No modeled business service depends on ${iso}, so nothing else becomes unavailable.`);

  const reachableAfter = new Set(results.reachable_after);
  const both = results.offline.filter((id) => id !== results.isolated && reachableAfter.has(id));
  const unavailableButReachableText = both.length === 0 ? null
    : `${both.map((id) => `${name(id)}${model.starts.includes(id) ? " (a suspected starting point)" : ""}`).join(", ")} ${both.length === 1 ? "is" : "are"} unavailable but still reachable. It stops working because of a business dependency, but the model still counts it as reachable from the attack paths.`;

  return { summary, isolatedNote, otherUnreachable: other, otherUnreachableText, exposure, businessCost, unavailableButReachable: both, unavailableButReachableText };
}

/** Plain-language gaps in the supplied model. These are limitations, not findings. */
export function assumptions(model: ContainmentModel): string[] {
  const notes = [
    "Results describe only the systems and links entered here. Unrecorded connections, credentials or backups are not considered.",
    "Isolation is treated as fully cutting every modeled spread link into and out of the chosen system. A real isolation may be incomplete.",
    "Systems already compromised before isolation are not cleaned up by isolating something else.",
  ];
  if (model.starts.length === 0) notes.push("No suspected starting point is marked, so nothing is treated as reachable.");
  if (model.spread.length === 0) notes.push("No spread or access links are modeled.");
  if (model.dependencies.length === 0) notes.push("No business dependencies are modeled, so only the isolated system itself is counted as offline.");
  if (model.critical.length === 0) notes.push("No systems are marked business-critical.");
  const linked = new Set([...model.spread, ...model.dependencies].flatMap((e) => [e.from, e.to]));
  const lonely = model.systems.filter((s) => !linked.has(s)).length;
  if (lonely > 0) notes.push(`${lonely} modeled system${lonely === 1 ? " has" : "s have"} no links at all.`);
  return notes;
}

/** Synthetic sandbox only. Never written to a real incident. */
export const demoNames: Record<string, string> = {
  "00000000-0000-4000-8000-000000000001": "Phished laptop (finance)",
  "00000000-0000-4000-8000-000000000002": "VPN gateway",
  "00000000-0000-4000-8000-000000000003": "File server",
  "00000000-0000-4000-8000-000000000004": "Domain controller",
  "00000000-0000-4000-8000-000000000005": "Payroll app",
  "00000000-0000-4000-8000-000000000006": "Backup server",
};
const d = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
export const demoModel: ContainmentModel = {
  systems: Object.keys(demoNames),
  spread: [{ from: d(1), to: d(3) }, { from: d(1), to: d(4) }, { from: d(2), to: d(4) }, { from: d(4), to: d(5) }, { from: d(4), to: d(6) }, { from: d(3), to: d(6) }],
  dependencies: [{ from: d(5), to: d(4) }, { from: d(2), to: d(4) }, { from: d(5), to: d(3) }],
  starts: [d(1), d(2)],
  critical: [d(5), d(6)],
};
/** Two candidate actions with different tradeoffs: isolating the laptop vs. the domain controller. */
export const demoActions = [d(1), d(4)];
