import { z } from "zod";
import { Constants, type Database } from "@/integrations/supabase/types";

// Pure helpers for the incident server functions: input schemas, row mapping and error mapping.
// Field names on the output match the UI's `Incident` shape (src/lib/demo-store.tsx) where the
// database has the data: stage <- response_stage, declaredAt <- created_at, lastUpdate <-
// updated_at, summary <- description. The database has no impact, nextActions or commander
// column, so those are not returned and nothing here invents them.

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 10000;

// Enum values come from the generated types so they cannot drift from the database.
export const incidentSeveritySchema = z.enum(Constants.public.Enums.incident_severity);
export const incidentStageSchema = z.enum(Constants.public.Enums.incident_response_stage);

// Strict: unexpected keys (for example creator_id) are rejected, never silently forwarded.
export const createIncidentInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Enter an incident title.")
      .max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters.`),
    description: z
      .string()
      .max(DESCRIPTION_MAX, `Keep the description under ${DESCRIPTION_MAX} characters.`)
      .optional(),
    severity: incidentSeveritySchema.optional(),
    stage: incidentStageSchema.optional(),
  })
  .strict();
export type CreateIncidentInput = z.infer<typeof createIncidentInputSchema>;

export const getIncidentInputSchema = z
  .object({ id: z.string().uuid("Invalid incident ID.") })
  .strict();

export const INCIDENT_COLUMNS =
  "id, title, description, severity, response_stage, created_at, updated_at" as const;

type IncidentRow = Database["public"]["Tables"]["incidents"]["Row"];
export type IncidentColumns = Pick<
  IncidentRow,
  "id" | "title" | "description" | "severity" | "response_stage" | "created_at" | "updated_at"
>;

export interface IncidentRecord {
  id: string;
  title: string;
  severity: IncidentRow["severity"];
  stage: IncidentRow["response_stage"];
  declaredAt: string;
  lastUpdate: string;
  summary: string;
}

export function toIncidentRecord(row: IncidentColumns): IncidentRecord {
  return {
    id: row.id,
    title: row.title,
    severity: row.severity,
    stage: row.response_stage,
    declaredAt: row.created_at,
    lastUpdate: row.updated_at,
    summary: row.description,
  };
}

export type IncidentAction = "create" | "list" | "load";

const FALLBACK: Record<IncidentAction, string> = {
  create: "The incident could not be created. Please try again.",
  list: "Incidents could not be loaded. Please try again.",
  load: "The incident could not be loaded. Please try again.",
};
export const NOT_FOUND_MESSAGE = "Incident not found.";

/**
 * Maps a Postgres/PostgREST error to a fixed, user-safe Error. Only the error code is read;
 * the database message, details and hint are never copied into the result.
 */
export function incidentFailure(error: { code?: string }, action: IncidentAction): Error {
  switch (error.code) {
    case "42501": // insufficient_privilege, also raised by 'Authentication required'
      return new Error("You do not have permission to do that.");
    case "PGRST301": // JWT rejected by PostgREST
    case "PGRST303":
      return new Error("Your session expired. Sign in again.");
    case "22023": // invalid_parameter_value (blank title)
    case "22P02": // invalid_text_representation (bad enum or uuid)
      return new Error("The incident details are not valid.");
    default:
      return new Error(FALLBACK[action]);
  }
}
