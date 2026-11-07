// MOCKED tests. The framework's createServerFn is replaced by a recorder, and the Supabase client
// is a hand-written fake that records calls. These check wiring, validation, argument mapping and
// error handling. They do NOT prove that the live database, RLS policies or RPC behave this way.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

type Rec = {
  opts: unknown;
  middleware: unknown[];
  validator?: { parse: (v: unknown) => unknown } | undefined;
  handler: (a: { data?: unknown; context: unknown }) => Promise<unknown>;
};

const { REQUIRE_AUTH } = vi.hoisted(() => ({
  REQUIRE_AUTH: { name: "requireSupabaseAuth (mock)" },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: (opts: unknown) => {
    const rec = { opts, middleware: [] as unknown[] } as Rec;
    const chain = {
      middleware: (m: unknown[]) => ((rec.middleware = m), chain),
      inputValidator: (v: Rec["validator"]) => ((rec.validator = v), chain),
      handler: (fn: Rec["handler"]) => ((rec.handler = fn), { rec }),
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: REQUIRE_AUTH }));

import * as incidentFns from "@/lib/incidents.functions";

// Under the mock above, each exported function is the recorder `{ rec }`, not the framework type.
type Recorded = { rec: Rec };
const createIncident = incidentFns.createIncident as unknown as Recorded;
const listIncidents = incidentFns.listIncidents as unknown as Recorded;
const getIncident = incidentFns.getIncident as unknown as Recorded;

const UUID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
const ROW = {
  id: UUID,
  title: "Ransomware on FS-01",
  description: "Summary",
  severity: "Critical",
  response_stage: "Containment",
  created_at: "2026-11-07T06:42:00Z",
  updated_at: "2026-11-07T18:55:00Z",
};
const RECORD = {
  id: UUID,
  title: "Ransomware on FS-01",
  severity: "Critical",
  stage: "Containment",
  declaredAt: "2026-11-07T06:42:00Z",
  lastUpdate: "2026-11-07T18:55:00Z",
  summary: "Summary",
};
const DB_ERROR = {
  code: "XX000",
  message: 'relation "public.incidents" does not exist',
  details: "secret detail",
  hint: "secret hint",
};

// Fake user-scoped client. Every call is recorded; results are set per test.
function fakeClient() {
  const calls: {
    rpc: unknown[][];
    select: unknown[][];
    order: unknown[][];
    eq: unknown[][];
    from: unknown[][];
  } = {
    rpc: [],
    select: [],
    order: [],
    eq: [],
    from: [],
  };
  const state: { rpc: unknown; list: unknown; one: unknown } = {
    rpc: { data: ROW, error: null },
    list: { data: [ROW], error: null },
    one: { data: ROW, error: null },
  };
  const query = {
    select: (...a: unknown[]) => (calls.select.push(a), query),
    order: (...a: unknown[]) => (calls.order.push(a), Promise.resolve(state.list)),
    eq: (...a: unknown[]) => (calls.eq.push(a), query),
    maybeSingle: () => Promise.resolve(state.one),
  };
  const supabase = {
    rpc: (...a: unknown[]) => (calls.rpc.push(a), Promise.resolve(state.rpc)),
    from: (...a: unknown[]) => (calls.from.push(a), query),
  };
  return { supabase, calls, state };
}

// Mirrors the framework: validate input, then run the handler with a context.
async function run(fn: { rec: Rec }, data: unknown, client = fakeClient()) {
  const validated = fn.rec.validator ? fn.rec.validator.parse(data) : data;
  const result = await fn.rec.handler({
    data: validated,
    context: { supabase: client.supabase, userId: "caller-id", claims: {} },
  });
  return { result, client };
}

describe("authentication wiring", () => {
  it.each([
    ["createIncident", createIncident, "POST"],
    ["listIncidents", listIncidents, "GET"],
    ["getIncident", getIncident, "GET"],
  ])("%s is protected by requireSupabaseAuth only", (_name, fn, method) => {
    expect(fn.rec.middleware).toEqual([REQUIRE_AUTH]);
    expect(fn.rec.opts).toEqual({ method });
  });

  it("uses the user-scoped client from context, never the service-role client", () => {
    for (const file of ["incidents.functions.ts", "incident-models.ts"]) {
      const src = readFileSync(path.resolve(__dirname, "../lib", file), "utf8");
      expect(src).not.toMatch(/client\.server/);
      expect(src).not.toMatch(/supabaseAdmin/);
      expect(src).not.toMatch(/SERVICE_ROLE/i);
    }
  });
});

describe("createIncident", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls create_incident with only the title when nothing else is given", async () => {
    const { client, result } = await run(createIncident, { title: "  Ransomware on FS-01 " });
    expect(client.calls.rpc).toEqual([["create_incident", { _title: "Ransomware on FS-01" }]]);
    expect(result).toEqual(RECORD);
  });

  it("maps every optional input to the real RPC parameter names and invents none", async () => {
    const { client } = await run(createIncident, {
      title: "T",
      description: "D",
      severity: "High",
      stage: "Recovery",
    });
    expect(client.calls.rpc).toEqual([
      [
        "create_incident",
        { _title: "T", _description: "D", _severity: "High", _response_stage: "Recovery" },
      ],
    ]);
  });

  it("does not send a creator or caller id (the database derives it from the session)", async () => {
    const { client } = await run(createIncident, { title: "T" });
    expect(JSON.stringify(client.calls.rpc)).not.toMatch(/creator|caller|user_id|_user/i);
  });

  it("rejects invalid input before the database is called", async () => {
    const client = fakeClient();
    for (const bad of [
      {},
      { title: "   " },
      { title: "T", severity: "Urgent" },
      { title: "T", creator_id: UUID },
    ]) {
      await expect(run(createIncident, bad, client)).rejects.toThrow();
    }
    expect(client.calls.rpc).toHaveLength(0);
  });

  it("returns a fixed message for a database error and leaks no internals", async () => {
    const client = fakeClient();
    client.state.rpc = { data: null, error: DB_ERROR };
    const err = await run(createIncident, { title: "T" }, client).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("The incident could not be created. Please try again.");
    expect((err as Error).message).not.toMatch(/relation|secret|XX000/);
  });

  it("preserves the database permission decision as a clear message", async () => {
    const client = fakeClient();
    client.state.rpc = {
      data: null,
      error: { ...DB_ERROR, code: "42501", message: "Authentication required" },
    };
    await expect(run(createIncident, { title: "T" }, client)).rejects.toThrow(
      "You do not have permission to do that.",
    );
  });

  it("fails cleanly if the database returns neither a row nor an error", async () => {
    const client = fakeClient();
    client.state.rpc = { data: null, error: null };
    await expect(run(createIncident, { title: "T" }, client)).rejects.toThrow(
      "The incident could not be created. Please try again.",
    );
  });
});

