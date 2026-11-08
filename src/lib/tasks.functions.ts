import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addTaskInput, editTaskInput, isNotDeployed, listTasksInput, taskColumns, taskRowSchema, type TaskList } from "./task-models";

// User-scoped client only (never the service-role client): RLS and the task RPCs decide access.
// The task table and RPCs are not in the generated types yet, so they are reached through an untyped
// view of the same user-scoped client and every result is validated with zod.
const untyped = (client: unknown) => client as SupabaseClient;

function writeError(error: { code?: string; message?: string } | null) {
  if (isNotDeployed(error)) return new Error("Shared tasks are not set up for this workspace yet.");
  if (error?.code === "42501") return new Error("Only commanders and responders with current incident access can change tasks.");
  if (error?.code === "23503") return new Error("The assignee must be a current member of this incident.");
  if (error?.code === "22023" && error.message) return new Error(error.message);
  return new Error("The task could not be saved. Please try again.");
}

export const listIncidentTasks = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator(listTasksInput)
  .handler(async ({ data, context }): Promise<TaskList> => {
    const { data: incident, error: incidentError } = await context.supabase.from("incidents").select("id").eq("id", data.incidentId).maybeSingle();
    if (incidentError || !incident) throw new Error("This incident is unavailable or you no longer have access.");
    const { data: rows, error } = await untyped(context.supabase).from("incident_tasks").select(taskColumns).eq("incident_id", data.incidentId).order("created_at").order("id");
    if (isNotDeployed(error)) return { available: false };
    if (error) throw new Error("Tasks could not be loaded. Please try again.");
    return { available: true, tasks: taskRowSchema.array().parse(rows ?? []) };
  });

export const addIncidentTask = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(addTaskInput)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await untyped(context.supabase).rpc("add_incident_task", { _incident_id: data.incidentId, _title: data.title, _details: data.details, _assignee_id: data.assigneeId });
    if (error || !row) throw writeError(error);
    return taskRowSchema.parse(row);
  });

export const editIncidentTask = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(editTaskInput)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await untyped(context.supabase).rpc("update_incident_task", { _id: data.id, _title: data.title, _details: data.details, _assignee_id: data.assigneeId, _status: data.status });
    if (error || !row) throw writeError(error);
    return taskRowSchema.parse(row);
  });
