// Welcome page, session gate and sign-in redirects. Supabase is mocked; no hosted auth.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { getUser, signIn, navigate } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signIn: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<object>()),
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => navigate,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser, signInWithPassword: signIn } },
}));
vi.mock("@/components/guide-session", () => ({
  GuideSessionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/guide-launcher", () => ({ GuideLauncher: () => null }));

import { Route as WelcomeRoute } from "@/routes/index";
import { Route as LoginRoute } from "@/routes/login";
import { Route as GateRoute } from "@/routes/_authenticated/route";

type Options = { component: () => ReactNode; beforeLoad?: () => Promise<unknown> };
const opts = (r: unknown) => (r as { options: Options }).options;

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  navigate.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("public welcome page", () => {
  it("leads to the dashboard, sign-in and invitation-only account creation", () => {
    const Welcome = opts(WelcomeRoute).component;
    const { container } = render(<Welcome />);
    expect(screen.getByRole("heading", { level: 1, name: "Bastion" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Enter dashboard/ })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create an account with an invitation" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Have an invitation code? Create your account" })).toHaveAttribute("href", "/signup");
    expect(screen.queryByRole("link", { name: /^sign up$|join your team/i })).toBeNull();
    expect(screen.getByText(/Accounts are invitation-only/)).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("alt", ""); // decorative, hidden from screen readers
  });
});

describe("session gate", () => {
  it("sends signed-out visitors (including /dashboard) to sign-in", async () => {
    await expect(opts(GateRoute).beforeLoad!()).rejects.toMatchObject({
      options: { to: "/login" },
    });
  });
  it("lets signed-in users through with their identity", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
    await expect(opts(GateRoute).beforeLoad!()).resolves.toEqual({ authUser: { id: "user-a" } });
  });
});

describe("sign-in redirects", () => {
  it("opens /dashboard after a successful sign-in", async () => {
    signIn.mockResolvedValue({ error: null });
    const Login = opts(LoginRoute).component;
    render(<Login />);
    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "a@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true }));
  });
  it("sends an already signed-in visitor straight to /dashboard", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-a" } }, error: null });
    const Login = opts(LoginRoute).component;
    render(<Login />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true }));
  });
});
