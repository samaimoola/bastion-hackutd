import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addAffectedInput, editAffectedInput, listAffectedInput, affectedColumns, type AffectedFields } from "./affected-system-models";

function args(data: AffectedFields) {
  return { _resource_name: data.resourceName, _data_description: data.dataDescription, _assessment: data.assessment, _data_conditions: data.dataConditions, _containment_status: data.containmentStatus, _investigation_notes: data.investigationNotes };
}
function saveError(error: { code?: string } | null) {
  return new Error(error?.code === "42501" ? "Only commanders and responders with current incident access can save systems." : "The system could not be saved. Check the details and try again.");
}
export const listAffectedSystems = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator(listAffectedInput)
  .handler(async ({ data, context }) => {
    const { data: incident, error: incidentError } = await context.supabase.from("incidents").select("id").eq("id", data.incidentId).maybeSingle();
    if (incidentError || !incident) throw new Error("This incident is unavailable or you no longer have access.");
    const { data: rows, error } = await context.supabase.from("incident_affected_systems").select(affectedColumns).eq("incident_id", data.incidentId).order("created_at");
    if (error) throw new Error("Affected systems could not be loaded. Please try again.");
    return rows ?? [];
  });
export const addAffectedSystem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(addAffectedInput)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("add_incident_affected_system", { _incident_id: data.incidentId, ...args(data) });
    if (error || !row) throw saveError(error);
    return row;
  });
export const editAffectedSystem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(editAffectedInput)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("update_incident_affected_system", { _id: data.id, ...args(data) });
    if (error || !row) throw saveError(error);
    return row;
  });