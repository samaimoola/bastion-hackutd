// Frontend integration tests with mocked RPCs. These do not verify hosted Supabase.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NewIncidentForm } from "@/components/new-incident-form";
import { clearIncidentCache, incidentDetailOptions, incidentKeys, incidentListOptions } from "@/lib/incident-queries";

const { create, list, get } = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/incidents.functions", () => ({ createIncident: create, listIncidents: list, getIncident: get }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

const record = { id: "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b", title: "VPN compromise", summary: "Confirmed login anomaly", severity: "Medium" as const, stage: "Detection" as const, declaredAt: "2026-11-07T22:00:00Z", lastUpdate: "2026-11-07T22:00:00Z" };
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Real incident query boundary", () => {
  it("loads accessible incidents through listIncidents and supports an empty list", async () => {
    const client = newClient();
    list.mockResolvedValueOnce([record]).mockResolvedValueOnce([]);
    expect(await client.fetchQuery(incidentListOptions("user-a"))).toEqual([record]);
    expect(await client.fetchQuery(incidentListOptions("user-a"))).toEqual([]);
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("loads by ID on a fresh cache, including after refresh", async () => {
    get.mockResolvedValue(record);
    expect(await newClient().fetchQuery(incidentDetailOptions("user-a", record.id))).toEqual(record);
    expect(await newClient().fetchQuery(incidentDetailOptions("user-a", record.id))).toEqual(record);
    expect(get.mock.calls).toEqual([[{ data: { id: record.id } }], [{ data: { id: record.id } }]]);
  });
  it("never falls back to demo records for inaccessible IDs or failed list requests", async () => {
    get.mockRejectedValue(new Error("Incident not found."));
    list.mockRejectedValue(new Error("Incidents could not be loaded. Please try again."));
    await expect(newClient().fetchQuery(incidentDetailOptions("user-a", record.id))).rejects.toThrow("Incident not found.");
    await expect(newClient().fetchQuery(incidentListOptions("user-a"))).rejects.toThrow();
  });
  it("uses separate keys per account and clears prior incident caches", () => {
    const client = newClient();
    client.setQueryData(incidentKeys.list("user-a"), [record]);
    client.setQueryData(incidentKeys.detail("user-a", record.id), record);
    expect(client.getQueryData(incidentKeys.list("user-b"))).toBeUndefined();
    clearIncidentCache(client);
    expect(client.getQueriesData({ queryKey: incidentKeys.all })).toEqual([]);
  });
  it("cancels an old request so it cannot restore removed data after account change", async () => {
    let resolve: (value: typeof record[]) => void = () => {};
    list.mockImplementation(() => new Promise<typeof record[]>((done) => { resolve = done; }));
    const client = newClient();
    const pending = client.fetchQuery(incidentListOptions("user-a")).catch(() => undefined);
    clearIncidentCache(client);
    resolve([record]);
    await pending;
    expect(client.getQueryData(incidentKeys.list("user-a"))).toBeUndefined();
    expect(client.getQueryData(incidentKeys.list("user-b"))).toBeUndefined();
  });
});

describe("New incident submission", () => {
  function mount(onCreated = vi.fn().mockResolvedValue(undefined)) {
    const client = newClient();
    client.setQueryData(incidentKeys.list("user-a"), []);
    render(<QueryClientProvider client={client}><NewIncidentForm userId="user-a" onCreated={onCreated} /></QueryClientProvider>);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  VPN compromise  " } });
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: "Confirmed login anomaly" } });
    return { client, onCreated };
  }
  it("sends all four fields, locks duplicate submissions, invalidates the list and opens the returned ID", async () => {
    let resolve: (value: typeof record) => void = () => {};
    create.mockImplementation(() => new Promise<typeof record>((done) => { resolve = done; }));
    const { client, onCreated } = mount();
    const submit = screen.getByRole("button", { name: "Create incident" });
    const form = submit.closest("form");
    if (!form) throw new Error("Form missing");
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toEqual({ data: { title: "VPN compromise", description: "Confirmed login anomaly", severity: "Medium", stage: "Detection" } });
    await act(async () => resolve(record));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(record));
    expect(client.getQueryState(incidentKeys.list("user-a"))?.isInvalidated).toBe(true);
    expect(client.getQueryData(incidentKeys.detail("user-a", record.id))).toEqual(record);
    fireEvent.submit(form);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("retains input after failure and permits retry without opening a workspace", async () => {
    create.mockRejectedValueOnce(new Error("Submission failed")).mockResolvedValueOnce(record);
    const { onCreated } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Create incident" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create incident" })).toBeEnabled());
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("  VPN compromise  ");
    fireEvent.click(screen.getByRole("button", { name: "Create incident" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(record));
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("does not recreate a saved incident if workspace navigation fails", async () => {
    create.mockResolvedValue(record);
    const onCreated = vi.fn().mockRejectedValue(new Error("Navigation failed"));
    mount(onCreated);
    fireEvent.click(screen.getByRole("button", { name: "Create incident" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Open saved incident" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Open saved incident" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));
    expect(create).toHaveBeenCalledTimes(1);
  });
});