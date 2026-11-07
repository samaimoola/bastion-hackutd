import { queryOptions } from "@tanstack/react-query";
import { listAffectedSystems } from "./affected-systems.functions";
export const affectedKey = (userId: string, incidentId: string) => ["incidents", userId, "affected-systems", incidentId] as const;
export const affectedOptions = (userId: string, incidentId: string) => queryOptions({
  queryKey: affectedKey(userId, incidentId), queryFn: () => listAffectedSystems({ data: { incidentId } }), staleTime: 0, retry: false,
});