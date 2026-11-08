// Sign-up page with Supabase mocked. Real enforcement is tested in signup-invitations-database.test.ts.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const { signUp, rpc, navigate } = vi.hoisted(() => ({
  signUp: vi.fn(),
  rpc: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }), signUp }, rpc },
}));
vi.mock("@/components/app-shell", () => ({ Wordmark: () => null }));
vi.mock("@/components/theme-provider", () => ({ ThemeToggle: () => null }));
import { Route } from "@/routes/signup";
const Page = (Route as unknown as { options: { component: () => ReactNode } }).options.component;
const code = "0123456789abcdef0123456789abcdef";
const password = "Correct-horse-battery-9";
let logs: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  rpc.mockResolvedValue({ data: true, error: null });
  logs = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
});
afterEach(() => {
  for (const calls of logs.flatMap((l) => l.mock.calls))
    expect(JSON.stringify(calls)).not.toMatch(new RegExp(`${code}|${password}`, "i"));
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function fill(values: { code?: string; email?: string; pw?: string; confirm?: string } = {}) {
  fireEvent.change(screen.getByLabelText("Invitation code"), {
    target: { value: values.code ?? code.toUpperCase() },
  });
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: values.email ?? " invited@example.test " },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: values.pw ?? password } });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: values.confirm ?? values.pw ?? password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("invitation-only sign-up page", () => {
  it("shows a setup message and no form while the backend protection is not installed", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.invitation_signup_ready",
      },
    });
    render(<Page />);
    expect(
      await screen.findByRole("heading", { name: "Account creation is not set up yet" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Invitation code")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(rpc).toHaveBeenCalledWith("invitation_signup_ready");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("shows the setup message when installed but not switched on", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    render(<Page />);
    expect(await screen.findByText(/has not been switched on/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Invitation code")).toBeNull();
  });

  it("offers a retry, not a form, when readiness cannot be checked", async () => {
    rpc.mockRejectedValueOnce(new Error("offline"));
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Invitation code")).toBeInTheDocument();
  });

  it("sends the normalized code with Supabase sign-up and waits for email confirmation", async () => {
    signUp.mockResolvedValue({ data: { session: null, user: { id: "u" } }, error: null });
    render(<Page />);
    await screen.findByLabelText("Invitation code");
    expect(screen.getByLabelText("Invitation code")).toHaveAttribute("type", "password");
    fill();
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        email: "invited@example.test",
        password,
        options: {
          emailRedirectTo: "https://incident-command-harbor.lovable.app/login",
          data: { invitation_code: code },
        },
      }),
    );
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(code);
  });

  it("opens the dashboard when Supabase returns a session straight away", async () => {
    signUp.mockResolvedValue({
      data: { session: { access_token: "t" }, user: { id: "u" } },
      error: null,
    });
    render(<Page />);
    await screen.findByLabelText("Invitation code");
    fill();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true }));
  });

  it("explains a refused invitation (wrong, expired or used code) and keeps the form", async () => {
    signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: {
        status: 403,
        message:
          "A valid, unused Bastion invitation for this email address is required to create an account.",
      },
    });
    render(<Page />);
    await screen.findByLabelText("Invitation code");
    fill();
    expect(await screen.findByRole("alert")).toHaveTextContent("This invitation could not be used");
    expect(screen.getByLabelText("Invitation code")).toBeInTheDocument();
    signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { status: 500, message: "Database error saving new user" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(signUp).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Codes expire after 24 hours and work once",
    );
  });

  it("explains when sign-up is still disabled in Supabase, or the service is unreachable", async () => {
    signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: {
        status: 422,
        code: "signup_disabled",
        message: "Signups not allowed for this instance",
      },
    });
    render(<Page />);
    await screen.findByLabelText("Invitation code");
    fill();
    expect(await screen.findByRole("alert")).toHaveTextContent("not switched on yet");
    signUp.mockRejectedValue(new TypeError("Failed to fetch"));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the sign-up service"),
    );
  });

  it("checks the code and passwords before contacting Supabase", async () => {
    render(<Page />);
    await screen.findByLabelText("Invitation code");
    fill({ code: "too-short" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "complete 32-character invitation code",
    );
    fill({ pw: "short" });
    expect(screen.getByRole("alert")).toHaveTextContent("at least 8 characters");
    fill({ confirm: "Different-password-1" });
    expect(screen.getByRole("alert")).toHaveTextContent("do not match");
    expect(signUp).not.toHaveBeenCalled();
  });
});
