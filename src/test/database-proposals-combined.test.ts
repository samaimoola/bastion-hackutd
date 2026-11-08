// Applies BOTH undeployed proposals (tasks, signup) in either order on top of the deployed migrations in
// isolated PostgreSQL (PGlite). Checks they coexist: signup membership is audited, tasks can be assigned to
// a signed-up member, removal clears the assignment, and existing activity sources still record.
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

const commander = "11111111-1111-1111-1111-111111111111";
const fresh = "55555555-5555-5555-5555-555555555555";
const code = "0123456789abcdef0123456789abcdef";
const proposals = ["incident-tasks", "signup-invitations"];
const dbs: PGlite[] = [];

async function build(order: string[]) {
  const db = new PGlite();
  dbs.push(db);
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_auth_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, supabase_auth_admin;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, supabase_auth_admin;
    GRANT SELECT, INSERT ON auth.users TO supabase_auth_admin;
    INSERT INTO auth.users(id, email) VALUES ('${commander}','c@example.test');
    CREATE PUBLICATION supabase_realtime;
  `);
  const folder = `${process.cwd()}/supabase/migrations/`;
  const names = readdirSync(folder).sort();
  const foundation = names.find((n) =>
    readFileSync(`${folder}${n}`, "utf8").includes("CREATE TABLE public.incidents"),
  )!;
  await db.exec(readFileSync(`${folder}${foundation}`, "utf8"));
  for (const name of names) {
    const sql = readFileSync(`${folder}${name}`, "utf8");
    if (name === foundation || sql.includes("public.guide_conversations")) continue;
    await db.exec(sql);
  }
  for (const name of order)
    await db.exec(readFileSync(`${process.cwd()}/docs/database-proposals/${name}.sql`, "utf8"));
  return db;
}
async function as(db: PGlite, role: string, user: string | null) {
  await db.exec("RESET ROLE");
  await db.query(
    "SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false), set_config('request.jwt.claims', '', false)",
    [user ?? "", user ? "authenticated" : ""],
  );
  await db.exec(`SET ROLE ${role}`);
}
afterAll(async () => {
  await Promise.all(dbs.map((d) => d.close()));
});

describe.each([proposals, [...proposals].reverse()])(
  "proposals applied in order %j",
  (...order) => {
    it("coexist: invited sign-up is audited, can hold a task, and removal clears it", async () => {
      const db = await build(order as string[]);
      await db.exec("UPDATE private.signup_settings SET enabled = true");
      await as(db, "authenticated", commander);
      const incident = (
        await db.query<{ id: string }>("SELECT (public.create_incident('Combined')).id")
      ).rows[0]!.id;
      const hash = createHash("sha256").update(code).digest("hex");
      await db.query(
        "SELECT public.issue_signup_invitation($1,'new@example.test','responder',$2)",
        [incident, hash],
      );
      await as(db, "supabase_auth_admin", null);
      await db.query(
        "INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,'new@example.test',$2::jsonb)",
        [fresh, JSON.stringify({ invitation_code: code })],
      );
      await as(db, "authenticated", commander);
      const members = await db.query<{ user_id: string; role: string }>(
        "SELECT user_id, role FROM public.incident_members WHERE incident_id=$1 ORDER BY role",
        [incident],
      );
      expect(members.rows).toEqual([
        { user_id: commander, role: "commander" },
        { user_id: fresh, role: "responder" },
      ]);
      const task = (
        await db.query<{ id: string }>(
          "SELECT (public.add_incident_task($1,'Rotate keys','',$2)).id",
          [incident, fresh],
        )
      ).rows[0]!.id;
      await db.query("SELECT public.send_incident_message($1,'hello',gen_random_uuid())", [
        incident,
      ]);
      await db.query("SELECT public.remove_incident_member($1,$2)", [incident, fresh]);
      expect(
        (
          await db.query<{ assignee_id: string | null }>(
            "SELECT assignee_id FROM public.incident_tasks WHERE id=$1",
            [task],
          )
        ).rows[0]!.assignee_id,
      ).toBeNull();
      const kinds = (
        await db.query<{ event_type: string }>(
          "SELECT event_type FROM public.incident_activity WHERE incident_id=$1",
          [incident],
        )
      ).rows.map((r) => r.event_type);
      expect(kinds).toEqual(
        expect.arrayContaining([
          "incident_created",
          "member_added",
          "task_created",
          "task_updated",
          "message_sent",
          "member_removed",
        ]),
      );
      // Ordinary (non-invitation) account creation is untouched by both proposals.
      await as(db, "supabase_auth_admin", null);
      await db.query(
        "INSERT INTO auth.users(id,email) VALUES ('66666666-6666-6666-6666-666666666666','admin-made@example.test')",
      );
    }, 60000);
  },
);
