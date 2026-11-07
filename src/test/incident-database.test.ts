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
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLES TO authenticated, service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      INSERT INTO auth.users VALUES ('${commander}'), ('${responder}'), ('${viewer}'), ('${outsider}');
    `);
    const folder = `${process.cwd()}/supabase/migrations/`;
    const file = readdirSync(folder).find((name) => readFileSync(`${folder}${name}`, "utf8").includes("CREATE TABLE public.incidents"));
    if (!file) throw new Error("Incident foundation migration is missing");
    await db.exec(readFileSync(`${folder}${file}`, "utf8"));
    for (const name of readdirSync(folder).sort()) {
      const sql = readFileSync(`${folder}${name}`, "utf8");
      if (sql.includes("REVOKE ALL ON public.incidents, public.incident_members")) await db.exec(sql);
      if (sql.includes("CREATE TABLE public.incident_invitations")) await db.exec(sql);
      if (sql.includes("REVOKE ALL ON public.incident_invitations" ) && !sql.includes("CREATE TABLE public.incident_invitations")) await db.exec(sql);
      if (sql.includes("CREATE TABLE public.incident_affected_systems")) await db.exec(sql.replace("ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_affected_systems;", ""));
      if (sql.includes("CREATE TABLE public.incident_messages")) await db.exec(sql.replace(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.(incident_messages|incident_members);/g, ""));
    }
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
  it("removes inherited nonessential table grants", async () => {
    for (const role of ["authenticated", "anon", "service_role"]) {
      expect((await db.query("SELECT has_table_privilege($1, 'public.incidents', 'TRUNCATE') AS allowed", [role])).rows).toEqual([{ allowed: false }]);
      expect((await db.query("SELECT has_table_privilege($1, 'public.incident_members', 'TRIGGER') AS allowed", [role])).rows).toEqual([{ allowed: false }]);
    }
  });

  async function invite(role = "responder", hash = "a".repeat(64)) {
    return protectedQuery("SELECT public.issue_incident_invitation($1, $2, $3)", [incident, role, hash]);
  }
  async function redeem(hash = "a".repeat(64)) {
    return protectedQuery("SELECT public.redeem_incident_invitation($1) AS id", [hash]);
  }
  it("grants only the stored incident and responder role once", async () => {
    await invite();
    await identity(outsider);
    expect((await redeem()).rows).toEqual([{ id: incident }]);
    expect((await db.query("SELECT incident_id, role FROM public.incident_members WHERE user_id=$1", [outsider])).rows).toEqual([{ incident_id: incident, role: "responder" }]);
    await expect(redeem()).rejects.toThrow("invalid or unavailable");
  });
  it("grants viewer access only when the invitation specifies viewer", async () => {
    await invite("viewer"); await identity(outsider); await redeem();
    expect((await db.query("SELECT role FROM public.incident_members WHERE user_id=$1", [outsider])).rows).toEqual([{ role: "viewer" }]);
  });
  it("denies issuing invitations to responders, viewers and outsiders", async () => {
    for (const user of [responder, viewer, outsider]) { await identity(user); await expect(invite()).rejects.toThrow("Only commanders"); }
  });
  it("rejects commander invitation roles and malformed token hashes", async () => {
    await expect(invite("commander")).rejects.toThrow("Invalid invitation");
    await expect(invite("viewer", "weak-token")).rejects.toThrow("Invalid invitation");
  });
  it("rejects anonymous redemption and missing session identity", async () => {
    await invite(); await identity(null, "anon");
    await expect(redeem()).rejects.toThrow("permission denied");
    await identity(null); await expect(redeem()).rejects.toThrow("Authentication required");
  });
  it("rejects expired tokens without granting membership", async () => {
    await invite(); await db.exec("RESET ROLE; UPDATE public.incident_invitations SET expires_at=now()-interval '1 second'");
    await identity(outsider); await expect(redeem()).rejects.toThrow("invalid or unavailable");
    expect((await db.query("SELECT * FROM public.incidents")).rows).toHaveLength(0);
  });
  it.each(["demoted", "removed"])("rejects invitations whose issuer was %s", async (state) => {
    await invite(); await setMember(responder, "commander");
    if (state === "demoted") await setMember(commander, "responder");
    else await protectedQuery("SELECT public.remove_incident_member($1, $2)", [incident, commander]);
    await identity(outsider); await expect(redeem()).rejects.toThrow("invalid or unavailable");
  });
  it("preserves an existing viewer role, consumes the link and prevents self-promotion", async () => {
    await invite(); await identity(viewer); await redeem();
    expect((await db.query("SELECT role FROM public.incident_members WHERE user_id=$1", [viewer])).rows).toEqual([{ role: "viewer" }]);
    await expect(redeem()).rejects.toThrow("invalid or unavailable");
  });
  it("hides token hashes even from commanders and denies direct invitation writes", async () => {
    await invite();
    await expect(protectedQuery("SELECT token_hash FROM public.incident_invitations")).rejects.toThrow("permission denied");
    expect((await db.query("SELECT role FROM public.incident_invitations")).rows).toEqual([{ role: "responder" }]);
    await expect(protectedQuery("UPDATE public.incident_invitations SET role='viewer'")).rejects.toThrow("permission denied");
    await expect(protectedQuery("TRUNCATE public.incident_invitations")).rejects.toThrow("permission denied");
    await identity(viewer);
    expect((await db.query("SELECT role FROM public.incident_invitations")).rows).toHaveLength(0);
  });
  async function addSystem(conditions = ["encrypted", "exfiltrated"]) {
    const rows = await protectedQuery("SELECT * FROM public.add_incident_affected_system($1,'File server','Customer files','suspected',$2,'in progress','Under investigation')", [incident, conditions]);
    return rows.rows[0] as { id: string; incident_id: string; created_by: string; updated_by: string; created_at: Date; updated_at: Date; data_conditions: string[] };
  }
  async function editSystem(id: string) {
    return protectedQuery("SELECT * FROM public.update_incident_affected_system($1,'Updated server','Files','confirmed',ARRAY['unavailable'],'contained','Resolved')", [id]);
  }
  it("persists multiple conditions with trusted creator/editor identities and times", async () => {
    const row = await addSystem();
    expect(row.created_by).toBe(commander); expect(row.updated_by).toBe(commander);
    expect(row.data_conditions).toEqual(["encrypted", "exfiltrated"]);
    await identity(responder); await editSystem(row.id);
    const changed = (await db.query<{ created_at: Date; updated_at: Date }>("SELECT * FROM public.incident_affected_systems WHERE id=$1", [row.id])).rows[0];
    expect(changed).toMatchObject({ created_by: commander, updated_by: responder, assessment: "confirmed", containment_status: "contained", resource_name: "Updated server" });
    expect(changed?.created_at).toEqual(row.created_at);
    if (!changed) throw new Error("Updated row missing");
    expect(changed.updated_at.getTime()).toBeGreaterThanOrEqual(row.created_at.getTime());
  });
  it.each([commander, responder])("allows adding and editing for authorized writer %s", async (user) => {
    await identity(user); const row = await addSystem(); await editSystem(row.id);
    expect((await db.query("SELECT resource_name FROM public.incident_affected_systems")).rows).toEqual([{ resource_name: "Updated server" }]);
  });
  it("viewers read but cannot add/edit; nonmembers cannot read or write", async () => {
    const row = await addSystem();
    await identity(viewer); expect((await db.query("SELECT id FROM public.incident_affected_systems")).rows).toHaveLength(1);
    await expect(addSystem()).rejects.toThrow("Only commanders and responders"); await expect(editSystem(row.id)).rejects.toThrow("Only commanders and responders");
    await identity(outsider); expect((await db.query("SELECT id FROM public.incident_affected_systems")).rows).toHaveLength(0);
    await expect(editSystem(row.id)).rejects.toThrow("Only commanders and responders");
  });
  it("denies anonymous and direct writes, including truncate", async () => {
    await addSystem(); await expect(protectedQuery("UPDATE public.incident_affected_systems SET resource_name='Bypass'")).rejects.toThrow("permission denied");
    await expect(protectedQuery("TRUNCATE public.incident_affected_systems")).rejects.toThrow("permission denied");
    await identity(null, "anon"); await expect(protectedQuery("SELECT * FROM public.incident_affected_systems")).rejects.toThrow("permission denied");
    await expect(addSystem()).rejects.toThrow("permission denied");
  });
  it("rejects moving records to another incident even with write access to both", async () => {
    const row = await addSystem();
    const other = (await db.query<{ id: string }>("SELECT (public.create_incident('Other incident')).id")).rows[0]?.id;
    await db.exec("RESET ROLE");
    await expect(protectedQuery("UPDATE public.incident_affected_systems SET incident_id=$1 WHERE id=$2", [other, row.id])).rejects.toThrow("immutable");
  });
  it("rejects invalid and duplicate conditions without creating a row", async () => {
    for (const conditions of [[], ["invalid"], ["encrypted", "encrypted"]]) await expect(addSystem(conditions)).rejects.toThrow("Invalid data conditions");
    expect((await db.query("SELECT id FROM public.incident_affected_systems")).rows).toHaveLength(0);
  });
  it("revoked members lose affected-system access and updates", async () => {
    const row = await addSystem(); await protectedQuery("SELECT public.remove_incident_member($1,$2)", [incident,responder]);
    await identity(responder); expect((await db.query("SELECT * FROM public.incident_affected_systems")).rows).toHaveLength(0);
    await expect(editSystem(row.id)).rejects.toThrow("Only commanders and responders");
  });
  async function sendMessage(body = "Containment started", requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") {
    const result = await protectedQuery("SELECT * FROM public.send_incident_message($1,$2,$3)", [incident, body, requestId]);
    return result as { rows: { id: string; body: string; created_at: Date; sender_id: string; author_name: string | null }[] };
  }
  it.each([commander, responder])("message writer %s has trusted identity/time and idempotent retries", async (user) => {
    await identity(user);
    const before = (await db.query<{ time: Date }>("SELECT clock_timestamp() AS time")).rows[0]?.time;
    const row = (await sendMessage()).rows[0];
    expect(row).toMatchObject({ incident_id: incident, sender_id: user, body: "Containment started" });
    expect(row?.created_at).toBeInstanceOf(Date);
    expect((row?.created_at as Date).getTime()).toBeGreaterThanOrEqual(before?.getTime() ?? Infinity);
    expect((await sendMessage()).rows[0]?.id).toBe(row?.id);
    expect((await db.query("SELECT * FROM public.incident_messages")).rows).toHaveLength(1);
  });
  it("viewers read messages but cannot post and nonmembers have neither access", async () => {
    await sendMessage(); await identity(viewer);
    expect((await db.query("SELECT body FROM public.incident_messages")).rows).toEqual([{ body: "Containment started" }]);
    await expect(sendMessage()).rejects.toThrow("Only commanders and responders");
    await identity(outsider);
    expect((await db.query("SELECT * FROM public.incident_messages")).rows).toHaveLength(0);
    await expect(sendMessage()).rejects.toThrow("Only commanders and responders");
  });
  it("denies anonymous message access and send without verified identity", async () => {
    await identity(null, "anon");
    await expect(protectedQuery("SELECT * FROM public.incident_messages")).rejects.toThrow("permission denied");
    await expect(sendMessage()).rejects.toThrow("permission denied");
    await identity(null); await expect(sendMessage()).rejects.toThrow("Authentication required");
  });
  it("rejects blank and oversized messages and accepts the 4000-character boundary", async () => {
    for (const body of ["", " \n\t ", "x".repeat(4001)]) await expect(sendMessage(body)).rejects.toThrow("1 to 4000");
    expect((await sendMessage("x".repeat(4000))).rows[0]?.body).toHaveLength(4000);
  });
  it("ordinary users cannot impersonate senders, edit, delete, move or truncate messages", async () => {
    await sendMessage();
    await expect(protectedQuery("INSERT INTO public.incident_messages(incident_id,sender_id,body,request_id) VALUES($1,$2,'Forged',gen_random_uuid())", [incident, outsider])).rejects.toThrow("permission denied");
    for (const sql of ["UPDATE public.incident_messages SET sender_id=gen_random_uuid()", "UPDATE public.incident_messages SET body='Edited'", "UPDATE public.incident_messages SET incident_id=gen_random_uuid()", "DELETE FROM public.incident_messages", "TRUNCATE public.incident_messages"]) await expect(protectedQuery(sql)).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE");
    await expect(protectedQuery("UPDATE public.incident_messages SET body='Edited'")).rejects.toThrow("immutable");
  });
  it("removed members cannot read or send even when retrying a previously sent message", async () => {
    await identity(responder); await sendMessage(); await identity(commander);
    await protectedQuery("SELECT public.remove_incident_member($1,$2)", [incident, responder]);
    await identity(responder);
    expect((await db.query("SELECT * FROM public.incident_messages")).rows).toHaveLength(0);
    await expect(sendMessage()).rejects.toThrow("Only commanders and responders");
  });
  it("uses a verified-session display label without accepting a caller-supplied sender", async () => {
    await db.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ user_metadata: { display_name: "Test responder" } })]);
    await identity(responder);
    expect((await sendMessage()).rows[0]).toMatchObject({ sender_id: responder, author_name: "Test responder" });
  });
});