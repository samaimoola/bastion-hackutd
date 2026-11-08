// Commander "Invite someone without an account" section, with server functions mocked.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const { status, issue } = vi.hoisted(() => ({ status: vi.fn(), issue: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/signup-invitations.functions", () => ({
  getSignupInvitationStatus: status,
  issueSignupInvitation: issue,
}));
import { SignupInvitation } from "@/components/signup-invitation";
const id = "11111111-1111-1111-1111-111111111111";
const userId = "22222222-2222-2222-2222-222222222222";
const code = "fedcba9876543210fedcba9876543210";
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);
const mount = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SignupInvitation incidentId={id} userId={userId} />
    </QueryClientProvider>,
  );

it("shows a setup message and no form until account invitations are switched on", async () => {
  status.mockResolvedValue({ readiness: "not_ready" });
  mount();
  expect(
    await screen.findByText(/Account invitations are not set up for this workspace yet/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create invitation code" })).toBeNull();
});

it("creates a one-use code for one email and role, shown once", async () => {
  status.mockResolvedValue({ readiness: "ready" });
  issue.mockResolvedValue({
    code,
    email: "new@example.test",
    role: "viewer",
    expiresAt: "2026-11-09T00:00:00Z",
  });
  mount();
  fireEvent.change(await screen.findByLabelText("Their email"), {
    target: { value: " New@Example.test " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create invitation code" }));
  await waitFor(() =>
    expect(issue).toHaveBeenCalledWith({ data: { id, email: "new@example.test", role: "viewer" } }),
  );
  expect(
    ((await screen.findByLabelText("Account invitation code")) as HTMLInputElement).value,
  ).toBe(code);
  expect(screen.getByText(/For new@example.test · Viewer/)).toBeInTheDocument();
  expect(screen.getByText(/shown only once/)).toHaveTextContent(
    "https://incident-command-harbor.lovable.app/signup",
  );
});

it("rejects an invalid email locally and shows server refusals", async () => {
  status.mockResolvedValue({ readiness: "ready" });
  issue.mockRejectedValue(
    new Error("Only a current commander of this incident can invite new accounts."),
  );
  mount();
  fireEvent.change(await screen.findByLabelText("Their email"), {
    target: { value: "not-an-email" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create invitation code" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
  expect(issue).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Their email"), { target: { value: "ok@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Create invitation code" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Only a current commander");
  expect(screen.queryByLabelText("Account invitation code")).toBeNull();
});
