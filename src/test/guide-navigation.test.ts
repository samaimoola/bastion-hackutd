import { describe, expect, it } from "vitest";
import { guideDestination, parseWorkspaceTab } from "@/lib/guide-navigation";

describe("Guide page navigation", () => {
  it.each([
    ["Open tasks", "tasks"],
    ["Take me to the timeline", "timeline"],
    ["Please open affected systems", "systems"],
    ["Go to communications", "chat"],
    ["Show me the response brief", "overview"],
  ])("opens the requested workspace tab for %s", (request, tab) => {
    expect(guideDestination(request)).toEqual({ page: "workspace", tab });
  });
  it("opens the team page", () => expect(guideDestination("Open team")).toEqual({ page: "team" }));
  it("keeps explanatory questions in chat", () =>
    expect(guideDestination("How do I add a task?")).toBeNull());
  it("does not navigate to untrusted addresses", () =>
    expect(guideDestination("Open https://example.com")).toBeNull());
  it("defaults invalid tab parameters to overview", () =>
    expect(parseWorkspaceTab("invalid")).toBe("overview"));
});
describe("Guide navigation targets after the /dashboard move", () => {
  const DEMO = "INC-2026-0412";
  it("opens the incident list at /dashboard, not the public welcome page", async () => {
    const { guideDestination, guideNavigation } = await import("@/lib/guide-navigation");
    for (const command of ["open incidents", "go to the dashboard", "take me to home"]) {
      expect(guideNavigation(guideDestination(command)!, null, DEMO)).toEqual({ to: "/dashboard" });
    }
    expect(guideNavigation(guideDestination("open team")!, null, DEMO)).toEqual({ to: "/team" });
  });
  it("opens workspace tabs on the incident on screen, or the demo incident", async () => {
    const { guideDestination, guideNavigation } = await import("@/lib/guide-navigation");
    const real = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
    expect(guideNavigation(guideDestination("open timeline")!, real, DEMO)).toEqual({
      to: "/incidents/$id",
      params: { id: real },
      search: { tab: "timeline" },
    });
    expect(guideNavigation(guideDestination("show me the lab")!, null, DEMO)).toEqual({
      to: "/incidents/$id",
      params: { id: DEMO },
      search: { tab: "lab" },
    });
  });
});
