import { describe, expect, it } from "vitest";
import { activityFieldValue, activitySummary, type ActivityEvent } from "@/lib/activity-models";

const event = (event_type: string, changes: Record<string, unknown>): ActivityEvent =>
  ({
    id: "e",
    incident_id: "i",
    actor_id: "a",
    actor_name: null,
    occurred_at: "2026-11-08T10:00:00Z",
    event_type,
    entity_id: "t",
    details: { changes },
  }) as unknown as ActivityEvent;

describe("task timeline wording", () => {
  it("describes task events in plain language", () => {
    expect(activitySummary(event("task_created", { title: { after: "Reset VPN" } }))).toBe(
      "Task added: Reset VPN",
    );
    expect(
      activitySummary(event("task_updated", { status: { before: "todo", after: "in_progress" } })),
    ).toBe("Task status changed from To do to In progress");
    expect(
      activitySummary(
        event("task_updated", { assignee_id: { before: "22222222-2222", after: null } }),
      ),
    ).toBe("Task unassigned");
    expect(
      activitySummary(
        event("task_updated", {
          title: { before: "A", after: "B" },
          details: { before: "", after: "x" },
        }),
      ),
    ).toBe("Task updated");
  });
  it("formats task fields readably", () => {
    expect(activityFieldValue("status", "done")).toBe("Done");
    expect(activityFieldValue("assignee_id", null)).toBe("Unassigned");
    expect(activityFieldValue("assignee_id", "22222222-2222-2222-2222-222222222222")).toBe(
      "Member 22222222",
    );
    expect(activityFieldValue("title", "Plain")).toBe("Plain");
  });
});
