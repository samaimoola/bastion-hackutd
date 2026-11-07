import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const guideHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("guide_conversations")
      .select("messages, blocked_reason").eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error("Your guide history could not be loaded. Please try again.");
    return { messages: data?.messages ?? [], blockedReason: data?.blocked_reason ?? null };
  });