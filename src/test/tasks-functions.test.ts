// MOCKED server-function tests: createServerFn is a recorder and the user-scoped Supabase client is a
// fake. Real permissions are tested in incident-tasks-database.test.ts.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

type Rec = {
  opts: unknown;
  middleware: unknown[];
  validator?: { parse: (v: unknown) => unknown } | undefined;
  handler: (a: { data: unknown; context: unknown }) => Promise<unknown>;
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
import * as fns from "@/lib/tasks.functions";
import { isNotDeployed, taskStatusLabel } from "@/lib/task-models";

const list = fns.listIncidentTasks as unknown as { rec: Rec };
const add = fns.addIncidentTask as unknown as { rec: Rec };
const edit = fns.editIncidentTask as unknown as { rec: Rec };
const INC = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
const U = "22222222-2222-2222-2222-222222222222";
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  incident_id: INC,
  title: "Reset VPN",
  details: "",
  assignee_id: null,
  status: "todo",
  created_by: U,
  updated_by: U,
  created_at: "2026-11-08T10:00:00Z",
  updated_at: "2026-11-08T10:00:00Z",
};

function client(
  tasks: { data: unknown; error: unknown },
  rpc: { data: unknown; error: unknown } = { data: row, error: null },
) {
  const calls: unknown[][] = [];
  const builder = (table: string) => {
    const result = table === "incidents" ? { data: { id: INC }, error: null } : tasks;
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      maybeSingle: async () => result,
      then: (r: (v: unknown) => unknown) => Promise.resolve(result).then(r),
    };
    return b;
  };
  return {
    calls,
    supabase: {
      from: (t: string) => (calls.push(["from", t]), builder(t)),
      rpc: async (...a: unknown[]) => (calls.push(["rpc", ...a]), rpc),
    },
  };
}
const run = (fn: { rec: Rec }, data: unknown, c: ReturnType<typeof client>) =>
  fn.rec.handler({
    data: fn.rec.validator!.parse(data),
    context: { supabase: c.supabase, userId: U },
  });

describe("task server functions", () => {
  it("are protected by requireSupabaseAuth and never use the service-role client", () => {
    for (const f of [list, add, edit]) expect(f.rec.middleware).toEqual([REQUIRE_AUTH]);
    const src = readFileSync(path.resolve(__dirname, "../lib/tasks.functions.ts"), "utf8");
    expect(src).not.toMatch(/client\.server|supabaseAdmin|SERVICE_ROLE/);
  });

  it("reports tasks as unavailable when the table is not deployed, instead of inventing records", async () => {
    for (const error of [
      {
        code: "PGRST205",
        message: "Could not find the table 'public.incident_tasks' in the schema cache",
      },
      { code: "42P01", message: 'relation "public.incident_tasks" does not exist' },
    ]) {
      expect(await run(list, { incidentId: INC }, client({ data: null, error }))).toEqual({
        available: false,
      });
    }
  });

  it("returns validated rows once deployed, and a clear error for other failures", async () => {
    expect(await run(list, { incidentId: INC }, client({ data: [row], error: null }))).toEqual({
      available: true,
      tasks: [row],
    });
    await expect(
      run(
        list,
        { incidentId: INC },
        client({ data: null, error: { code: "XX000", message: "secret internals" } }),
      ),
    ).rejects.toThrow("Tasks could not be loaded. Please try again.");
    await expect(
      run(
        list,
        { incidentId: INC },
        client({ data: [{ ...row, status: "blocked" }], error: null }),
      ),
    ).rejects.toThrow();
  });

  it("calls the protected RPCs with only the allowed fields (no actor, status or times on create)", async () => {
    const c = client({ data: [], error: null });
    await run(add, { incidentId: INC, title: " Brief execs ", details: "", assigneeId: null }, c);
    expect(c.calls).toContainEqual([
      "rpc",
      "add_incident_task",
      { _incident_id: INC, _title: "Brief execs", _details: "", _assignee_id: null },
    ]);
    await run(
      edit,
      { id: row.id, title: "T", details: "D", assigneeId: U, status: "in_progress" },
      c,
    );
    expect(c.calls).toContainEqual([
      "rpc",
      "update_incident_task",
      { _id: row.id, _title: "T", _details: "D", _assignee_id: U, _status: "in_progress" },
    ]);
  });

  it("rejects bad input before calling the database", () => {
    expect(() =>
      add.rec.validator!.parse({ incidentId: INC, title: "  ", details: "", assigneeId: null }),
    ).toThrow();
    expect(() =>
      edit.rec.validator!.parse({
        id: row.id,
        title: "T",
        details: "",
        assigneeId: null,
        status: "blocked",
      }),
    ).toThrow();
    expect(() =>
      add.rec.validator!.parse({
        incidentId: INC,
        title: "T",
        details: "",
        assigneeId: "not-a-uuid",
      }),
    ).toThrow();
    expect(() =>
      add.rec.validator!.parse({
        incidentId: INC,
        title: "T",
        details: "",
        assigneeId: null,
        createdBy: U,
      }),
    ).toThrow();
  });

  it.each([
    [
      { code: "42501" },
      "Only commanders and responders with current incident access can change tasks.",
    ],
    [
      { code: "23503", message: "The assignee must be a current member of this incident" },
      "The assignee must be a current member of this incident.",
    ],
    [
      { code: "PGRST202", message: "Could not find the function public.add_incident_task" },
      "Shared tasks are not set up for this workspace yet.",
    ],
    [
      { code: "XX000", message: "internal detail" },
      "The task could not be saved. Please try again.",
    ],
  ])("maps write errors to clear messages (%o)", async (error, message) => {
    await expect(
      run(
        add,
        { incidentId: INC, title: "T", details: "", assigneeId: null },
        client({ data: [], error: null }, { data: null, error }),
      ),
    ).rejects.toThrow(message);
  });

  it("labels statuses To do / In progress / Done and detects only real not-deployed errors", () => {
    expect(Object.values(taskStatusLabel)).toEqual(["To do", "In progress", "Done"]);
    expect(isNotDeployed({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isNotDeployed(null)).toBe(false);
  });
});
