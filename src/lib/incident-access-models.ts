import { z } from "zod";
import { Constants } from "@/integrations/supabase/types";

export const inviteRoleSchema = z.enum(["responder", "viewer"]);
export const memberRoleSchema = z.enum(Constants.public.Enums.incident_member_role);
export const incidentAccessInput = z.object({ id: z.string().uuid() }).strict();
export const memberInput = incidentAccessInput.extend({ userId: z.string().uuid() });
export const memberRoleInput = memberInput.extend({ role: memberRoleSchema });
export const inviteInput = incidentAccessInput.extend({ role: inviteRoleSchema });
export const redeemInput = z.object({ hash: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
export const invitationTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
export async function hashInvitation(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, "0")).join("");
}

const pendingKey = "bastion-pending-invitation";
export function captureInvitation(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("invite");
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  if (token && invitationTokenSchema.safeParse(token).success) {
    sessionStorage.setItem(pendingKey, JSON.stringify({ token, capturedAt: Date.now() }));
    return token;
  }
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null");
    const parsed = z.object({ token: invitationTokenSchema, capturedAt: z.number() }).safeParse(saved);
    if (parsed.success && Date.now() - parsed.data.capturedAt < 24 * 3600 * 1000) return parsed.data.token;
  } catch { /* discard invalid pending state */ }
  clearInvitation(); return null;
}
export function clearInvitation() { sessionStorage.removeItem(pendingKey); }