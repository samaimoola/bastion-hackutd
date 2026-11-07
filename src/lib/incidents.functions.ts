import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createIncidentInputSchema,
  getIncidentInputSchema,
  incidentFailure,
  INCIDENT_COLUMNS,
  NOT_FOUND_MESSAGE,
  toIncidentRecord,
} from "./incident-models";

// All three functions run as the signed-in user: requireSupabaseAuth verifies the session and
// supplies a user-scoped Supabase client (context.supabase). The service-role client is never
// used, so database row-level security and the create_incident RPC decide what is allowed.
// Failures throw fixed messages (see incidentFailure); database internals are not returned.

/** Creates an incident through the create_incident RPC; the caller becomes its commander. */
export const createIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(createIncidentInputSchema)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("create_incident", {
      _title: data.title,
      // Optional RPC arguments are omitted, not sent as undefined, so database defaults apply.
      ...(data.description !== undefined ? { _description: data.description } : {}),
      ...(data.severity !== undefined ? { _severity: data.severity } : {}),
      ...(data.stage !== undefined ? { _response_stage: data.stage } : {}),
    });
    if (error) throw incidentFailure(error, "create");
    if (!row) throw incidentFailure({}, "create");
    return toIncidentRecord(row);
  });

/** Lists the incidents the signed-in user is a member of (enforced by row-level security). */
export const listIncidents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("incidents")
      .select(INCIDENT_COLUMNS)
      .order("updated_at", { ascending: false });
    if (error) throw incidentFailure(error, "list");
    return (data ?? []).map(toIncidentRecord);
  });

/**
 * Retrieves one incident by ID. A missing incident and an incident the user cannot access give
 * the same "not found" error, so existence is not revealed to non-members.
 */
export const getIncident = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(getIncidentInputSchema)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("incidents")
      .select(INCIDENT_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw incidentFailure(error, "load");
    if (!row) throw new Error(NOT_FOUND_MESSAGE);
    return toIncidentRecord(row);
  });
