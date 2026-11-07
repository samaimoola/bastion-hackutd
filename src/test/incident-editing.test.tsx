// Mocked user-scoped calls: these verify UI wiring, not hosted sessions.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditIncidentAction, EditIncidentForm } from "@/components/edit-incident-action";
import { incidentKeys } from "@/lib/incident-queries";
import { canEditIncident, type IncidentMemberRole } from "@/lib/incident-models";

const { update, membership } = vi.hoisted(() => ({ update: vi.fn(), membership: vi.fn() }));
vi.mock("@/lib/incidents.functions", () => ({ updateIncident: update, getIncidentMembership: membership, getIncident: vi.fn(), listIncidents: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
const incident = { id: "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b", title: "Real incident", summary: "Recorded description", severity: "High" as const, stage: "Recovery" as const, declaredAt: "2026-11-07T22:00:00Z", lastUpdate: "2026-11-07T22:00:00Z" };
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it.each<[IncidentMemberRole | null, boolean]>([["commander", true], ["responder", true], ["viewer", false], [null, false]])("permits editing only for actual membership %s", async (role, allowed) => {
  expect(canEditIncident(role)).toBe(allowed);
  membership.mockResolvedValue(role);
  render(<QueryClientProvider client={newClient()}><EditIncidentAction incident={incident} userId="user-a" /></QueryClientProvider>);
  await waitFor(() => expect(membership).toHaveBeenCalled());
  await waitFor(() => {
    const button = screen.getByRole("button", { name: "Edit incident" });
    if (allowed) expect(button).toBeEnabled(); else expect(button).toBeDisabled();
  });
});

it("keeps editing disabled when membership lookup fails", async () => {
  membership.mockRejectedValue(new Error("Unavailable"));
  render(<QueryClientProvider client={newClient()}><EditIncidentAction incident={incident} userId="user-a" /></QueryClientProvider>);
  await screen.findByRole("button", { name: "Retry membership check" });
  expect(screen.getByRole("button", { name: "Edit incident" })).toBeDisabled();
});

it("submits all four fields once and refreshes displayed detail and list caches", async () => {
  const client = newClient();
  client.setQueryData(incidentKeys.detail("user-a", incident.id), incident);
  client.setQueryData(incidentKeys.list("user-a"), [incident]);
  client.setQueryData(incidentKeys.membership("user-a", incident.id), "commander");
  let resolve: (value: typeof incident) => void = () => {};
  update.mockImplementation(() => new Promise<typeof incident>((done) => { resolve = done; }));
  const saved = vi.fn();
  render(<QueryClientProvider client={client}><EditIncidentForm incident={incident} userId="user-a" onSaved={saved} /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Updated incident" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Updated description" } });
  const form = screen.getByRole("button", { name: "Save changes" }).closest("form");
  if (!form) throw new Error("Missing edit form");
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(update.mock.calls[0]?.[0]).toEqual({ data: { id: incident.id, title: "Updated incident", description: "Updated description", severity: "High", stage: "Recovery" } });
  const changed = { ...incident, title: "Updated incident", summary: "Updated description" };
  await act(async () => resolve(changed));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(client.getQueryData(incidentKeys.detail("user-a", incident.id))).toEqual(changed);
  expect(client.getQueryState(incidentKeys.detail("user-a", incident.id))?.isInvalidated).toBe(true);
  expect(client.getQueryState(incidentKeys.list("user-a"))?.isInvalidated).toBe(true);
});

it("retains entered values and permits retry after a denied save", async () => {
  update.mockRejectedValueOnce(new Error("You do not have permission to do that.")).mockResolvedValueOnce(incident);
  const saved = vi.fn();
  render(<QueryClientProvider client={newClient()}><EditIncidentForm incident={incident} userId="user-a" onSaved={saved} /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Keep my input" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission");
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Title")).toHaveValue("Keep my input");
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
});