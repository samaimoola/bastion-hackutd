import { queryOptions } from "@tanstack/react-query";
import { getContainmentLab } from "./containment.functions";
export const labKey = (userId: string, incidentId: string) => ["incidents", userId, "containment-lab", incidentId] as const;
export const labOptions = (userId: string, incidentId: string) => queryOptions({
  queryKey: labKey(userId, incidentId), queryFn: () => getContainmentLab({ data: { incidentId } }), staleTime: 0, retry: false,
});