describe("listIncidents", () => {
  it("selects only the incident columns, newest update first, with no filter of its own", async () => {
    const { client, result } = await run(listIncidents, undefined);
    expect(client.calls.from).toEqual([["incidents"]]);
    expect(String(client.calls.select[0]?.[0])).not.toMatch(/creator_id|\*/);
    expect(client.calls.order).toEqual([["updated_at", { ascending: false }]]);
    // Membership is enforced by row-level security; the function adds no user filter.
    expect(client.calls.eq).toHaveLength(0);
    expect(result).toEqual([RECORD]);
  });

  it("returns an empty list when the user has no incidents", async () => {
    const client = fakeClient();
    client.state.list = { data: [], error: null };
    expect((await run(listIncidents, undefined, client)).result).toEqual([]);
  });

  it("returns a fixed message for a database error", async () => {
    const client = fakeClient();
    client.state.list = { data: null, error: DB_ERROR };
    const err = await run(listIncidents, undefined, client).catch((e: Error) => e);
    expect((err as Error).message).toBe("Incidents could not be loaded. Please try again.");
    expect((err as Error).message).not.toMatch(/relation|secret/);
  });
});

describe("getIncident", () => {
  it("queries by id through the user-scoped client and returns the mapped record", async () => {
    const { client, result } = await run(getIncident, { id: UUID });
    expect(client.calls.eq).toEqual([["id", UUID]]);
    expect(result).toEqual(RECORD);
  });

  it("rejects a non-UUID id before the database is called", async () => {
    const client = fakeClient();
    await expect(run(getIncident, { id: "INC-2026-0412" }, client)).rejects.toThrow();
    expect(client.calls.from).toHaveLength(0);
  });

  it("answers 'not found' when no row is visible (missing or not a member), without revealing which", async () => {
    const client = fakeClient();
    client.state.one = { data: null, error: null };
    await expect(run(getIncident, { id: UUID }, client)).rejects.toThrow("Incident not found.");
  });

  it("returns a fixed message for a database error", async () => {
    const client = fakeClient();
    client.state.one = { data: null, error: DB_ERROR };
    const err = await run(getIncident, { id: UUID }, client).catch((e: Error) => e);
    expect((err as Error).message).toBe("The incident could not be loaded. Please try again.");
    expect((err as Error).message).not.toMatch(/relation|secret/);
  });
});
