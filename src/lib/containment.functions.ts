import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { modelSchema, planTitleSchema, type ContainmentModel, type ContainmentResults } from "./containment-graph";

export type SavedPlan = { id: string; title: string; isolated_system_id: string; model_snapshot: ContainmentModel; results: ContainmentResults; created_by: string; author_name: string | null; created_at: string };
export type LabData = { model: ContainmentModel | null; updatedAt: string | null; updatedBy: string | null; plans: SavedPlan[] };

function writeError(error: { code?: string; message?: string } | null, fallback: string) {
  if (error?.code === "42501") return new Error("Only commanders and responders with current incident access can change Containment Lab.");
  if (error?.code === "22023" && error.message) return new Error(error.message);
  return new Error(fallback);
}

export const getContainmentLab = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ incidentId: z.string().uuid() }).strict())
  .handler(async ({ data, context }): Promise<LabData> => {
    const { data: incident, error: incidentError } = await context.supabase.from("incidents").select("id").eq("id", data.incidentId).maybeSingle();
    if (incidentError || !incident) throw new Error("This incident is unavailable or you no longer have access.");
    const [model, plans] = await Promise.all([
      context.supabase.from("incident_containment_models").select("model, updated_at, updated_by").eq("incident_id", data.incidentId).maybeSingle(),
      context.supabase.from("incident_containment_plans").select("id, title, isolated_system_id, model_snapshot, results, created_by, author_name, created_at").eq("incident_id", data.incidentId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (model.error || plans.error) throw new Error("Containment Lab could not be loaded. Please try again.");
    return {
      model: (model.data?.model as unknown as ContainmentModel | undefined) ?? null,
      updatedAt: model.data?.updated_at ?? null, updatedBy: model.data?.updated_by ?? null,
      plans: (plans.data ?? []) as unknown as SavedPlan[],
    };
  });

export const saveContainmentModel = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ incidentId: z.string().uuid(), model: modelSchema }).strict())
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("save_containment_model", { _incident_id: data.incidentId, _model: data.model });
    if (error) throw writeError(error, "The model could not be saved. Please try again.");
    return { ok: true };
  });

export const saveContainmentPlan = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ incidentId: z.string().uuid(), model: modelSchema, title: planTitleSchema, isolatedSystemId: z.string().uuid() }).strict())
  .handler(async ({ data, context }) => {
    // Plans always snapshot the shared stored model, so save the on-screen model first.
    const saved = await context.supabase.rpc("save_containment_model", { _incident_id: data.incidentId, _model: data.model });
    if (saved.error) throw writeError(saved.error, "The model could not be saved. Please try again.");
    const { data: row, error } = await context.supabase.rpc("save_containment_plan", { _incident_id: data.incidentId, _title: data.title, _isolated_system_id: data.isolatedSystemId });
    if (error || !row) throw writeError(error, "The plan could not be saved. Please try again.");
    return { id: row.id };
  });
