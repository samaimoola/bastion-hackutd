import { infiniteQueryOptions } from "@tanstack/react-query";
import { listIncidentMessages } from "./messages.functions";
export const messagesKey = (userId: string, incidentId: string) => ["incidents", userId, "messages", incidentId] as const;
export const messagesOptions = (userId: string, incidentId: string) => infiniteQueryOptions({
  queryKey: messagesKey(userId, incidentId),
  initialPageParam: undefined as string | undefined,
  queryFn: async ({ pageParam, signal }) => {
    const rows = await listIncidentMessages({ data: { incidentId, ...(pageParam ? { before: pageParam } : {}) } });
    signal.throwIfAborted();
    return rows;
  },
  getNextPageParam: (rows) => rows.length === 100 ? rows.at(-1)?.created_at : undefined,
  staleTime: 0, retry: false,
});