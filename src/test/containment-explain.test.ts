// Pure tests of the deterministic "Why?" explanations against the existing simulate() results.
import { describe, expect, it } from "vitest";
import {
  demoModel,
  demoNames,
  edgeKey,
  simulate,
  type ContainmentModel,
  type Edge,
} from "@/lib/containment-graph";
import { explainReachable, explainUnavailable, explanationText } from "@/lib/containment-explain";

const d = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const name = (id: string) => demoNames[id] ?? id;
const LAPTOP = d(1),
  VPN = d(2),
  FILES = d(3),
  DC = d(4),
  PAYROLL = d(5),
  BACKUP = d(6);

/** Checks an attack path is a real chain of remaining attack/access links from a start to the target. */
function assertValidReach(model: ContainmentModel, isolated: string, target: string) {
  const exp = explainReachable(model, isolated, target)!;
  const spread = new Set(model.spread.map(edgeKey));
  expect(model.starts).toContain(exp.nodes[0]);
  expect(exp.nodes.at(-1)).toBe(target);
  expect(exp.links).toHaveLength(exp.nodes.length - 1);
  exp.links.forEach((l, i) => {
    expect(spread.has(edgeKey(l))).toBe(true); // a modeled link, never invented
    expect(l.from).not.toBe(isolated); // links touching the isolated system are cut
    expect(l.to).not.toBe(isolated);
    expect(l.from).toBe(exp.nodes[i]);
    expect(l.to).toBe(exp.nodes[i + 1]);
  });
  expect(new Set(exp.nodes).size).toBe(exp.nodes.length); // no repeated system
}

/** Checks a dependency chain runs target -> ... -> isolated using real "needs" links in that direction. */
function assertValidChain(model: ContainmentModel, isolated: string, target: string) {
  const exp = explainUnavailable(model, isolated, target)!;
  const deps = new Set(model.dependencies.map(edgeKey));
  expect(exp.nodes[0]).toBe(target);
  expect(exp.nodes.at(-1)).toBe(isolated);
  exp.links.forEach((l, i) => {
    expect(deps.has(edgeKey(l))).toBe(true);
    expect(l.from).toBe(exp.nodes[i]); // from needs to
    expect(l.to).toBe(exp.nodes[i + 1]);
  });
  expect(new Set(exp.nodes).size).toBe(exp.nodes.length);
}

describe("explainReachable", () => {
  it("laptop isolated: payroll is reached through the VPN gateway and domain controller", () => {
    const exp = explainReachable(demoModel, LAPTOP, PAYROLL)!;
    expect(exp.nodes).toEqual([VPN, DC, PAYROLL]);
    expect(exp.links).toEqual([
      { from: VPN, to: DC },
      { from: DC, to: PAYROLL },
    ]);
    assertValidReach(demoModel, LAPTOP, PAYROLL);
  });

  it("returns nothing for a system that is not reachable after isolation", () => {
    expect(simulate(demoModel, DC).reachable_after).not.toContain(PAYROLL);
    expect(explainReachable(demoModel, DC, PAYROLL)).toBeNull();
  });

  it("explains a suspected start, including an isolated start, with no links", () => {
    expect(explainReachable(demoModel, DC, VPN)).toMatchObject({ nodes: [VPN], links: [] });
    const iso = explainReachable(demoModel, LAPTOP, LAPTOP)!;
    expect(iso).toMatchObject({ nodes: [LAPTOP], links: [] });
    expect(explanationText(demoModel, iso, name).steps[0]!.type).toBe("isolated");
  });

  it("uses the nearest of several starting points, deterministically", () => {
    const model: ContainmentModel = {
      systems: [d(1), d(2), d(3), d(4)],
      spread: [
        { from: d(1), to: d(2) },
        { from: d(2), to: d(3) },
        { from: d(4), to: d(3) },
      ],
      dependencies: [],
      starts: [d(1), d(4)],
      critical: [],
    };
    const first = explainReachable(model, d(2), d(3));
    expect(first).toMatchObject({ nodes: [d(4), d(3)] }); // the d(1) route goes through the isolated d(2)
    expect(explainReachable(model, d(2), d(3))).toEqual(first);
  });

  it("terminates on attack-link cycles", () => {
    const model: ContainmentModel = {
      systems: [d(1), d(2), d(3), d(4)],
      spread: [
        { from: d(1), to: d(2) },
        { from: d(2), to: d(1) },
        { from: d(2), to: d(3) },
        { from: d(3), to: d(2) },
      ],
      dependencies: [],
      starts: [d(1)],
      critical: [],
    };
    assertValidReach(model, d(4), d(3));
    expect(explainReachable(model, d(4), d(4))).toBeNull();
  });

  it("has no explanation at all when no starting point is marked", () => {
    const model = { ...demoModel, starts: [] };
    for (const id of model.systems) expect(explainReachable(model, LAPTOP, id)).toBeNull();
  });
});

