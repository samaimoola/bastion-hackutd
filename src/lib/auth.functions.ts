import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unauthorizedToResponse } from "./supabase-bearer-middleware";

/**
 * Returns only the authenticated user's ID. Auth failures resolve to a plain
 * 401 Response (not a rejection), because the framework hands raw responses
 * back to the caller. Check `result instanceof Response && !result.ok`.
 */
export const getAuthenticatedUserId = createServerFn({ method: "POST" })
  .middleware([unauthorizedToResponse, requireSupabaseAuth])
  .handler(async ({ context }) => ({ userId: context.userId }));
