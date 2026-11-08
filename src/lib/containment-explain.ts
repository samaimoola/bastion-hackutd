// Deterministic "Why?" explanations for Containment Lab results. Read-only over the model: this never
// changes simulate() or saved results. Each search is a breadth-first traversal that visits every
// system at most once, so it is bounded by the model size and never enumerates all paths.
import type { ContainmentModel, Edge } from "./containment-graph";

/** An example attack/access path from a suspected start to `target`, after isolating `isolated`. */
export type ReachExplanation = {
  kind: "reach";
  target: string;
  isolated: string;
  nodes: string[];
  links: Edge[];
};
/** The business-dependency chain from `target` to the isolated system (each link: from needs to). */
export type DependencyExplanation = {
  kind: "dependency";
  target: string;
  isolated: string;
  nodes: string[];
  links: Edge[];
};
export type Explanation = ReachExplanation | DependencyExplanation;

/**
 * A shortest example path through attack/access links that remain after isolation (links into or out
 * of the isolated system are removed, exactly as simulate() does). Returns null when `target` is not
 * reachable. A target that is itself a suspected start has a path of one node and no links.
 */
export function explainReachable(
  model: ContainmentModel,
  isolated: string,
  target: string,
): ReachExplanation | null {
  const kept = model.spread.filter((e) => e.from !== isolated && e.to !== isolated);
  const via = new Map<string, Edge | null>();
  const queue: string[] = [];
  for (const start of model.starts)
    if (!via.has(start)) {
      via.set(start, null);
      queue.push(start);
    }
  for (let i = 0; i < queue.length && !via.has(target); i++) {
    const current = queue[i]!;
    for (const e of kept)
      if (e.from === current && !via.has(e.to)) {
        via.set(e.to, e);
        queue.push(e.to);
      }
  }
  if (!via.has(target)) return null;
  const links: Edge[] = [];
  let node = target;
  for (let step = 0, e = via.get(node); e && step < via.size; step++, e = via.get(node)) {
    links.unshift(e);
    node = e.from;
  }
  return { kind: "reach", target, isolated, nodes: [node, ...links.map((l) => l.to)], links };
}

/**
 * The business-dependency chain that makes `target` unavailable: target needs A, A needs B, …, and the
 * last one needs the isolated system. Found by walking dependency links backwards from the isolated
 * system, matching how simulate() spreads unavailability. Returns null when `target` stays available.
 */
export function explainUnavailable(
  model: ContainmentModel,
  isolated: string,
  target: string,
): DependencyExplanation | null {
  const needs = new Map<string, Edge>();
  const seen = new Set([isolated]);
  const queue = [isolated];
  for (let i = 0; i < queue.length && !seen.has(target); i++) {
    const current = queue[i]!;
    for (const d of model.dependencies)
      if (d.to === current && !seen.has(d.from)) {
        seen.add(d.from);
        needs.set(d.from, d);
        queue.push(d.from);
      }
  }
  if (!seen.has(target)) return null;
  const links: Edge[] = [];
  let node = target;
  for (let step = 0; node !== isolated && step <= needs.size; step++) {
    const d = needs.get(node)!;
    links.push(d);
    node = d.to;
  }
  return {
    kind: "dependency",
    target,
    isolated,
    nodes: [target, ...links.map((l) => l.to)],
    links,
  };
}

export type ExplanationStep = {
  type: "start" | "attack" | "dependency" | "isolated";
  text: string;
};

/** Readable steps for an explanation. Wording states that the path is one example, not all paths. */
export function explanationText(
  model: ContainmentModel,
  exp: Explanation,
  name: (id: string) => string,
): { heading: string; steps: ExplanationStep[]; note: string } {
  const t = name(exp.target),
    iso = name(exp.isolated);
  if (exp.kind === "reach") {
    const heading = `Why can ${t} still be reached?`;
    if (exp.links.length === 0) {
      const steps: ExplanationStep[] =
        exp.target === exp.isolated
          ? [
              {
                type: "isolated",
                text: `${t} is the hypothetically isolated system and a suspected starting point. Isolating it does not undo compromise already there.`,
              },
            ]
          : [
              {
                type: "start",
                text: `${t} is a suspected starting point, so it counts as reachable without any link.`,
              },
            ];
      return {
        heading,
        steps,
        note: "Suspected starting points come from the markings in this model.",
      };
    }
    return {
      heading,
      steps: [
        { type: "start", text: `${name(exp.nodes[0]!)} is a suspected starting point.` },
        ...exp.links.map((l): ExplanationStep => ({
          type: "attack",
          text: `${name(l.from)} can reach ${name(l.to)} (attack/access link).`,
        })),
      ],
      note: `This is one example path through the current model, a shortest one. Other paths may also exist. Every link shown is still in use after hypothetically isolating ${iso}.`,
    };
  }
  const heading = `Why is ${t} unavailable?`;
  if (exp.links.length === 0) {
    return {
      heading,
      steps: [
        {
          type: "isolated",
          text: `${t} is the hypothetically isolated system itself, so it is unavailable while isolated.`,
        },
      ],
      note: "No business dependency is involved.",
    };
  }
  return {
    heading,
    steps: [
      ...exp.links.map((l): ExplanationStep => ({
        type: "dependency",
        text: `${name(l.from)} needs ${name(l.to)} to keep working (business dependency).`,
      })),
      { type: "isolated", text: `${iso} is the hypothetically isolated system.` },
    ],
    note: "This chain follows business dependencies only, not attack paths. It is one chain from the current model; others may also exist.",
  };
}
