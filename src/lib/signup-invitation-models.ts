import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inviteRoleSchema } from "./incident-access-models";
import { isNotDeployed } from "./task-models";

// Account-creation invitations: a one-use code that lets a person WITHOUT a Bastion account create one,
// bound to their email, joining one incident as responder or viewer. Enforced by the database and the
// Supabase Auth hook in docs/database-proposals/signup-invitations.sql (NOT YET APPLIED). Separate from
// incident access links (incident-access-models.ts), which add an EXISTING account to an incident.

/** 128 random bits as 32 lowercase hex characters. */
export const signupCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[0-9a-f]{32}$/,
    "Enter the complete 32-character invitation code your commander shared.",
  );
export const signupInviteInput = z
  .object({
    id: z.string().uuid(),
    email: z.string().trim().toLowerCase().email().max(254),
    role: inviteRoleSchema,
  })
  .strict();
export const SIGNUP_PASSWORD_MIN = 8;

export function generateSignupCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}

export type SignupReadiness = "ready" | "not_ready" | "unknown";
/**
 * Whether invitation-only sign-up is switched on in the connected database. A missing function means the
 * proposal is not installed. This only chooses what to show; the database and Auth hook enforce access.
 */
export async function signupReadiness(client: unknown): Promise<SignupReadiness> {
  try {
    // Not in the generated types until the proposal is applied and types are regenerated.
    const { data, error } = await (client as SupabaseClient).rpc("invitation_signup_ready");
    if (isNotDeployed(error)) return "not_ready";
    if (error) return "unknown";
    return data === true ? "ready" : "not_ready";
  } catch {
    return "unknown";
  }
}

type AuthFailure = {
  message?: string | undefined;
  code?: string | undefined;
  status?: number | undefined;
};
/** Maps Supabase Auth sign-up failures to plain guidance. Never echoes the code or password. */
export function signupErrorMessage(error: AuthFailure): string {
  const message = error.message ?? "";
  if (
    error.status === 429 ||
    error.code === "over_request_rate_limit" ||
    error.code === "over_email_send_rate_limit"
  )
    return "Too many attempts. Wait a few minutes, then try again.";
  if (error.code === "signup_disabled" || /signups not allowed/i.test(message))
    return "Account creation is not switched on yet. Contact your Bastion administrator.";
  if (error.code === "user_already_exists" || /already registered/i.test(message))
    return "An account with this email already exists. Sign in instead, and ask your commander for an incident access link.";
  if (error.code === "weak_password" || /password/i.test(message))
    return "Choose a stronger password: at least 8 characters, and avoid common or previously leaked passwords.";
  if (/invitation|database error|hook/i.test(message) || error.status === 403) {
    return "This invitation could not be used. Check that the code and email exactly match what your commander sent. Codes expire after 24 hours and work once; ask your commander for a new one if needed.";
  }
  return "Your account could not be created. Please try again.";
}
