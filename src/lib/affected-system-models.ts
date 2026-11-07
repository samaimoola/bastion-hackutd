import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const assessmentSchema = z.enum(["suspected", "confirmed"]);
export const conditionSchema = z.enum(["encrypted", "exfiltrated", "unavailable", "unknown"]);
export const containmentSchema = z.enum(["not contained", "in progress", "contained"]);
export const affectedFields = z.object({
  resourceName: z.string().trim().min(1, "Enter a system or resource name.").max(200),
  dataDescription: z.string().max(10000),
  assessment: assessmentSchema,
  dataConditions: z.array(conditionSchema).min(1, "Choose at least one data condition.").max(4).refine((v) => new Set(v).size === v.length, "Choose each condition only once."),
  containmentStatus: containmentSchema,
  investigationNotes: z.string().max(10000),
}).strict();
export const addAffectedInput = affectedFields.extend({ incidentId: z.string().uuid() });
export const editAffectedInput = affectedFields.extend({ id: z.string().uuid() });
export const listAffectedInput = z.object({ incidentId: z.string().uuid() }).strict();
export type AffectedFields = z.infer<typeof affectedFields>;
export type AffectedSystem = Database["public"]["Tables"]["incident_affected_systems"]["Row"];
export const affectedColumns = "id,incident_id,resource_name,data_description,assessment,data_conditions,containment_status,investigation_notes,created_by,updated_by,created_at,updated_at";
export const systemFields = (row?: AffectedSystem): AffectedFields => row ? {
  resourceName: row.resource_name, dataDescription: row.data_description,
  assessment: assessmentSchema.parse(row.assessment), dataConditions: z.array(conditionSchema).parse(row.data_conditions),
  containmentStatus: containmentSchema.parse(row.containment_status), investigationNotes: row.investigation_notes,
} : { resourceName: "", dataDescription: "", assessment: "suspected", dataConditions: ["unknown"], containmentStatus: "not contained", investigationNotes: "" };