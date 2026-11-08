import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound } from "lucide-react";
import {
  getSignupInvitationStatus,
  issueSignupInvitation,
} from "@/lib/signup-invitations.functions";
import { signupInviteInput } from "@/lib/signup-invitation-models";
import { invitationOrigin } from "@/lib/invitation-url";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Issued = { code: string; email: string; role: "responder" | "viewer"; expiresAt: string };

/**
 * Commander-only: a one-use code that lets a person WITHOUT a Bastion account create one and join this
 * incident. Distinct from incident access links, which only add existing accounts. The code is held in
 * component state only and disappears when the dialog closes.
 */
export function SignupInvitation({ incidentId, userId }: { incidentId: string; userId: string }) {
  const status = useServerFn(getSignupInvitationStatus);
  const issue = useServerFn(issueSignupInvitation);
  const readiness = useQuery({
    queryKey: ["signup-invitations", userId, "status"],
    queryFn: () => status(),
    retry: false,
    staleTime: 60_000,
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"responder" | "viewer">("viewer");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const lock = useRef(false);
  let signupAddress = "/signup";
  try {
    signupAddress = `${invitationOrigin(window.location.origin)}/signup`;
  } catch {
    /* show the path only */
  }

  return (
    <section
      className="space-y-3 border-t border-border pt-5"
      aria-labelledby="signup-invite-heading"
    >
      <h2 id="signup-invite-heading" className="text-lg font-medium">
        Invite someone without an account
      </h2>
      {readiness.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking account invitations…
        </p>
      ) : readiness.data?.readiness !== "ready" ? (
        <p className="text-sm text-muted-foreground">
          Account invitations are not set up for this workspace yet. Ask your Bastion administrator
          to create the person&rsquo;s account, then add them with an access link above.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Creates a private, one-use code for one email address. It expires in 24 hours. When they
            create their account with it, they join this incident with the access level you choose.
          </p>
          <form
            className="space-y-3"
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              if (lock.current) return;
              const parsed = signupInviteInput.safeParse({ id: incidentId, email, role });
              if (!parsed.success) {
                setError("Enter a valid email address.");
                return;
              }
              lock.current = true;
              setBusy(true);
              setError("");
              setIssued(null);
              setCopied(false);
              try {
                setIssued(await issue({ data: parsed.data }));
                setEmail("");
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "The invitation code could not be created.",
                );
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="signup-invite-email">Their email</Label>
              <Input
                id="signup-invite-email"
                type="email"
                maxLength={254}
                required
                autoComplete="off"
                value={email}
                disabled={busy}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="signup-invite-role">Access level</Label>
                <Select
                  value={role}
                  disabled={busy}
                  onValueChange={(value) => {
                    if (value === "viewer" || value === "responder") setRole(value);
                  }}
                >
                  <SelectTrigger id="signup-invite-role" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="responder">Responder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={busy}>
                <KeyRound className="size-4" aria-hidden />
                {busy ? "Creating…" : "Create invitation code"}
              </Button>
            </div>
          </form>
          {issued && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <Label htmlFor="signup-invite-code">Account invitation code</Label>
              <div className="flex gap-2">
                <Input
                  id="signup-invite-code"
                  readOnly
                  value={issued.code}
                  className="min-w-0 font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  title="Copy invitation code"
                  aria-label="Copy invitation code"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(issued.code)
                      .then(() => setCopied(true))
                      .catch(() => setError("Copy failed. Select and copy the code instead."));
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="break-words text-xs text-muted-foreground">
                {copied ? "Copied · " : ""}For {issued.email} ·{" "}
                {issued.role === "responder" ? "Responder" : "Viewer"} · Expires{" "}
                {new Date(issued.expiresAt).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                This code is shown only once. Send it privately (not in team chat), and ask them to
                open {signupAddress} and choose Create an account with an invitation.
              </p>
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
