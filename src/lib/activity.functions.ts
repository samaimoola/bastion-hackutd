import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activityInput } from "./activity-models";

export const listIncidentActivity = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator(activityInput)
  .handler(async ({ data, context }) => {
    const { data: incident, error: accessError } = await context.supabase.from("incidents").select("id").eq("id", data.incidentId).maybeSingle();
    if (accessError || !incident) throw new Error("This incident is unavailable or you no longer have access.");
    let query = context.supabase.from("incident_activity").select("id,incident_id,actor_id,actor_name,occurred_at,event_type,entity_id,details").eq("incident_id", data.incidentId).order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(100);
    if (data.before) query = query.or(`occurred_at.lt.${data.before.time},and(occurred_at.eq.${data.before.time},id.lt.${data.before.id})`);
    const [events, recording] = await Promise.all([query, context.supabase.from("incident_activity_recording").select("began_at").eq("singleton", true).single()]);
    if (events.error || recording.error || !recording.data) throw new Error("Timeline could not be loaded. Please try again.");
    return { events: events.data ?? [], beganAt: recording.data.began_at };
  });