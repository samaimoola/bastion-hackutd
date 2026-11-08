import { describe, expect, it } from "vitest";
import { assumptions, demoModel, demoNames, pruneModel, simulate, type ContainmentModel } from "@/lib/containment-graph";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const name = (ids: string[]) => ids.map((x) => demoNames[x]);

describe("Containment Lab graph calculation", () => {
  it("isolating the phished laptop cuts the file server but leaves the VPN path to payroll and backups", () => {
    const r = simulate(demoModel, id(1));
    expect(name(r.newly_unreachable)).toEqual(["File server"]);
    expect(name(r.critical_reachable_after)).toEqual(["Payroll app", "Backup server"]);
    expect(r.critical_offline).toEqual([]);
    expect(r.reachable_after).toContain(id(1)); // a start stays compromised
  });
  it("isolating the domain controller cuts payroll but takes payroll and VPN offline via dependencies", () => {
    const r = simulate(demoModel, id(4));
    expect(name(r.newly_unreachable)).toEqual(["Domain controller", "Payroll app"]);
    expect(name(r.offline).sort()).toEqual(["Domain controller", "Payroll app", "VPN gateway"]);
    expect(name(r.critical_offline)).toEqual(["Payroll app"]);
    expect(name(r.critical_reachable_after)).toEqual(["Backup server"]);
    expect(r.remaining_paths).toEqual([{ from: id(1), to: id(3) }, { from: id(3), to: id(6) }]);
  });
  it("spread links alone never cause business outages", () => {
    const model: ContainmentModel = { ...demoModel, dependencies: [] };
    expect(simulate(model, id(4)).offline).toEqual([id(4)]);
  });
  it("handles cycles and no starting points deterministically", () => {
    const model: ContainmentModel = { systems: [id(1), id(2), id(3)], spread: [{ from: id(1), to: id(2) }, { from: id(2), to: id(1) }, { from: id(2), to: id(3) }], dependencies: [], starts: [], critical: [] };
    expect(simulate(model, id(2)).baseline_reachable).toEqual([]);
    const started = simulate({ ...model, starts: [id(1)] }, id(2));
    expect(started.newly_unreachable).toEqual([id(2), id(3)]);
    expect(started.interrupted_paths).toHaveLength(2);
    expect(assumptions(model).some((a) => a.includes("No suspected starting point"))).toBe(true);
  });
  it("removing a system drops its links, starts and critical marks", () => {
    const pruned = pruneModel({ ...demoModel, systems: demoModel.systems.filter((s) => s !== id(1)) });
    expect(pruned.starts).toEqual([id(2)]);
    expect(pruned.spread.some((e) => e.from === id(1) || e.to === id(1))).toBe(false);
  });
});
