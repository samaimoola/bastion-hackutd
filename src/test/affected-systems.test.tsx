import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AffectedSystemForm, RealAffectedSystems } from "@/components/real-affected-systems";
import { addAffectedInput, editAffectedInput } from "@/lib/affected-system-models";
import { affectedOptions } from "@/lib/affected-system-queries";

const { add, edit, list, membership, onChange, removeChannel, subscribe } = vi.hoisted(() => ({ add: vi.fn(), edit: vi.fn(), list: vi.fn(), membership: vi.fn(), onChange: vi.fn(), removeChannel: vi.fn(), subscribe: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/affected-systems.functions", () => ({ addAffectedSystem: add, editAffectedSystem: edit, listAffectedSystems: list }));
vi.mock("@/lib/incidents.functions", () => ({ getIncidentMembership: membership, listIncidents: vi.fn(), getIncident: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { channel: () => ({ on: (...args: unknown[]) => { onChange(...args); return { subscribe }; } }), removeChannel } }));
const id = "11111111-1111-1111-1111-111111111111";
const row = { id: "22222222-2222-2222-2222-222222222222", incident_id: id, resource_name: "Server", data_description: "Files", assessment: "suspected", data_conditions: ["encrypted", "unavailable"], containment_status: "in progress", investigation_notes: "Investigating", created_by: id, updated_by: id, created_at: "2026-11-07T22:00:00Z", updated_at: "2026-11-07T22:00:00Z" };
const fields = { resourceName: "Server", dataDescription: "Files", assessment: "suspected", dataConditions: ["encrypted", "unavailable"], containmentStatus: "in progress", investigationNotes: "Investigating" };
beforeEach(() => { vi.clearAllMocks(); list.mockResolvedValue([]); membership.mockResolvedValue("commander"); subscribe.mockReturnValue({}); });
afterEach(cleanup);
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
it("rejects actor, time, role and incident-move overrides", () => {
  expect(addAffectedInput.safeParse({ ...fields, incidentId: id, createdBy: id }).success).toBe(false);
  expect(editAffectedInput.safeParse({ ...fields, id: row.id, incidentId: id }).success).toBe(false);
  expect(editAffectedInput.safeParse({ ...fields, id: row.id, updatedAt: "fake" }).success).toBe(false);
});
it("saves multiple conditions once and supports persistent reads on a fresh cache", async () => {
  let resolve: (value: typeof row) => void = () => {};
  add.mockImplementation(() => new Promise<typeof row>((done) => { resolve = done; }));
  const saved = vi.fn(); render(<QueryClientProvider client={client()}><AffectedSystemForm incidentId={id} userId="user" onSaved={saved} /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("System or resource name"), { target: { value: "Server" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "encrypted" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "unavailable" }));
  const form = screen.getByRole("button", { name: "Save system" }).closest("form"); if (!form) throw new Error("Missing form");
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
  expect(add.mock.calls[0]?.[0].data.dataConditions).toEqual(["unknown", "encrypted", "unavailable"]);
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await act(async () => resolve(row)); await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  list.mockResolvedValue([row]); expect(await client().fetchQuery(affectedOptions("user",id))).toEqual([row]);
});
it("keeps input after failed editing and updates by record ID without incident override", async () => {
  edit.mockRejectedValueOnce(new Error("Save denied"));
  render(<QueryClientProvider client={client()}><AffectedSystemForm incidentId={id} userId="user" record={row} onSaved={vi.fn()} /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("System or resource name"), { target: { value: "Updated" } });
  fireEvent.click(screen.getByRole("button", { name: "Save system" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save denied");
  expect(screen.getByLabelText("System or resource name")).toHaveValue("Updated");
  expect(edit.mock.calls[0]?.[0].data.id).toBe(row.id);
  expect(edit.mock.calls[0]?.[0].data.incidentId).toBeUndefined();
});
it("viewers cannot edit and realtime events refetch the incident-scoped list with cleanup", async () => {
  membership.mockResolvedValue("viewer"); const view = render(<QueryClientProvider client={client()}><RealAffectedSystems incidentId={id} userId="user" /></QueryClientProvider>);
  await screen.findByText("No affected systems recorded"); expect(screen.getByRole("button", { name: "Add system" })).toBeDisabled();
  expect(onChange.mock.calls[0]?.[1].filter).toBe(`incident_id=eq.${id}`);
  const event = onChange.mock.calls[0]?.[2]; if (typeof event !== "function") throw new Error("Missing event callback");
  await act(async () => event()); await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  view.unmount(); expect(removeChannel).toHaveBeenCalledOnce();
});