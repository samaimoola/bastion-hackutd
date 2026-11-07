import { expect, it, vi } from "vitest";

type Recorded = { middleware: unknown[]; validator: { parse: (input: unknown) => unknown }; handler: (args: { data: unknown; context: unknown }) => Promise<unknown> };
const { auth } = vi.hoisted(() => ({ auth: {} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: auth }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const record = {} as Recorded;
  const chain = { middleware: (value: unknown[]) => { record.middleware = value; return chain; }, inputValidator: (value: Recorded["validator"]) => { record.validator = value; return chain; }, handler: (value: Recorded["handler"]) => { record.handler = value; return record; } };
  return chain;
} }));
import { listIncidentMessages, sendIncidentMessage } from "@/lib/messages.functions";
const list = listIncidentMessages as unknown as Recorded;
const send = sendIncidentMessage as unknown as Recorded;
const id = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
it("protects both reads and sends with verified-session middleware", () => {
  expect(list.middleware).toEqual([auth]); expect(send.middleware).toEqual([auth]);
});
it("maps only message text, incident and duplicate-send reference to the user-scoped RPC", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { id: requestId }, error: null });
  const result = await send.handler({ data: send.validator.parse({ incidentId: id, body: " Update ", requestId }), context: { userId: "verified", supabase: { rpc } } });
  expect(rpc).toHaveBeenCalledWith("send_incident_message", { _incident_id: id, _body: "Update", _request_id: requestId });
  expect(result).toEqual({ id: requestId });
});
it("reports database denial without leaking internal errors", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "private database detail" } });
  await expect(send.handler({ data: { incidentId: id, body: "Update", requestId }, context: { supabase: { rpc } } })).rejects.toThrow("Only commanders and responders with current incident access can send messages.");
});
it("rejects inaccessible incidents before retrieving messages", async () => {
  const from = vi.fn();
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
  from.mockReturnValue(query);
  await expect(list.handler({ data: { incidentId: id }, context: { supabase: { from } } })).rejects.toThrow("no longer have access");
  expect(from).toHaveBeenCalledTimes(1); expect(from).toHaveBeenCalledWith("incidents");
});
it("uses bounded incident-scoped reads and a timestamp/ID cursor", async () => {
  const calls = { eq: vi.fn(), order: vi.fn(), or: vi.fn(), limit: vi.fn() };
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => { calls.eq(...args); return query; },
    order: (...args: unknown[]) => { calls.order(...args); return query; },
    or: (...args: unknown[]) => { calls.or(...args); return query; },
    limit: (...args: unknown[]) => { calls.limit(...args); return query; },
    maybeSingle: async () => ({ data: { id }, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  const before = { time: "2026-11-07T23:00:00Z", id: requestId };
  await list.handler({ data: list.validator.parse({ incidentId: id, before }), context: { supabase: { from: () => query } } });
  expect(calls.eq).toHaveBeenCalledWith("incident_id", id);
  expect(calls.limit).toHaveBeenCalledWith(100);
  expect(calls.order).toHaveBeenCalledWith("id", { ascending: false });
  expect(calls.or).toHaveBeenCalledWith(`created_at.lt.${before.time},and(created_at.eq.${before.time},id.lt.${requestId})`);
});