describe("explainUnavailable", () => {
  it("domain controller isolated: payroll and the VPN gateway each depend on it directly", () => {
    expect(explainUnavailable(demoModel, DC, PAYROLL)).toMatchObject({
      nodes: [PAYROLL, DC],
      links: [{ from: PAYROLL, to: DC }],
    });
    expect(explainUnavailable(demoModel, DC, VPN)).toMatchObject({
      nodes: [VPN, DC],
      links: [{ from: VPN, to: DC }],
    });
    expect(explainUnavailable(demoModel, DC, BACKUP)).toBeNull();
    expect(explainUnavailable(demoModel, DC, FILES)).toBeNull();
  });

  it("follows dependency direction: only systems that need the isolated one become unavailable", () => {
    const model: ContainmentModel = {
      systems: [d(1), d(2)],
      spread: [],
      dependencies: [{ from: d(1), to: d(2) }],
      starts: [],
      critical: [],
    };
    expect(explainUnavailable(model, d(1), d(2))).toBeNull(); // d(2) does not need d(1)
    expect(explainUnavailable(model, d(2), d(1))).toMatchObject({ nodes: [d(1), d(2)] });
  });

  it("explains transitive chains and terminates on dependency cycles", () => {
    const model: ContainmentModel = {
      systems: [d(1), d(2), d(3), d(4)],
      spread: [],
      dependencies: [
        { from: d(1), to: d(2) },
        { from: d(2), to: d(3) },
        { from: d(3), to: d(2) },
        { from: d(2), to: d(1) },
      ],
      starts: [],
      critical: [],
    };
    expect(explainUnavailable(model, d(3), d(1))).toMatchObject({ nodes: [d(1), d(2), d(3)] });
    assertValidChain(model, d(3), d(1));
    expect(explainUnavailable(model, d(3), d(4))).toBeNull();
  });

  it("describes the isolated system itself without a dependency", () => {
    const exp = explainUnavailable(demoModel, DC, DC)!;
    expect(exp).toMatchObject({ nodes: [DC], links: [] });
    expect(explanationText(demoModel, exp, name).steps).toEqual([
      {
        type: "isolated",
        text: "Domain controller is the hypothetically isolated system itself, so it is unavailable while isolated.",
      },
    ]);
  });
});

describe("agreement with simulate() on generated models", () => {
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  }
  const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  function randomModel(r: () => number): ContainmentModel {
    const n = 2 + Math.floor(r() * 8);
    const systems = Array.from({ length: n }, (_, i) => uid(i + 1));
    const edges = (p: number) => {
      const out: Edge[] = [];
      for (const a of systems)
        for (const b of systems) if (a !== b && r() < p) out.push({ from: a, to: b });
      return out;
    };
    return {
      systems,
      spread: edges(0.3),
      dependencies: edges(0.2),
      starts: systems.filter(() => r() < 0.3),
      critical: systems.filter(() => r() < 0.3),
    };
  }
  it("explains exactly the reachable and unavailable systems, with valid paths, for 150 models", () => {
    const r = rng(7);
    for (let i = 0; i < 150; i++) {
      const model = randomModel(r);
      const isolated = model.systems[Math.floor(r() * model.systems.length)]!;
      const res = simulate(model, isolated);
      for (const id of model.systems) {
        expect(explainReachable(model, isolated, id) !== null).toBe(
          res.reachable_after.includes(id),
        );
        if (res.reachable_after.includes(id)) assertValidReach(model, isolated, id);
        expect(explainUnavailable(model, isolated, id) !== null).toBe(res.offline.includes(id));
        if (res.offline.includes(id)) assertValidChain(model, isolated, id);
      }
    }
  });
});

describe("explanation wording", () => {
  it("presents a path as one example, never as every path, and labels link types", () => {
    const reach = explanationText(demoModel, explainReachable(demoModel, LAPTOP, PAYROLL)!, name);
    expect(reach.heading).toBe("Why can Payroll app still be reached?");
    expect(reach.steps.map((s) => s.type)).toEqual(["start", "attack", "attack"]);
    expect(reach.note).toMatch(/one example path/);
    expect(reach.note).toMatch(/Other paths may also exist/);
    expect(reach.note).not.toMatch(/\b(all|every|only) (possible )?paths?\b/i);
    const dep = explanationText(demoModel, explainUnavailable(demoModel, DC, PAYROLL)!, name);
    expect(dep.steps.map((s) => s.type)).toEqual(["dependency", "isolated"]);
    expect(dep.steps[0]!.text).toBe(
      "Payroll app needs Domain controller to keep working (business dependency).",
    );
    expect(dep.note).toMatch(/not attack paths/);
  });
});
