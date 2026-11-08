import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: () => ReactNode }) => ({ options }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null } }), signInWithPassword: vi.fn() },
  },
}));
import { Route } from "@/routes/login";

afterEach(cleanup);
const Login = (Route as unknown as { options: { component: () => ReactNode } }).options.component;

describe("sign-in page: access during an outage", () => {
  it("offers a collapsed, accurate explanation without new sign-in paths", () => {
    const { container } = render(<Login />);
    const details = [...container.querySelectorAll("details")].find(
      (d) => d.querySelector("summary")?.textContent === "Access during an outage",
    )!;
    expect(details).toBeDefined();
    expect(details.open).toBe(false);
    expect(details).toHaveTextContent("does not use your company\u2019s single sign-on or VPN");
    expect(details).toHaveTextContent("nothing is sent to your email or phone");
    expect(details).toHaveTextContent("Bastion does not work offline");
    expect(details).toHaveTextContent("no self-service password reset");
    expect(screen.queryByRole("link", { name: /sign up|create account|forgot/i })).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).not.toContain("Sign up");
  });

  it("keeps public signup disabled in the Supabase configuration", () => {
    const config = readFileSync(`${process.cwd()}/supabase/config.toml`, "utf8");
    expect(config.match(/enable_signup = false/g)).toHaveLength(2);
    expect(config).not.toMatch(/enable_signup = true/);
  });
});
