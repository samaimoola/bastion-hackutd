import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-provider";
import { invitationOrigin } from "@/lib/invitation-url";
import {
  SIGNUP_PASSWORD_MIN,
  signupCode,
  signupErrorMessage,
  signupReadiness,
  type SignupReadiness,
} from "@/lib/signup-invitation-models";

// Invitation-only account creation. The page only collects details; Supabase Auth's Before User Created
// hook and the auth.users triggers in docs/database-proposals/signup-invitations.sql decide. Until that
// is installed and switched on, the page shows a setup message and no form.
export const Route = createFileRoute("/signup")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Create an account with an invitation — Bastion" },
      {
        name: "description",
        content:
          "Create a Bastion account using a private invitation from your incident commander.",
      },
      { property: "og:title", content: "Create an account with an invitation — Bastion" },
      { property: "og:description", content: "Bastion accounts are created by invitation only." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: Signup,
});

function Signup() {
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState<SignupReadiness | "checking">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const lock = useRef(false);
  const check = useCallback(() => {
    setReadiness("checking");
    void signupReadiness(supabase).then(setReadiness);
  }, []);
  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (data.user) navigate({ to: "/dashboard", replace: true });
      })
      .catch(() => undefined);
    check();
  }, [navigate, check]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    setError("");
    const parsedCode = signupCode.safeParse(code);
    if (!parsedCode.success) {
      setError(parsedCode.error.issues[0]?.message ?? "Enter your invitation code.");
      return;
    }
    if (password.length < SIGNUP_PASSWORD_MIN) {
      setError(`Use at least ${SIGNUP_PASSWORD_MIN} characters for your password.`);
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    lock.current = true;
    setLoading(true);
    const address = email.trim();
    try {
      // The code travels once, in the sign-up request. The database stores only its hash and strips it from
      // the new account. Nothing here logs the code or the password.
      const { data, error } = await supabase.auth.signUp({
        email: address,
        password,
        options: {
          emailRedirectTo: `${invitationOrigin(window.location.origin)}/login`,
          data: { invitation_code: parsedCode.data },
        },
      });
      if (error) {
        setError(signupErrorMessage(error));
        return;
      }
      setPassword("");
      setConfirm("");
      setCode("");
      if (data.session) {
        await navigate({ to: "/dashboard", replace: true });
        return;
      }
      setSent(address);
    } catch {
      setError("Could not reach the sign-up service. Check your connection and try again.");
    } finally {
      lock.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-10">
        <Wordmark />
        <ThemeToggle compact />
      </div>
      <main className="mx-auto grid max-w-7xl justify-items-center gap-8 px-6 pb-16 pt-6 sm:px-10 sm:pt-10">
        <div className="fade-in max-w-xl text-center">
          <p className="eyebrow">Incident response workspace</p>
          <h1 className="mt-3 text-4xl font-medium leading-tight sm:text-5xl">
            Create an account with an invitation
          </h1>
          <p className="mt-4 text-muted-foreground">
            Bastion accounts are created by invitation only.
          </p>
        </div>
        <div className="panel fade-in w-full max-w-[440px] p-6 sm:p-8">
          {readiness === "checking" ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking whether account invitations are available…
            </p>
          ) : readiness === "unknown" ? (
            <div role="alert" className="space-y-4">
              <h2 className="text-xl font-medium">Account creation could not be checked</h2>
              <p className="text-sm text-muted-foreground">
                Bastion could not reach its account service. Check your connection and try again.
              </p>
              <Button variant="outline" onClick={check}>
                Try again
              </Button>
            </div>
          ) : readiness === "not_ready" ? (
            <div className="space-y-4">
              <h2 className="text-xl font-medium">Account creation is not set up yet</h2>
              <p className="text-sm text-muted-foreground">
                Invitation-only sign-up has not been switched on for this Bastion workspace, so no
                accounts can be created here yet.
              </p>
              <p className="text-sm text-muted-foreground">
                Ask your Bastion administrator to create your account. If you already have one, sign
                in.
              </p>
            </div>
          ) : sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto h-10 w-10 text-primary" aria-hidden />
              <h2 className="mt-4 text-2xl font-medium">Check your email</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                If the invitation was accepted, a confirmation link is on its way to{" "}
                <span className="font-medium text-foreground">{sent}</span>. Open it, then sign in.
                Your incident access is ready once you sign in.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-medium">Your details</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Use the invitation code your incident commander shared with you privately, and the
                email address they invited. The code works once and expires after 24 hours.
              </p>
              <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="invitation-code">Invitation code</Label>
                  <Input
                    id="invitation-code"
                    type="password"
                    required
                    maxLength={64}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-11 font-mono"
                    disabled={loading}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError("");
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    className="h-11"
                    autoComplete="email"
                    disabled={loading}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw">Password</Label>
                  <Input
                    id="pw"
                    type="password"
                    required
                    minLength={SIGNUP_PASSWORD_MIN}
                    autoComplete="new-password"
                    className="h-11"
                    disabled={loading}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    aria-describedby="pw-hint"
                  />
                  <p id="pw-hint" className="text-xs text-muted-foreground">
                    At least {SIGNUP_PASSWORD_MIN} characters. Keep it in a password manager that
                    does not depend on company systems.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw2">Confirm password</Label>
                  <Input
                    id="pw2"
                    type="password"
                    required
                    autoComplete="new-password"
                    className="h-11"
                    disabled={loading}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setError("");
                    }}
                  />
                </div>
                {error && (
                  <p
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
                <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Creating
                      account…
                    </>
                  ) : (
                    "Create account"
                  )}
                </Button>
              </form>
            </>
          )}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Got an incident link instead of a code? That link is for existing accounts. Sign in
            first, then open it.
          </p>
        </div>
      </main>
    </div>
  );
}
