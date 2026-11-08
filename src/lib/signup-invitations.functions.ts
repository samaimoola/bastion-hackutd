import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hashInvitation } from "./incident-access-models";
import { generateSignupCode, signupInviteInput, signupReadiness } from "./signup-invitation-models";
import { isNotDeployed } from "./task-models";

// User-scoped client only (never the service-role client): the database decides who may issue.
// The RPCs are not in the generated types until the proposal is applied, hence the untyped view.
const untyped = (client: unknown) => client as SupabaseClient;

export const getSignupInvitationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ readiness: await signupReadiness(context.supabase) }));

export const issueSignupInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(signupInviteInput)
  .handler(async ({ data, context }) => {
    // The code exists only in this response. Only its SHA-256 hash is sent to the database; neither is logged.
    const code = generateSignupCode();
    const { data: expiresAt, error } = await untyped(context.supabase).rpc(
      "issue_signup_invitation",
      {
        _incident_id: data.id,
        _email: data.email,
        _role: data.role,
        _code_hash: await hashInvitation(code),
      },
    );
    if (isNotDeployed(error) || error?.code === "55000")
      throw new Error("Account invitations are not set up for this workspace yet.");
    if (error?.code === "42501")
      throw new Error("Only a current commander of this incident can invite new accounts.");
    if (error?.code === "22023" && error.message) throw new Error(`${error.message}.`);
    if (error || typeof expiresAt !== "string")
      throw new Error("The invitation code could not be created. Please try again.");
    return { code, expiresAt, email: data.email, role: data.role };
  });
