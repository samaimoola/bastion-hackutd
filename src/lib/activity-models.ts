import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
export type ActivityEvent = Database["public"]["Tables"]["incident_activity"]["Row"];
export const activityCursor = z.object({ time: z.string().datetime({ offset: true }), id: z.string().uuid() }).strict();
export const activityInput = z.object({ incidentId: z.string().uuid(), before: activityCursor.optional() }).strict();
export type ActivityChange = { field: string; before?: unknown; after?: unknown };
const labels: Record<string, string> = { title: "Title", description: "Description", severity: "Severity", response_stage: "Response stage", resource_name: "System name", data_description: "Data involved", assessment: "Assessment", data_conditions: "Data conditions", containment_status: "Containment", investigation_notes: "Investigation notes" };
function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function activityChanges(event: ActivityEvent): ActivityChange[] {
  return Object.entries(object(object(event.details)["changes"])).filter(([key]) => key in labels).map(([field, value]) => ({ field, ...object(value) }));
}
export function activityValue(value: unknown): string {
  if (typeof value === "string") return value || "None";
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").join(", ") || "None";
  return "None";
}
export const activityField = (field: string) => labels[field] ?? "Detail";
export const activityActor = (event: ActivityEvent) => event.actor_name?.trim() || `Member ${event.actor_id.slice(0, 8)}`;
export function activitySummary(event: ActivityEvent): string {
  const metadata = object(event.details);
  const member = typeof metadata["user_id"] === "string" ? `Member ${metadata["user_id"].slice(0, 8)}` : "Member";
  switch (event.event_type) {
    case "incident_created": return "Incident created";
    case "incident_updated": {
      const changes = activityChanges(event);
      const change = changes[0];
      if (changes.length === 1 && change && ["severity", "response_stage", "title"].includes(change.field)) return `${activityField(change.field)} changed from ${activityValue(change.before)} to ${activityValue(change.after)}`;
      return "Incident details updated";
    }
    case "system_created": return "Affected system added";
    case "system_updated": return "Affected system updated";
    case "member_added": return `${member} added as ${activityValue(metadata["role"])}`;
    case "member_removed": return `${member} access removed`;
    case "member_role_changed": return `${member} role changed from ${activityValue(metadata["previous_role"])} to ${activityValue(metadata["role"])}`;
    case "message_sent": return "Message sent";
    case "containment_plan_saved": return `Containment plan proposed: ${activityValue(metadata["title"])} (simulation only)`;
    default: return "Incident activity";
  }
}