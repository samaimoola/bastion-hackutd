// Runs the deployed migrations plus the NOT-YET-APPLIED task proposal
// (docs/database-proposals/incident-tasks.sql) in isolated PostgreSQL. Never touches hosted data.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const commander = "11111111-1111-1111-1111-111111111111";
const responder = "22222222-2222-2222-2222-222222222222";
const viewer = "33333333-3333-3333-3333-333333333333";
const outsider = "44444444-4444-4444-4444-444444444444";
let db: PGlite;
let incident: string;
type Task = { id: string; incident_id: string; title: string; details: string; assignee_id: string | null; status: string; created_by: string; updated_by: string };

async function identity(user: string | null, role = "authenticated") {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)", [user ?? "", role]);
  await db.exec(`SET ROLE ${role}`);
}
async function q<T = Task>(sql: string, params: unknown[] = []) {
  await db.exec("SAVEPOINT op");
  try { const r = await db.query<T>(sql, params); await db.exec("RELEASE SAVEPOINT op"); return r.rows; }
  catch (error) { await db.exec("ROLLBACK TO SAVEPOINT op; RELEASE SAVEPOINT op"); throw error; }
}
const add = (title: string, assignee: string | null = null, details = "", target = incident) => q("SELECT * FROM public.add_incident_task($1,$2,$3,$4)", [target, title, details, assignee]).then((r) => r[0]!);
const update = (id: string, f: { title?: string; details?: string; assignee?: string | null; status?: string }) =>
  q("SELECT * FROM public.update_incident_task($1,$2,$3,$4,$5)", [id, f.title ?? "Task", f.details ?? "", f.assignee ?? null, f.status ?? "todo"]).then((r) => r[0]!);
