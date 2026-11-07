import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { getIncident, getIncidentMembership, listIncidents } from "./incidents.functions";

// Identity is part of every key: even an old request finishing during an account
// transition cannot populate the next account's cache.
export const incidentKeys = {
  all: ["incidents"] as const,
  list: (userId: string) => ["incidents", userId, "list"] as const,
  detail: (userId: string, id: string) => ["incidents", userId, "detail", id] as const,
  membership: (userId: string, id: string) => ["incidents", userId, "membership", id] as const,
};

export const incidentListOptions = (userId: string) => queryOptions({
  queryKey: incidentKeys.list(userId),
  queryFn: () => listIncidents(),
  staleTime: 0,
});

export const incidentDetailOptions = (userId: string, id: string) => queryOptions({
  queryKey: incidentKeys.detail(userId, id),
  queryFn: () => getIncident({ data: { id } }),
  staleTime: 0,
  retry: false,
});

export const incidentMembershipOptions = (userId: string, id: string) => queryOptions({
  queryKey: incidentKeys.membership(userId, id),
  queryFn: () => getIncidentMembership({ data: { id } }),
  staleTime: 0,
  retry: false,
});

export function clearIncidentCache(queryClient: QueryClient) {
  void queryClient.cancelQueries({ queryKey: incidentKeys.all });
  queryClient.removeQueries({ queryKey: incidentKeys.all });
}