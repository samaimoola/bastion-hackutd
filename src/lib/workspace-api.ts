import { useDemo, type Incident, type System, type Task } from "@/lib/demo-store";
import { timelineInputSchema, type TimelineEntry, type TimelineInput } from "@/lib/workspace-models";

// Frontend adapter contract. Live adapters must implement it explicitly; errors never select demo mode.
export interface WorkspaceApi {
  mode: "demo" | "live";
  recordEvent: (input: TimelineInput) => Promise<TimelineEntry>;
}

export function useWorkspace() {
  const store = useDemo();
  const api: WorkspaceApi = {
    mode: "demo",
    recordEvent: async (input) => store.recordEvent(timelineInputSchema.parse(input), "Signed-in user (demo log)"),
  };
  return { ...store, api, connection: "Demo mode · live feed not connected" as const };
}

export function workspaceStats(systems: System[], tasks: Task[]) {
  const affected = systems.filter((system) => system.status !== "Unaffected");
  const open = tasks.filter((task) => task.status !== "Done");
  // Until priorities are added, urgent means blocked or overdue, never inferred from a role.
  const urgent = open.filter((task) => task.status === "Blocked" || new Date(task.due).getTime() < Date.now());
  return { affected, open, urgent };
}

export function responseBrief(incident: Incident, systems: System[], tasks: Task[], timeline: TimelineEntry[]) {
  const { affected, open } = workspaceStats(systems, tasks);
  return {
    impact: `${incident.impact} ${affected.length} affected systems; ${systems.filter((system) => system.status === "Encrypted").length} recorded as encrypted in demo records.`,
    facts: timeline.filter((entry) => entry.type === "Finding").map((entry) => entry.text),
    unknowns: ["Exfiltration has not been assessed in these records.", ...systems.filter((system) => system.status === "Under review").map((system) => `${system.name}: assessment pending.`)],
    decisions: [...timeline].filter((entry) => entry.type === "Decision").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3).map((entry) => entry.text),
    nextActions: [...incident.nextActions, ...open.map((task) => task.title)],
  };
}