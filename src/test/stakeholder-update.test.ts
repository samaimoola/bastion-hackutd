import { describe, expect, it } from "vitest";
import type { IncidentRecord } from "@/lib/incident-models";
import { latestStakeholderRecord } from "@/lib/stakeholder-update";

const record = (id: string, lastUpdate: string): IncidentRecord => ({
  id,
  lastUpdate,
  title: id,
  summary: "Saved description",
  severity: "High",
  stage: "Detection",
  declaredAt: "2026-11-07T06:42:00Z",
});

describe("latest stakeholder record", () => {
  it("selects the newest saved update regardless of list order or timezone offset", () => {
    const newest = record("newest", "2026-11-08T14:21:00Z");
    const earlier = record("earlier", "2026-11-08T08:20:00-06:00");
    expect(latestStakeholderRecord([earlier, newest])).toBe(newest);
    expect(latestStakeholderRecord([newest, earlier])).toBe(newest);
  });

  it("does not invent an update when records are empty or have invalid times", () => {
    expect(latestStakeholderRecord([])).toBeNull();
    expect(latestStakeholderRecord([record("invalid", "not a date")])).toBeNull();
  });

  it("ignores invalid timestamps and preserves the original saved summary", () => {
    const saved = record("saved", "2026-11-08T14:21:00Z");
    expect(latestStakeholderRecord([record("invalid", ""), saved])).toBe(saved);
  });
});
