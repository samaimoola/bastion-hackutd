import { queryOptions } from "@tanstack/react-query";
import { listIncidentTasks } from "./tasks.functions";
import { listIncidentMembers } from "./incident-access.functions";
import { incidentKeys } from "./incident-queries";

export const tasksKey = (userId: string, incidentId: string) => ["incidents", userId, "tasks", incidentId] as const;
export const tasksOptions = (userId: string, incidentId: string) => queryOptions({
  queryKey: tasksKey(userId, incidentId), queryFn: () => listIncidentTasks({ data: { incidentId } }), staleTime: 0, retry: false,
});
/** Same key as Team access, so both views share one cache of the incident's members. */
export const membersOptions = (userId: string, incidentId: string) => queryOptions({
  queryKey: [...incidentKeys.all, userId, "members", incidentId], queryFn: () => listIncidentMembers({ data: { id: incidentId } }), staleTime: 0, retry: false,
});
