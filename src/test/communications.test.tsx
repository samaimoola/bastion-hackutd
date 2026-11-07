import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RealCommunications } from "@/components/real-communications";
import { messageAuthor, messageBody, sendMessageInput } from "@/lib/message-models";
import { messagesKey, messagesOptions } from "@/lib/message-queries";
import { clearIncidentCache, incidentKeys } from "@/lib/incident-queries";

const mocks = vi.hoisted(() => ({ list: vi.fn(), send: vi.fn(), membership: vi.fn(), on: vi.fn(), subscribe: vi.fn(), remove: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/messages.functions", () => ({ listIncidentMessages: mocks.list, sendIncidentMessage: mocks.send }));
vi.mock("@/lib/incidents.functions", () => ({ getIncidentMembership: mocks.membership, listIncidents: vi.fn(), getIncident: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { channel: () => {
  const channel = { on: (...args: unknown[]) => { mocks.on(...args); return channel; }, subscribe: (...args: unknown[]) => { mocks.subscribe(...args); return channel; } };
  return channel;
}, removeChannel: mocks.remove } }));
const id = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const row = { id: "33333333-3333-4333-8333-333333333333", incident_id: id, sender_id: user, author_name: "Response lead", created_at: "2026-11-07T23:00:00Z", body: "Backup checks started", request_id: "44444444-4444-4444-8444-444444444444" };
const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
function mount(client = makeClient(), userId = user) {
  return { client, ...render(<QueryClientProvider client={client}><RealCommunications incidentId={id} userId={userId} /></QueryClientProvider>) };
}
beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([]); mocks.membership.mockResolvedValue("commander"); mocks.send.mockResolvedValue(row); });
afterEach(cleanup);
it("limits plain text to 1–4000 characters and forbids sender/time/role overrides", () => {
  expect(messageBody.safeParse("Hi").success).toBe(true);
  expect(messageBody.safeParse(" \n\t").success).toBe(false);
  expect(messageBody.safeParse("x".repeat(4000)).success).toBe(true);
  expect(messageBody.safeParse("x".repeat(4001)).success).toBe(false);
  for (const extra of [{ senderId: user }, { createdAt: row.created_at }, { role: "commander" }]) expect(sendMessageInput.safeParse({ incidentId: id, body: "Update", requestId: row.request_id, ...extra }).success).toBe(false);
});
it("provides a readable fallback without treating a display name as identity", () => {
  expect(messageAuthor({ sender_id: user, author_name: null })).toBe("Member 22222222");
  expect(messageAuthor(row)).toBe("Response lead");
});
it("prevents concurrent duplicate sends and reads persisted messages from a fresh cache", async () => {
  let resolve: (value: typeof row) => void = () => {};
  mocks.send.mockImplementation(() => new Promise<typeof row>((done) => { resolve = done; }));
  mount();
  fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Backup checks started" } });
  const form = screen.getByRole("button", { name: "Send message" }).closest("form");
  if (!form) throw new Error("Missing composer");
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
  expect(mocks.send.mock.calls[0]?.[0].data).toMatchObject({ incidentId: id, body: "Backup checks started" });
  expect(mocks.send.mock.calls[0]?.[0].data.senderId).toBeUndefined();
  expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
  mocks.list.mockResolvedValue([row]); await act(async () => resolve(row));
  await screen.findByText("Backup checks started");
  expect(screen.getByLabelText("Message")).toHaveValue("");
  const saved = await makeClient().fetchInfiniteQuery(messagesOptions(user, id));
  expect(saved.pages[0]).toEqual([row]);
});
it("keeps failed drafts and retries with the same duplicate-send reference", async () => {
  mocks.send.mockRejectedValueOnce(new Error("Send failed")); mount();
  fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Retry update" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Message")).toHaveValue("Retry update");
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
  expect(mocks.send.mock.calls[0]?.[0].data.requestId).toBe(mocks.send.mock.calls[1]?.[0].data.requestId);
});
it("viewers read but cannot send and malicious-looking content remains literal text", async () => {
  mocks.membership.mockResolvedValue("viewer"); mocks.list.mockResolvedValue([{ ...row, body: "<img src=x onerror=alert(1)><script>bad()</script>" }]); mount();
  const body = await screen.findByText("<img src=x onerror=alert(1)><script>bad()</script>");
  expect(body.querySelector("img,script")).toBeNull();
  expect(screen.queryByLabelText("Message")).toBeNull();
  expect(mocks.send).not.toHaveBeenCalled();
});
it("refetches live messages only for the current incident and cleans up on unmount", async () => {
  const view = mount(); await screen.findByText("No messages yet");
  expect(mocks.on.mock.calls[0]?.[1]).toMatchObject({ table: "incident_messages", event: "INSERT", filter: `incident_id=eq.${id}` });
  mocks.list.mockResolvedValue([row]);
  await act(async () => mocks.on.mock.calls[0]?.[2]());
  await screen.findByText("Backup checks started");
  view.unmount(); expect(mocks.remove).toHaveBeenCalledOnce();
  expect(view.client.getQueryData(messagesKey(user, id))).toBeUndefined();
});
it("clears messages and closes the subscription when membership is removed", async () => {
  mocks.list.mockResolvedValue([row]); const view = mount();
  await screen.findByText("Backup checks started");
  await act(async () => { view.client.setQueryData(incidentKeys.membership(user, id), null); });
  await screen.findByRole("alert");
  expect(screen.queryByText("Backup checks started")).toBeNull();
  expect(screen.queryByLabelText("Message")).toBeNull();
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(view.client.getQueryData(messagesKey(user, id))).toBeUndefined();
});
it("rechecks membership on live membership events and fails closed if the check fails", async () => {
  mocks.list.mockResolvedValue([row]); const view = mount(); await screen.findByText("Backup checks started");
  mocks.membership.mockRejectedValue(new Error("Access unavailable"));
  await act(async () => mocks.on.mock.calls[1]?.[2]());
  await screen.findByRole("alert");
  expect(screen.queryByText("Backup checks started")).toBeNull();
  expect(view.client.getQueryData(messagesKey(user, id))).toBeUndefined();
});
it("clears account-scoped message caches through the existing account transition cleanup", async () => {
  const client = makeClient(); client.setQueryData(messagesKey(user, id), { pages: [[row]], pageParams: [undefined] });
  clearIncidentCache(client);
  expect(client.getQueryData(messagesKey(user, id))).toBeUndefined();
  expect(messagesKey("another-user", id)).not.toEqual(messagesKey(user, id));
});
it("keeps a stable timestamp-and-ID cursor when loading earlier messages", () => {
  const options = messagesOptions(user, id);
  const rows = Array.from({ length: 100 }, (_, i) => ({ ...row, id: `${i}` }));
  expect(options.getNextPageParam?.(rows, [rows], undefined, [undefined])).toEqual({ time: row.created_at, id: "99" });
});