import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const MESSAGE_LIMIT = 4000;
export const messageBody = z.string().trim().min(1, "Enter a message.").max(MESSAGE_LIMIT, "Keep messages to 4,000 characters or fewer.");
export const listMessagesInput = z.object({ incidentId: z.uuid(), before: z.string().datetime({ offset: true }).optional() }).strict();
export const sendMessageInput = z.object({ incidentId: z.uuid(), body: messageBody, requestId: z.uuid() }).strict();
export type IncidentMessage = Database["public"]["Tables"]["incident_messages"]["Row"];
export function messageAuthor(message: Pick<IncidentMessage, "author_name" | "sender_id">) {
  return message.author_name?.trim() || `Member ${message.sender_id.slice(0, 8)}`;
}