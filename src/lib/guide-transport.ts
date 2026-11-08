import { DefaultChatTransport, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";

// Unchanged Guide transport: same /api/guide route, bearer session token and last-message-only body.
export function createGuideTransport() {
  return new DefaultChatTransport<UIMessage>({
    api: "/api/guide",
    headers: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
    },
    // Only the new question is sent; stored history stays authoritative on the server.
    prepareSendMessagesRequest: ({ messages, headers }) => ({
      ...(headers ? { headers } : {}),
      body: {
        messages: messages.slice(-1).map((m) => ({
          id: m.id,
          role: m.role,
          parts: m.parts.filter((p) => p.type === "text"),
        })),
      },
    }),
    fetch: async (url, init) => {
      const response = await fetch(url, init);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? "The guide could not respond. Please try again.");
      }
      return response;
    },
  });
}
