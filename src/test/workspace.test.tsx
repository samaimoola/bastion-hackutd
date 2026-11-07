import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DemoProvider, useDemo } from "@/lib/demo-store";
import { workspaceStats, responseBrief } from "@/lib/workspace-api";
import { eventInput, timelineInputSchema } from "@/lib/workspace-models";

describe("Workspace records", () => {
  it("derives affected-system counts and excludes completed urgent tasks", () => {
    const { result } = renderHook(() => useDemo(), { wrapper: DemoProvider });
    const stats = workspaceStats(result.current.systems, result.current.tasks);
    expect(stats.affected).toHaveLength(5);
    expect(stats.open).toHaveLength(4);
    expect(stats.urgent.some((task) => task.id === "t3")).toBe(false);
    expect(stats.urgent.some((task) => task.id === "t5")).toBe(true);
  });
  it("rejects blank updates", () => {
    expect(() => eventInput("   ", "Finding", "2026-11-07T06:00")).toThrow();
  });
  it("rejects event times in the future", () => {
    expect(timelineInputSchema.safeParse({ text: "Finding", type: "Finding", at: new Date(Date.now() + 3600000).toISOString() }).success).toBe(false);
  });
  it("keeps event and recorded times separate and adds decisions to the brief", () => {
    const { result } = renderHook(() => useDemo(), { wrapper: DemoProvider });
    act(() => { result.current.recordEvent(eventInput("Hold restore pending validation", "Decision", "2026-11-07T06:00"), "Test responder"); });
    const entry = result.current.timeline.at(-1);
    expect(entry?.at).toBe("2026-11-07T06:00:00.000Z");
    expect(entry?.recordedAt).not.toBe(entry?.at);
    expect(entry?.author).toBe("Test responder");
    expect(responseBrief(result.current.incident, result.current.systems, result.current.tasks, result.current.timeline).decisions).toContain("Hold restore pending validation");
  });
});