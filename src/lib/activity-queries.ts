import { infiniteQueryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import type { activityCursor } from "./activity-models";
import { listIncidentActivity } from "./activity.functions";
export const activityKey = (userId: string, incidentId: string) => ["incidents", userId, "activity", incidentId] as const;
export const activityOptions = (userId: string, incidentId: string) => infiniteQueryOptions({
  queryKey: activityKey(userId, incidentId), initialPageParam: undefined as z.infer<typeof activityCursor> | undefined,
  queryFn: async ({ pageParam, signal }) => {
    const data = await listIncidentActivity({ data: { incidentId, ...(pageParam ? { before: pageParam } : {}) } });
    signal.throwIfAborted(); return data;
  },
  getNextPageParam: (page) => {
    const last = page.events.at(-1);
    return page.events.length === 100 && last ? { time: last.occurred_at, id: last.id } : undefined;
  }, staleTime: 0, retry: false,
});