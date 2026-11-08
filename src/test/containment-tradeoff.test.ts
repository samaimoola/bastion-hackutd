// Pure, deterministic tests of the synthetic sandbox scenario and its plain-language tradeoff.
// No database, network or AI calls.
import { describe, expect, it } from "vitest";
import {
  demoActions,
  demoModel,
  demoNames,
  explainTradeoff,
  MEASURES_NOTE,
  offlineReasons,
  simulate,
  type ContainmentModel,
} from "@/lib/containment-graph";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const name = (x: string) => demoNames[x] ?? x;
const LAPTOP = id(1),
  VPN = id(2),
  DC = id(4),
  PAYROLL = id(5),
  BACKUP = id(6);

describe("synthetic scenario: the two example choices have different tradeoffs", () => {
  it("offers exactly the laptop and the domain controller as example choices", () => {
    expect(demoActions).toEqual([LAPTOP, DC]);
    expect(demoModel.starts).toEqual([LAPTOP, VPN]);
    expect(demoModel.critical).toEqual([PAYROLL, BACKUP]);
  });

  it("laptop: no business cost, but both critical systems stay reachable", () => {
    const r = simulate(demoModel, LAPTOP);
    expect(r.critical_offline).toEqual([]);
    expect(r.critical_reachable_after).toEqual([PAYROLL, BACKUP]);
  });

  it("domain controller: protects payroll from attack paths but payroll and VPN become unavailable", () => {
    const r = simulate(demoModel, DC);
    expect(r.newly_unreachable).toContain(PAYROLL);
    expect(r.critical_offline).toEqual([PAYROLL]);
    expect(r.critical_reachable_after).toEqual([BACKUP]);
    expect(r.offline).toContain(VPN);
  });
});

describe("explainTradeoff", () => {
  it("laptop: says what is cut, what stays exposed, and that nothing else goes down", () => {
    const t = explainTradeoff(demoModel, simulate(demoModel, LAPTOP), name);
    expect(t.summary).toBe(
      "In this model, isolating Phished laptop (finance) stops the modeled attack paths from reaching 1 other system and makes 0 business-critical services unavailable. 2 business-critical systems can still be reached.",
    );
    expect(t.otherUnreachable).toEqual([id(3)]);
    expect(t.otherUnreachableText).toBe("Modeled attack paths no longer reach File server.");
    expect(t.isolatedNote).toContain(
      "is a suspected starting point, so it still counts as reachable",
    );
    expect(t.exposure).toBe(
      "Business-critical Payroll app, Backup server can still be reached through 3 remaining modeled paths.",
    );
    expect(t.businessCost).toEqual([
      "Phished laptop (finance) is unavailable while it is isolated.",
      "No modeled business service depends on Phished laptop (finance), so nothing else becomes unavailable.",
    ]);
    expect(t.unavailableButReachable).toEqual([]);
  });

  it("domain controller: counts the isolated system separately from other cut-off systems", () => {
    const r = simulate(demoModel, DC);
    // The calculation itself is unchanged: the domain controller is in newly_unreachable.
    expect(r.newly_unreachable).toEqual([DC, PAYROLL]);
    const t = explainTradeoff(demoModel, r, name);
    expect(t.otherUnreachable).toEqual([PAYROLL]);
    expect(t.summary).toMatch(
      /^In this model, isolating Domain controller stops the modeled attack paths from reaching 1 other system and makes 1 business-critical service unavailable\./,
    );
    expect(t.isolatedNote).toBe(
      "Domain controller itself is no longer reachable from the suspected starting points.",
    );
    expect(t.otherUnreachableText).toBe(
      "Modeled attack paths no longer reach Payroll app, including business-critical Payroll app.",
    );
    expect(t.businessCost).toEqual([
      "VPN gateway becomes unavailable because it depends on Domain controller.",
      "Domain controller is unavailable while it is isolated.",
      "Payroll app (business-critical) becomes unavailable because it depends on Domain controller.",
    ]);
  });

  it("explains, without changing the result, that a system can be unavailable and still reachable", () => {
    const r = simulate(demoModel, DC);
    // VPN gateway is a suspected start (so it stays reachable) and needs the domain controller.
    expect(r.offline).toContain(VPN);
    expect(r.reachable_after).toContain(VPN);
    const t = explainTradeoff(demoModel, r, name);
    expect(t.unavailableButReachable).toEqual([VPN]);
    expect(t.unavailableButReachableText).toBe(
      "VPN gateway (a suspected starting point) is unavailable but still reachable. It stops working because of a business dependency, but the model still counts it as reachable from the attack paths.",
    );
    expect(MEASURES_NOTE).toMatch(/different measures/);
  });

  it("business outages come only from dependency links, never from attack/access links", () => {
    const noDeps: ContainmentModel = { ...demoModel, dependencies: [] };
    const r = simulate(noDeps, DC);
    expect(r.offline).toEqual([DC]);
    expect(r.critical_offline).toEqual([]);
    expect(explainTradeoff(noDeps, r, name).businessCost).toHaveLength(2);
    // Removing every attack link changes nothing about outages.
    const noSpread: ContainmentModel = { ...demoModel, spread: [] };
    expect(simulate(noSpread, DC).offline).toEqual(simulate(demoModel, DC).offline);
  });

  it("explains transitive outages through the intermediate dependency", () => {
    const [a, b, c] = [id(1), id(2), id(3)];
    const model: ContainmentModel = {
      systems: [a, b, c],
      spread: [],
      dependencies: [
        { from: a, to: b },
        { from: b, to: c },
      ],
      starts: [],
      critical: [a],
    };
    const r = simulate(model, c);
    expect(offlineReasons(model, r)).toEqual([
      { id: a, dependsOn: b },
      { id: b, dependsOn: c },
      { id: c, dependsOn: null },
    ]);
    expect(
      explainTradeoff(model, r, (x) => ({ [a]: "A", [b]: "B", [c]: "C" })[x]!).businessCost[0],
    ).toBe(
      "A (business-critical) becomes unavailable because it depends on B, which is unavailable.",
    );
  });

  it("is deterministic and makes no probability, cost or guarantee claims", () => {
    for (const choice of demoModel.systems) {
      const first = explainTradeoff(demoModel, simulate(demoModel, choice), name);
      expect(explainTradeoff(demoModel, simulate(demoModel, choice), name)).toEqual(first);
      const text = [
        first.summary,
        first.isolatedNote,
        first.otherUnreachableText,
        first.exposure,
        first.unavailableButReachableText ?? "",
        ...first.businessCost,
      ].join(" ");
      expect(text).not.toMatch(/%|\$|probab|likel|chance|guarantee|safe|secure|risk score|loss/i);
    }
  });
});
