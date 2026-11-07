import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IncidentTeamPanel } from "@/components/incident-team-access";

const { members, membership, issue, change, remove } = vi.hoisted(() => ({ members: vi.fn(), membership: vi.fn(), issue: vi.fn(), change: vi.fn(), remove: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/incidents.functions", () => ({ getIncidentMembership: membership, getIncident: vi.fn(), listIncidents: vi.fn() }));
vi.mock("@/lib/incident-access.functions", () => ({ listIncidentMembers: members, issueIncidentInvitation: issue, changeIncidentMember: change, removeIncidentMember: remove }));
const id = "11111111-1111-1111-1111-111111111111";
const userId = "22222222-2222-2222-2222-222222222222";
beforeEach(() => { vi.clearAllMocks(); members.mockResolvedValue([{ user_id: userId, role: "commander" }, { user_id: "33333333-3333-3333-3333-333333333333", role: "viewer" }]); });
afterEach(cleanup);
function mount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IncidentTeamPanel id={id} userId={userId} /></QueryClientProvider>); }
it("loads only the current incident roster and protects its last commander", async () => {
  membership.mockResolvedValue("commander"); mount();
  await screen.findByRole("button", { name: "Generate invitation link" });
  expect(members).toHaveBeenCalledWith({ data: { id } });
  expect(screen.getByRole("combobox", { name: `Role for ${userId}` })).toBeDisabled();
  expect(screen.getByRole("button", { name: `Remove access for ${userId}` })).toBeDisabled();
});
it("does not expose invitation or membership controls to viewers", async () => {
  membership.mockResolvedValue("viewer"); mount();
  await screen.findByText("Only commanders can invite people or change access.");
  expect(screen.queryByRole("button", { name: "Generate invitation link" })).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
});
it("generates a responder invitation using the existing incident only", async () => {
  membership.mockResolvedValue("commander"); issue.mockResolvedValue({ token: "a".repeat(64), expiresAt: "2026-11-09T00:00:00Z" }); mount();
  fireEvent.click(await screen.findByRole("button", { name: "Generate invitation link" }));
  await waitFor(() => expect(issue).toHaveBeenCalledWith({ data: { id, role: "responder" } }));
  const url = new URL((screen.getByLabelText("Invitation link") as HTMLInputElement).value);
  expect(url.origin).toBe("https://incident-command-harbor.lovable.app");
  expect(url.pathname).toBe("/invite");
  expect(url.search).toBe("");
  expect(url.hash === `#invite=${"a".repeat(64)}`).toBe(true);
});