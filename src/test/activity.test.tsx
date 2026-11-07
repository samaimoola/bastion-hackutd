import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RealTimeline } from "@/components/real-timeline";
import { activityChanges, activityInput, activitySummary, type ActivityEvent } from "@/lib/activity-models";
import { activityKey, activityOptions } from "@/lib/activity-queries";
import { clearIncidentCache, incidentKeys } from "@/lib/incident-queries";
const mocks = vi.hoisted(() => ({ list: vi.fn(), membership: vi.fn(), on: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/activity.functions", () => ({ listIncidentActivity: mocks.list }));
vi.mock("@/lib/incidents.functions", () => ({ getIncidentMembership: mocks.membership, listIncidents: vi.fn(), getIncident: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { channel: () => {
  const channel = { on: (...args: unknown[]) => { mocks.on(...args); return channel; }, subscribe: () => channel }; return channel;
}, removeChannel: mocks.remove } }));
const incidentId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const event: ActivityEvent = { id: "33333333-3333-4333-8333-333333333333", incident_id: incidentId, actor_id: userId, actor_name: "Response lead", occurred_at: "2026-11-07T23:33:00Z", event_type: "incident_updated", entity_id: incidentId, details: { changes: { severity: { before: "High", after: "Critical" } } } };
const result = { events: [event], beganAt: "2026-11-07T23:32:00Z" };
const makeClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
function mount(client = makeClient()) {
  return { client, ...render(<QueryClientProvider client={client}><RealTimeline incidentId={incidentId} userId={userId} /></QueryClientProvider>) };
}
beforeEach(() => { vi.clearAllMocks(); mocks.membership.mockResolvedValue("viewer"); mocks.list.mockResolvedValue(result); });
afterEach(cleanup);
it("formats stored change details and excludes unrecognized metadata fields", () => {
  expect(activitySummary(event)).toBe("Severity changed from High to Critical");
  expect(activityChanges({ ...event, details: { changes: { severity: { before: "High", after: "Critical" }, token: { after: "not-an-activity-field" } } } })).toEqual([{ field: "severity", before: "High", after: "Critical" }]);
  expect(activityInput.safeParse({ incidentId, actorId: userId }).success).toBe(false);
});
it("viewers can read persistent activity but no manual recording controls are offered", async () => {
  mount(); await screen.findByRole("heading", { name: "Severity changed from High to Critical" });
  expect(screen.queryByRole("textbox")).toBeNull();
  const cache = await makeClient().fetchInfiniteQuery(activityOptions(userId, incidentId));
  expect(cache.pages[0]).toEqual(result);
});
it("shows an empty event list without fabricating historical entries", async () => {
  mocks.list.mockResolvedValue({ ...result, events: [] }); mount();
  await screen.findByText("No activity recorded yet");
  expect(screen.queryByRole("list", { name: "Incident activity" })).toBeNull();
});
it("renders stored text rather than executable markup", async () => {
  mocks.list.mockResolvedValue({ ...result, events: [{ ...event, details: { changes: { description: { before: "", after: "<script>bad()</script>" } } } }] }); mount();
  const text = await screen.findByText("None → <script>bad()</script>");
  expect(text.querySelector("script")).toBeNull();
});
it("incident-scoped live events refetch and unmount removes subscriptions and cache", async () => {
  const view = mount(); await screen.findByRole("list", { name: "Incident activity" });
  expect(mocks.on.mock.calls[0]?.[1]).toEqual({ event: "INSERT", schema: "public", table: "incident_activity", filter: `incident_id=eq.${incidentId}` });
  mocks.list.mockResolvedValue({ ...result, events: [{ ...event, event_type: "message_sent", details: { message_id: "reference", sender_id: userId } }] });
  await act(async () => mocks.on.mock.calls[0]?.[2]());
  await screen.findByRole("heading", { name: "Message sent" });
  view.unmount(); expect(mocks.remove).toHaveBeenCalledOnce();
  expect(view.client.getQueryData(activityKey(userId, incidentId))).toBeUndefined();
});
it("membership removal clears stored activity and disconnects the live subscription", async () => {
  const view = mount(); await screen.findByRole("list", { name: "Incident activity" });
  await act(async () => view.client.setQueryData(incidentKeys.membership(userId, incidentId), null));
  await screen.findByRole("alert");
  expect(screen.queryByRole("list", { name: "Incident activity" })).toBeNull();
  expect(view.client.getQueryData(activityKey(userId, incidentId))).toBeUndefined();
  expect(mocks.remove).toHaveBeenCalledOnce();
});
it("membership events recheck access and a failed check hides and discards activity", async () => {
  const view = mount(); await screen.findByRole("list", { name: "Incident activity" });
  mocks.membership.mockRejectedValue(new Error("Access check failed"));
  await act(async () => mocks.on.mock.calls[1]?.[2]());
  await screen.findByRole("alert");
  expect(view.client.getQueryData(activityKey(userId, incidentId))).toBeUndefined();
});
it("account transitions clear identity-scoped timeline caches", () => {
  const client = makeClient(); client.setQueryData(activityKey(userId, incidentId), result);
  clearIncidentCache(client); expect(client.getQueryData(activityKey(userId, incidentId))).toBeUndefined();
  expect(activityKey("another-user", incidentId)).not.toEqual(activityKey(userId, incidentId));
});
it("paginates using stable time and ID to avoid skipping equal-time events", () => {
  const options = activityOptions(userId, incidentId);
  const page = { ...result, events: Array.from({ length: 100 }, (_, i) => ({ ...event, id: `${i}` })) };
  expect(options.getNextPageParam?.(page, [page], undefined, [undefined])).toEqual({ time: event.occurred_at, id: "99" });
});