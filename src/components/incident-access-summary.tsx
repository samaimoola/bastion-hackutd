import { useQuery } from "@tanstack/react-query";
import { incidentMembershipOptions } from "@/lib/incident-queries";

const meaning = {
  commander: "you can edit this incident, add records and manage team access",
  responder: "you can edit this incident and add records",
  viewer: "you can read everything here, but cannot make changes",
} as const;

/**
 * Plain-language statement of the caller's role. Display only: every write is still authorized by
 * the database RPCs, and each control keeps its own permission check.
 */
export function YourAccess({ incidentId, userId }: { incidentId: string; userId: string }) {
  const membership = useQuery(incidentMembershipOptions(userId, incidentId));
  const role = membership.data;
  const text = membership.isPending
    ? "Checking your access…"
    : membership.isError || !role
      ? "Your access could not be checked."
      : `${role[0]!.toUpperCase()}${role.slice(1)}: ${meaning[role]}.`;
  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      <span className="font-medium text-foreground">Your access</span> · {text}
    </p>
  );
}
