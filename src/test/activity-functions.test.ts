import { expect, it, vi } from "vitest";
type Recorded = { middleware: unknown[]; validator: { parse: (input: unknown) => unknown }; handler: (args: { data: unknown; context: unknown }) => Promise<unknown> };
const { auth } = vi.hoisted(() => ({ auth: {} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: auth }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const record = {} as Recorded;
  const chain = { middleware: (value: unknown[]) => { record.middleware = value; return chain; }, inputValidator: (value: Recorded["validator"]) => { record.validator = value; return chain; }, handler: (value: Recorded["handler"]) => { record.handler = value; return record; } }; return chain;
} }));
import { listIncidentActivity } from "@/lib/activity.functions";
const fn = listIncidentActivity as unknown as Recorded;
const id = "11111111-1111-4111-8111-111111111111";
it("requires verified authentication for timeline reads", () => { expect(fn.middleware).toEqual([auth]); });
it("refuses a missing or inaccessible incident before reading activity", async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
  const from = vi.fn().mockReturnValue(query);
  await expect(fn.handler({ data: { incidentId: id }, context: { supabase: { from } } })).rejects.toThrow("no longer have access");
  expect(from).toHaveBeenCalledOnce(); expect(from).toHaveBeenCalledWith("incidents");
});
it("uses incident-scoped bounded pagination and the database recording start", async () => {
  const calls = { from: vi.fn(), eq: vi.fn(), or: vi.fn(), limit: vi.fn() };
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => { calls.eq(...args); return query; },
    order: () => query,
    or: (...args: unknown[]) => { calls.or(...args); return query; },
    limit: (...args: unknown[]) => { calls.limit(...args); return query; },
    maybeSingle: async () => ({ data: { id }, error: null }),
    single: async () => ({ data: { began_at: "2026-11-07T23:32:00Z" }, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  const before = { time: "2026-11-07T23:33:00Z", id };
  const result = await fn.handler({ data: fn.validator.parse({ incidentId: id, before }), context: { supabase: { from: (...args: unknown[]) => { calls.from(...args); return query; } } } });
  expect(calls.eq).toHaveBeenCalledWith("incident_id", id);
  expect(calls.limit).toHaveBeenCalledWith(100);
  expect(calls.or).toHaveBeenCalledWith(`occurred_at.lt.${before.time},and(occurred_at.eq.${before.time},id.lt.${id})`);
  expect(result).toEqual({ events: [], beganAt: "2026-11-07T23:32:00Z" });
});