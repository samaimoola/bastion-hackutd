import { infiniteQueryOptions } from "@tanstack/react-query";
import { listIncidentMessages } from "./messages.functions";
import type { z } from "zod";
import type { messageCursor } from "./message-models";
export const messagesKey = (userId: string, incidentId: string) => ["incidents", userId, "messages", incidentId] as const;
export const messagesOptions = (userId: string, incidentId: string) => infiniteQueryOptions({
  queryKey: messagesKey(userId, incidentId),
  initialPageParam: undefined as z.infer<typeof messageCursor> | undefined,
  queryFn: async ({ pageParam, signal }) => {
    const rows = await listIncidentMessages({ data: { incidentId, ...(pageParam ? { before: pageParam } : {}) } });
    signal.throwIfAborted();
    return rows;
  },
  getNextPageParam: (rows) => {
    const last = rows.at(-1);
    return rows.length === 100 && last ? { time: last.created_at, id: last.id } : undefined;
  },
  staleTime: 0, retry: false,
});