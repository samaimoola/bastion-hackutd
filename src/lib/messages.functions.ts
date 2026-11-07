import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listMessagesInput, sendMessageInput } from "./message-models";

export const listIncidentMessages = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator(listMessagesInput)
  .handler(async ({ data, context }) => {
    const { data: incident, error: accessError } = await context.supabase.from("incidents").select("id").eq("id", data.incidentId).maybeSingle();
    if (accessError || !incident) throw new Error("This incident is unavailable or you no longer have access.");
    let query = context.supabase.from("incident_messages").select("id,incident_id,sender_id,author_name,body,request_id,created_at").eq("incident_id", data.incidentId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
    if (data.before) query = query.or(`created_at.lt.${data.before.time},and(created_at.eq.${data.before.time},id.lt.${data.before.id})`);
    const { data: rows, error } = await query;
    if (error) throw new Error("Messages could not be loaded. Please try again.");
    return rows ?? [];
  });
export const sendIncidentMessage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(sendMessageInput)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("send_incident_message", { _incident_id: data.incidentId, _body: data.body, _request_id: data.requestId });
    if (error || !row) throw new Error(error?.code === "42501" ? "Only commanders and responders with current incident access can send messages." : "The message could not be sent. Your draft is kept; try again.");
    return row;
  });