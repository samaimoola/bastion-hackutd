import { describe, expect, it } from "vitest";
import { followUpPrompt, incidentIdFromPath, pageHelp } from "@/lib/page-help";

const REAL = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
describe("Help with this page (static)", () => {
  it("chooses help from the URL only", () => {
    expect(pageHelp("/dashboard", {}).key).toBe("incidents");
    expect(pageHelp("/", {}).key).toBe("welcome"); // public welcome page
    expect(pageHelp("/team", {}).key).toBe("team");
    expect(pageHelp("/guide", {}).key).toBe("guide");
    expect(pageHelp(`/incidents/${REAL}`, {}).key).toBe("live:overview");
    expect(pageHelp(`/incidents/${REAL}`, { tab: "lab" }).key).toBe("live:lab");
    expect(pageHelp("/incidents/INC-2026-0412", { tab: "tasks" }).key).toBe("demo:tasks");
    expect(pageHelp(`/incidents/${REAL}`, { tab: "nonsense" }).key).toBe("live:overview");
    expect(pageHelp("/somewhere-else", {}).key).toBe("other");
  });

  it("explains shared real-incident tasks (and when they are not set up), and demo tasks separately", () => {
    const live = pageHelp(`/incidents/${REAL}`, { tab: "tasks" });
    expect(live.purpose).toBe("Shared tasks for this incident: what needs doing, who is on it, and its status.");
    expect(live.steps.join(" ")).toMatch(/not set up yet, an administrator needs to install a database update/);
    expect(live.note).toMatch(/Viewers can read them/);
    expect(pageHelp("/incidents/INC-2026-0412", { tab: "tasks" }).steps).toContain(
      "Select Add task.",
    );
  });

  it("pre-fills a follow-up with only the page name, never identifiers or records", () => {
    const help = pageHelp(`/incidents/${REAL}`, { tab: "chat" });
    expect(followUpPrompt(help)).toBe("I'm on the Communications page. ");
    expect(followUpPrompt(help)).not.toContain(REAL);
  });

  it("finds the incident in the URL for navigation commands", () => {
    expect(incidentIdFromPath(`/incidents/${REAL}`)).toBe(REAL);
    expect(incidentIdFromPath("/team")).toBeNull();
  });
});