const activity = async (kind: string) => { await identity(commander); return q<{ actor_id: string; entity_id: string; details: { changes: Record<string, { before?: unknown; after?: unknown }> } }>("SELECT actor_id, entity_id, details FROM public.incident_activity WHERE event_type=$1 ORDER BY occurred_at, id", [kind]); };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLES TO authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    INSERT INTO auth.users VALUES ('${commander}'), ('${responder}'), ('${viewer}'), ('${outsider}');
    CREATE PUBLICATION supabase_realtime;
  `);
  const folder = `${process.cwd()}/supabase/migrations/`;
  const names = readdirSync(folder).sort();
  const foundation = names.find((n) => readFileSync(`${folder}${n}`, "utf8").includes("CREATE TABLE public.incidents"))!;
  await db.exec(readFileSync(`${folder}${foundation}`, "utf8"));
  for (const name of names) {
    const sql = readFileSync(`${folder}${name}`, "utf8");
    if (name === foundation || sql.includes("CREATE TABLE public.guide_conversations") || sql.includes("public.guide_conversations")) continue;
    await db.exec(sql);
  }
  // The proposal under test, exactly as it would be applied.
  await db.exec(readFileSync(`${process.cwd()}/docs/database-proposals/incident-tasks.sql`, "utf8"));
}, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec("BEGIN");
  await identity(commander);
  incident = (await q<{ id: string }>("SELECT (public.create_incident('Task incident')).id"))[0]!.id;
  await q("SELECT public.set_incident_member($1,$2,'responder')", [incident, responder]);
  await q("SELECT public.set_incident_member($1,$2,'viewer')", [incident, viewer]);
});
afterEach(async () => { await db.exec("ROLLBACK"); });

describe("incident tasks (proposal) in real PostgreSQL", () => {
  it("lets responders create tasks with trusted actor, default To do status and optional fields", async () => {
    await identity(responder);
    const task = await add("  Reset VPN passwords  ");
    expect(task).toMatchObject({ title: "Reset VPN passwords", details: "", assignee_id: null, status: "todo", created_by: responder, updated_by: responder, incident_id: incident });
    const detailed = await add("Collect logs", viewer, "From the VPN gateway");
    expect(detailed).toMatchObject({ assignee_id: viewer, details: "From the VPN gateway" });
  });

  it("lets commanders and responders move tasks through To do, In progress and Done", async () => {
    await identity(responder);
    const task = await add("Isolate laptop");
    await identity(commander);
    expect((await update(task.id, { title: "Isolate laptop", status: "in_progress", assignee: responder })).status).toBe("in_progress");
    const done = await update(task.id, { title: "Isolate laptop", status: "done", assignee: responder });
    expect(done).toMatchObject({ status: "done", updated_by: commander, created_by: responder });
    await expect(update(task.id, { status: "blocked" })).rejects.toThrow("Invalid task status");
  });

  it("lets viewers read but never write; outsiders and anonymous users can do neither", async () => {
    await identity(responder);
    const task = await add("Brief executives");
    await identity(viewer);
    expect(await q("SELECT * FROM public.incident_tasks")).toHaveLength(1);
    await expect(add("Viewer task")).rejects.toThrow("Only commanders and responders can edit tasks");
    await expect(update(task.id, { status: "done" })).rejects.toThrow("Only commanders and responders can edit tasks");
    await identity(outsider);
    expect(await q("SELECT * FROM public.incident_tasks")).toHaveLength(0);
    await expect(add("Outsider task")).rejects.toThrow("Only commanders and responders");
    await expect(update(task.id, { status: "done" })).rejects.toThrow("Only commanders and responders");
    await identity(null, "anon");
    await expect(q("SELECT * FROM public.incident_tasks")).rejects.toThrow("permission denied");
    await expect(add("Anon task")).rejects.toThrow();
  });

  it("only accepts a current member of this incident as assignee", async () => {
    await identity(commander);
    await expect(add("Bad assignee", outsider)).rejects.toThrow("The assignee must be a current member of this incident");
    await expect(add("Unknown assignee", "55555555-5555-5555-5555-555555555555")).rejects.toThrow("current member");
    const other = (await q<{ id: string }>("SELECT (public.create_incident('Other')).id"))[0]!.id;
    await q("SELECT public.set_incident_member($1,$2,'responder')", [other, outsider]);
    await expect(add("Member elsewhere only", outsider)).rejects.toThrow("current member"); // a member of another incident
    const task = await add("Fine", viewer);
    await expect(update(task.id, { assignee: outsider })).rejects.toThrow("current member");
  });

  it("denies direct writes, deletes and forged actors or identity fields", async () => {
    await identity(responder);
    const task = await add("Original");
    await expect(q("INSERT INTO public.incident_tasks(incident_id,title,status,created_by,updated_by) VALUES($1,'x','todo',$2,$2)", [incident, responder])).rejects.toThrow("permission denied");
    await expect(q("UPDATE public.incident_tasks SET status='done'")).rejects.toThrow("permission denied");
    await expect(q("DELETE FROM public.incident_tasks")).rejects.toThrow("permission denied");
    await identity(commander);
    expect((await update(task.id, { title: "Renamed" })).created_by).toBe(responder); // creator never changes
  });

  it("validates titles and details", async () => {
    await identity(responder);
    await expect(add("   ")).rejects.toThrow("Task titles must be 1 to 200 characters");
    await expect(add("x".repeat(201))).rejects.toThrow("1 to 200");
    await expect(add("Long", null, "x".repeat(10001))).rejects.toThrow("up to 10000");
  });

  it("records activity atomically with trusted actors, and nothing when a write fails", async () => {
    await identity(responder);
    const task = await add("Notify legal", viewer);
    await identity(commander);
    await update(task.id, { title: "Notify legal", assignee: viewer, status: "in_progress" });
    await identity(responder);
    await expect(add("Bad", outsider)).rejects.toThrow();
    const created = await activity("task_created");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ actor_id: responder, entity_id: task.id });
    expect(created[0]!.details.changes["title"]).toEqual({ after: "Notify legal" });
    const updated = await activity("task_updated");
    expect(updated).toHaveLength(1);
    expect(updated[0]!.actor_id).toBe(commander);
    expect(Object.keys(updated[0]!.details.changes)).toEqual(["status"]); // only what changed
    expect(updated[0]!.details.changes["status"]).toEqual({ before: "todo", after: "in_progress" });
  });

  it("clears a removed member's assignments in the same transaction and removes their read access", async () => {
    await identity(commander);
    const mine = await add("Assigned to responder", responder);
    const theirs = await add("Assigned to viewer", viewer);
    await q("SELECT public.remove_incident_member($1,$2)", [incident, responder]);
    const rows = await q("SELECT * FROM public.incident_tasks ORDER BY title");
    expect(rows.find((t) => t.id === mine.id)).toMatchObject({ assignee_id: null, updated_by: commander });
    expect(rows.find((t) => t.id === theirs.id)!.assignee_id).toBe(viewer);
    const cleared = await activity("task_updated");
    expect(cleared.at(-1)!.details.changes["assignee_id"]).toEqual({ before: responder, after: null });
    await identity(responder);
    expect(await q("SELECT * FROM public.incident_tasks")).toHaveLength(0);
    await expect(add("After removal")).rejects.toThrow("Only commanders and responders");
  });

  it("leaves the existing activity sources working after replacing the recorder", async () => {
    await identity(responder);
    await q("SELECT public.send_incident_message($1,'hello',gen_random_uuid())", [incident]);
    expect(await activity("message_sent")).toHaveLength(1);
    expect((await activity("member_added")).length).toBeGreaterThanOrEqual(2);
  });
});
