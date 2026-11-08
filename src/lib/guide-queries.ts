import { queryOptions } from "@tanstack/react-query";
import { guideHistory } from "./guide.functions";

/** Owner-scoped Guide history. Shared by the Guide page and the floating panel. */
export const guideHistoryOptions = queryOptions({
  queryKey: ["guide-history"],
  queryFn: () => guideHistory(),
  staleTime: 0,
});
