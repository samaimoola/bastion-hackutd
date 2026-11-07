import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hashInvitation, incidentAccessInput, inviteInput, memberInput, memberRoleInput, redeemInput } from "./incident-access-models";

export const listIncidentMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).inputValidator(incidentAccessInput)
  .handler(async ({ data, context }) => {
    const { data: members, error } = await context.supabase.from("incident_members")
      .select("user_id, role").eq("incident_id", data.id).order("user_id");
    if (error) throw new Error("Team access could not be loaded. Please try again.");
    return members ?? [];
  });

function membershipError(error: { code?: string; message?: string }) {
  if (error.message?.includes("last commander")) return new Error("Keep at least one commander. Assign another commander before making this change.");
  if (error.code === "42501") return new Error("Only a current commander can change team access.");
  return new Error("Team access could not be changed. Please try again.");
}
export const changeIncidentMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(memberRoleInput)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_incident_member", { _incident_id: data.id, _user_id: data.userId, _role: data.role });
    if (error) throw membershipError(error);
  });
export const removeIncidentMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(memberInput)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("remove_incident_member", { _incident_id: data.id, _user_id: data.userId });
    if (error) throw membershipError(error);
  });

export const issueIncidentInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(inviteInput)
  .handler(async ({ data, context }) => {
    // Web Crypto executes only in the handler. Raw credentials are never stored or logged.
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, (n) => n.toString(16).padStart(2, "0")).join("");
    const hash = await hashInvitation(token);
    const { data: expiresAt, error } = await context.supabase.rpc("issue_incident_invitation", { _incident_id: data.id, _role: data.role, _token_hash: hash });
    if (error || !expiresAt) throw new Error("Only a current commander can generate an invitation. Please try again.");
    return { token, expiresAt };
  });
export const redeemIncidentInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).inputValidator(redeemInput)
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("redeem_incident_invitation", { _token_hash: data.hash });
    if (error || !id) throw new Error("This invitation is invalid, expired, already used, or no longer authorized. Ask a commander for a new link.");
    return { id };
  });