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
  it("keeps explanatory questions in chat", () => expect(guideDestination("How do I add a task?")).toBeNull());
  it("does not navigate to untrusted addresses", () => expect(guideDestination("Open https://example.com")).toBeNull());
  it("defaults invalid tab parameters to overview", () => expect(parseWorkspaceTab("invalid")).toBe("overview"));
});