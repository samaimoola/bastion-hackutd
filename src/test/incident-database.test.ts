// Runs the actual managed migration against isolated PostgreSQL, never hosted data.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect } from "vitest";

const commander = "11111111-1111-1111-1111-111111111111";
const responder = "22222222-2222-2222-2222-222222222222";
const viewer = "33333333-3333-3333-3333-333333333333";
const outsider = "44444444-4444-4444-4444-444444444444";
let db: PGlite;
let incident: string;

async function identity(user: string | null, role = "authenticated") {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)", [user ?? "", role]);
  await db.exec(`SET ROLE ${role}`);
}
async function protectedQuery(sql: string, params: unknown[] = []) {
  await db.exec("SAVEPOINT operation");
  try {
    const result = await db.query(sql, params);
    await db.exec("RELEASE SAVEPOINT operation");
    return result;
  } catch (error) {
    await db.exec("ROLLBACK TO SAVEPOINT operation; RELEASE SAVEPOINT operation");
    throw error;
  }
}
async function setMember(user: string, role: string) {
  return protectedQuery("SELECT public.set_incident_member($1, $2, $3)", [incident, user, role]);
}
async function edit(title = "Updated incident") {
  return protectedQuery("SELECT (public.update_incident_details($1, $2, 'Details', 'High', 'Containment')).*", [incident, title]);
}

describe("Incident database authorization", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      INSERT INTO auth.users VALUES ('${commander}'), ('${responder}'), ('${viewer}'), ('${outsider}');
    `);
    const folder = new URL("../../supabase/migrations/", import.meta.url);
    const file = readdirSync(folder).find((name) => readFileSync(new URL(name, folder), "utf8").includes("CREATE TABLE public.incidents"));
    if (!file) throw new Error("Incident foundation migration is missing");
    await db.exec(readFileSync(new URL(file, folder), "utf8"));
  }, 30000);
  beforeEach(async () => {
    await db.exec("BEGIN");
    await identity(commander);
    const result = await db.query<{ id: string }>("SELECT (public.create_incident('Test incident')).id");
    const id = result.rows[0]?.id;
    if (!id) throw new Error("Incident was not created");
    incident = id;
    await setMember(responder, "responder");
    await setMember(viewer, "viewer");
  });
  afterEach(async () => { await db.exec("RESET ROLE; ROLLBACK"); });
  afterAll(async () => { await db.close(); });

  it("atomically makes the verified caller creator and initial commander", async () => {
    const rows = await db.query("SELECT i.creator_id, m.role FROM public.incidents i JOIN public.incident_members m ON i.id=m.incident_id WHERE m.user_id=$1", [commander]);
    expect(rows.rows).toEqual([{ creator_id: commander, role: "commander" }]);
  });
  it("rolls back creation when the initial membership fails", async () => {
    await identity("55555555-5555-5555-5555-555555555555");
    await expect(protectedQuery("SELECT public.create_incident('Must roll back')")).rejects.toThrow("existing authenticated user");
    await db.exec("RESET ROLE");
    expect((await db.query("SELECT id FROM public.incidents WHERE title='Must roll back'")).rows).toHaveLength(0);
  });
  it("denies anonymous table reads and operation execution", async () => {
    await identity(null, "anon");
    await expect(protectedQuery("SELECT * FROM public.incidents")).rejects.toThrow("permission denied");
    await expect(protectedQuery("SELECT * FROM public.incident_members")).rejects.toThrow("permission denied");
    await expect(protectedQuery("SELECT public.create_incident('Forbidden')")).rejects.toThrow("permission denied");
  });
  it("rejects operations without session identity", async () => {
    await identity(null);
    await expect(protectedQuery("SELECT public.create_incident('Forbidden')")).rejects.toThrow("Authentication required");
  });
  it("hides incidents and membership from nonmembers without recursive policies", async () => {
    await identity(outsider);
    expect((await db.query("SELECT * FROM public.incidents")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM public.incident_members")).rows).toHaveLength(0);
    await expect(edit()).rejects.toThrow("Only commanders and responders");
  });
  it("allows members to read the incident and roster", async () => {
    await identity(viewer);
    expect((await db.query("SELECT * FROM public.incidents")).rows).toHaveLength(1);
    expect((await db.query("SELECT * FROM public.incident_members")).rows).toHaveLength(3);
  });
  it("allows commanders to edit details", async () => {
    await edit();
    expect((await db.query("SELECT title, severity, response_stage FROM public.incidents")).rows).toEqual([{ title: "Updated incident", severity: "High", response_stage: "Containment" }]);
  });
  it("allows responders to edit details", async () => {
    await identity(responder);
    await edit();
    expect((await db.query("SELECT title FROM public.incidents")).rows).toEqual([{ title: "Updated incident" }]);
  });
  it("denies viewer edits", async () => {
    await identity(viewer);
    await expect(edit()).rejects.toThrow("Only commanders and responders");
  });
  it("denies responder and viewer membership management and self-promotion", async () => {
    for (const user of [responder, viewer, outsider]) {
      await identity(user);
      await expect(setMember(user, "commander")).rejects.toThrow("Only commanders");
      await expect(protectedQuery("SELECT public.remove_incident_member($1, $2)", [incident, commander])).rejects.toThrow("Only commanders");
    }
  });
  it("prevents direct writes even for commanders", async () => {
    await expect(protectedQuery("UPDATE public.incidents SET title='Bypass'")).rejects.toThrow("permission denied");
    await expect(protectedQuery("UPDATE public.incident_members SET role='commander'")).rejects.toThrow("permission denied");
    await expect(protectedQuery("INSERT INTO public.incidents(title, creator_id) VALUES ('Bypass', $1)", [commander])).rejects.toThrow("permission denied");
    await expect(protectedQuery("DELETE FROM public.incident_members")).rejects.toThrow("permission denied");
  });
  it("keeps membership unique when setting a role repeatedly", async () => {
    await setMember(responder, "viewer");
    expect((await db.query("SELECT role FROM public.incident_members WHERE user_id=$1", [responder])).rows).toEqual([{ role: "viewer" }]);
  });
  it("rejects removal of the last commander", async () => {
    await expect(protectedQuery("SELECT public.remove_incident_member($1, $2)", [incident, commander])).rejects.toThrow("last commander");
  });
  it("rejects demotion of the last commander", async () => {
    await expect(setMember(commander, "viewer")).rejects.toThrow("last commander");
  });
  it("allows transfer then prevents demotion of the remaining commander", async () => {
    await setMember(responder, "commander");
    await setMember(commander, "responder");
    await identity(responder);
    await expect(setMember(responder, "viewer")).rejects.toThrow("last commander");
  });
  it("revokes read access after removal", async () => {
    await protectedQuery("SELECT public.remove_incident_member($1, $2)", [incident, viewer]);
    await identity(viewer);
    expect((await db.query("SELECT * FROM public.incidents")).rows).toHaveLength(0);
  });
  it("makes creator and creation fields immutable", async () => {
    await db.exec("RESET ROLE");
    await expect(protectedQuery("UPDATE public.incidents SET creator_id=$1 WHERE id=$2", [outsider, incident])).rejects.toThrow("immutable");
  });
  it("protects internal trigger functions from direct execution", async () => {
    expect((await db.query("SELECT has_function_privilege('authenticated', 'private.guard_incident_membership()', 'execute') AS allowed")).rows).toEqual([{ allowed: false }]);
  });
});