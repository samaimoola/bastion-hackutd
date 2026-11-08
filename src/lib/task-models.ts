import { z } from "zod";

// Shared incident tasks. The table and RPCs are in docs/database-proposals/incident-tasks.sql and are NOT
// yet in the deployed database or the generated Supabase types, so the row type is declared here and
// every row is validated. Replace with Database["public"]["Tables"]["incident_tasks"]["Row"] once types
// are regenerated after deployment.
export const taskStatusSchema = z.enum(["todo", "in_progress", "done"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export const taskStatusLabel: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", done: "Done" };

export const TASK_TITLE_MAX = 200;
export const TASK_DETAILS_MAX = 10000;
const title = z.string().trim().min(1, "Enter a task title.").max(TASK_TITLE_MAX, `Keep the title under ${TASK_TITLE_MAX} characters.`);
const details = z.string().max(TASK_DETAILS_MAX, `Keep the details under ${TASK_DETAILS_MAX} characters.`);
const assigneeId = z.string().uuid().nullable();

export const taskFields = z.object({ title, details, assigneeId }).strict();
export type TaskFields = z.infer<typeof taskFields>;
export const addTaskInput = taskFields.extend({ incidentId: z.string().uuid() }).strict();
export const editTaskInput = taskFields.extend({ id: z.string().uuid(), status: taskStatusSchema }).strict();
export const listTasksInput = z.object({ incidentId: z.string().uuid() }).strict();

export const taskColumns = "id,incident_id,title,details,assignee_id,status,created_by,updated_by,created_at,updated_at";
export const taskRowSchema = z.object({
  id: z.string().uuid(), incident_id: z.string().uuid(), title: z.string(), details: z.string(),
  assignee_id: z.string().uuid().nullable(), status: taskStatusSchema,
  created_by: z.string().uuid(), updated_by: z.string().uuid(), created_at: z.string(), updated_at: z.string(),
});
export type IncidentTask = z.infer<typeof taskRowSchema>;

/** Whether shared tasks exist in the connected database. Never falls back to browser storage. */
export type TaskList = { available: true; tasks: IncidentTask[] } | { available: false };

/** PostgREST/Postgres codes for "this table or function is not deployed". */
export function isNotDeployed(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ["PGRST205", "PGRST202", "42P01", "42883"].includes(error.code ?? "")
    || /could not find the (table|function)|does not exist/i.test(error.message ?? "");
}

export const memberLabel = (userId: string | null, currentUserId: string) =>
  userId === null ? "Unassigned" : userId === currentUserId ? "You" : `Member ${userId.slice(0, 8)}`;
