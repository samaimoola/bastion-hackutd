// Runs the deployed migrations plus the NOT-YET-APPLIED proposal docs/database-proposals/signup-invitations.sql
// in isolated PostgreSQL (PGlite). Supabase Auth is simulated: the hook is called the way Auth calls it, and
// account creation is an INSERT into auth.users as supabase_auth_admin. Never touches hosted data.
import { PGlite } from "@electric-sql/pglite";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const commander = "11111111-1111-1111-1111-111111111111";
const responder = "22222222-2222-2222-2222-222222222222";
const viewer = "33333333-3333-3333-3333-333333333333";
const outsider = "44444444-4444-4444-4444-444444444444";
const newUser = "55555555-5555-5555-5555-555555555555";
const otherUser = "66666666-6666-6666-6666-666666666666";
const invited = "new.person@example.test";
let db: PGlite;
let incident: string;
let other: string;

async function as(role: string, user: string | null = null) {
  await db.exec("RESET ROLE");
  await db.query(
    "SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)",
    [user ?? "", user ? "authenticated" : ""],
  );
  await db.exec(`SET ROLE ${role}`);
}
async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  await db.exec("SAVEPOINT op");
  try {
    const r = await db.query<T>(sql, params);
    await db.exec("RELEASE SAVEPOINT op");
    return r.rows;
  } catch (error) {
    await db.exec("ROLLBACK TO SAVEPOINT op; RELEASE SAVEPOINT op");
    throw error;
  }
}
const superuser = () => as("postgres");
const newCode = () => randomBytes(16).toString("hex");
const hash = (code: string) => createHash("sha256").update(code).digest("hex");
async function enable(on = true) {
  await superuser();
  await q("UPDATE private.signup_settings SET enabled = $1", [on]);
}
async function issue(
  code: string,
  email = invited,
  role = "viewer",
  target = incident,
  by = commander,
) {
  await as("authenticated", by);
  return q<{ expires: string }>(
    "SELECT public.issue_signup_invitation($1,$2,$3::public.incident_member_role,$4) AS expires",
    [target, email, role, hash(code)],
  );
}
/** What Supabase Auth sends to the Before User Created hook. */
async function hook(
  metadata: Record<string, unknown>,
  email = invited,
  extra: Record<string, unknown> = {},
) {
  await as("supabase_auth_admin");
  const event = {
    metadata: { name: "before-user-created", ip_address: "127.0.0.1" },
    user: {
      id: newUser,
      email,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: metadata,
      is_anonymous: false,
      ...extra,
    },
  };
  return (
    await q<{ r: Record<string, unknown> }>(
      "SELECT public.bastion_before_user_created($1::jsonb) AS r",
      [JSON.stringify(event)],
    )
  )[0]!.r;
}
/** The row Supabase Auth inserts once the hook allowed it (or that admin createUser inserts directly). */
async function createUser(metadata: Record<string, unknown> | null, email = invited, id = newUser) {
  await as("supabase_auth_admin");
  return (
    await q<{ raw_user_meta_data: Record<string, unknown> | null }>(
      "INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES ($1,$2,$3::jsonb) RETURNING raw_user_meta_data",
      [id, email, metadata === null ? null : JSON.stringify(metadata)],
    )
  )[0]!;
}
async function invitation(code: string) {
  await superuser();
  return (
    await q<{ redeemed_at: string | null; redeemed_by: string | null; role: string }>(
      "SELECT redeemed_at, redeemed_by, role FROM public.signup_invitations WHERE code_hash=$1",
      [hash(code)],
    )
  )[0]!;
}
async function memberships(user = newUser) {
  await superuser();
  return q<{ incident_id: string; role: string }>(
    "SELECT incident_id, role FROM public.incident_members WHERE user_id=$1 ORDER BY incident_id",
    [user],
  );
}
async function userExists(id = newUser) {
  await superuser();
  return (await q("SELECT 1 FROM auth.users WHERE id=$1", [id])).length === 1;
}
const refused = { error: { http_code: 403, message: expect.stringContaining("invitation") } };

beforeAll(async () => {
  db = new PGlite();
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
    INSERT INTO auth.users(id, email) VALUES ('${commander}','c@example.test'), ('${responder}','r@example.test'), ('${viewer}','v@example.test'), ('${outsider}','o@example.test');
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
  await db.exec(
    readFileSync(`${process.cwd()}/docs/database-proposals/signup-invitations.sql`, "utf8"),
  );
}, 60000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("BEGIN");
  await as("authenticated", commander);
  incident = (await q<{ id: string }>("SELECT (public.create_incident('Signup incident')).id"))[0]!
    .id;
  other = (await q<{ id: string }>("SELECT (public.create_incident('Other incident')).id"))[0]!.id;
  await q("SELECT public.set_incident_member($1,$2,'responder')", [incident, responder]);
  await q("SELECT public.set_incident_member($1,$2,'viewer')", [incident, viewer]);
});
afterEach(async () => {
  await db.exec("ROLLBACK");
});

describe("invitation-only sign-up (proposal) in real PostgreSQL", () => {
  it("stays switched off after installation: no issuing, every self-service sign-up refused", async () => {
    await as("anon");
    expect(
      (await q<{ ready: boolean }>("SELECT public.invitation_signup_ready() AS ready"))[0]!.ready,
    ).toBe(false);
    await expect(issue(newCode())).rejects.toThrow("Account invitations are not set up yet");
    await enable();
    const code = newCode();
    await issue(code);
    await enable(false);
    expect(await hook({ invitation_code: code })).toEqual(refused);
    await expect(createUser({ invitation_code: code })).rejects.toThrow(
      "valid, unused Bastion invitation",
    );
    expect(await userExists()).toBe(false);
  });

  it("creates the account and grants exactly the invited role on exactly that incident", async () => {
    await enable();
    const code = newCode();
    const [{ expires }] = (await issue(code, "  New.Person@Example.TEST ", "responder")) as [
      { expires: string },
    ];
    expect(new Date(expires).getTime() - Date.now()).toBeGreaterThan(23.9 * 3600 * 1000);
    expect(await hook({ invitation_code: code }, "New.Person@example.test")).toEqual({});
    const row = await createUser({ invitation_code: code, display_name: "New Person" });
    expect(row.raw_user_meta_data).toEqual({ display_name: "New Person" }); // code never stays on the account
    expect(await invitation(code)).toMatchObject({ redeemed_by: newUser, role: "responder" });
    expect(await memberships()).toEqual([{ incident_id: incident, role: "responder" }]);
    await superuser();
    const added = await q<{ actor_id: string; details: { role: string } }>(
      "SELECT actor_id, details FROM public.incident_activity WHERE event_type='member_added' AND entity_id=$1",
      [newUser],
    );
    expect(added).toEqual([
      { actor_id: commander, details: expect.objectContaining({ role: "responder" }) },
    ]);
    expect(
      (
        await q<{ s: string | null }>("SELECT current_setting('request.jwt.claim.sub', true) AS s")
      )[0]!.s ?? "",
    ).toBe(""); // impersonation undone
  });

  it("stores only the hash and never exposes invitations to clients or the service role", async () => {
    await enable();
    const code = newCode();
    await issue(code);
    await superuser();
    const stored = await q<{ row: string }>(
      "SELECT row_to_json(s)::text AS row FROM public.signup_invitations s",
    );
    expect(stored[0]!.row).toContain(hash(code));
    expect(stored[0]!.row).not.toContain(code);
    for (const [role, user] of [
      ["authenticated", commander],
      ["anon", null],
      ["service_role", null],
    ] as const) {
      await as(role, user);
      await expect(q("SELECT * FROM public.signup_invitations")).rejects.toThrow(
        "permission denied",
      );
      await expect(
        q(
          "INSERT INTO public.signup_invitations(incident_id,issuer_id,email,role,code_hash,expires_at) VALUES($1,$2,'x@example.test','viewer',$3,now()+interval '1 hour')",
          [incident, commander, hash(newCode())],
        ),
      ).rejects.toThrow("permission denied");
      await expect(q("UPDATE private.signup_settings SET enabled=false")).rejects.toThrow(
        "permission denied",
      );
      await expect(q("SELECT public.bastion_before_user_created('{}'::jsonb)")).rejects.toThrow(
        "permission denied",
      );
    }
  });

  it("lets only a current commander issue, for responder or viewer only, with a valid email", async () => {
    await enable();
    for (const user of [responder, viewer, outsider])
      await expect(issue(newCode(), invited, "viewer", incident, user)).rejects.toThrow(
        "Only commanders can invite new accounts",
      );
    await as("anon");
    await expect(
      q("SELECT public.issue_signup_invitation($1,$2,'viewer',$3)", [
        incident,
        invited,
        hash(newCode()),
      ]),
    ).rejects.toThrow("permission denied");
    await expect(issue(newCode(), invited, "commander")).rejects.toThrow(
      "responder or viewer only",
    );
    await expect(issue(newCode(), "not-an-email")).rejects.toThrow("valid email");
    await as("authenticated", commander);
    await expect(
      q("SELECT public.issue_signup_invitation($1,$2,'viewer','plain-code')", [incident, invited]),
    ).rejects.toThrow("Invalid invitation");
  });

  it("refuses sign-up without a code, with a guessed or malformed code, or as an anonymous user", async () => {
    await enable();
    const code = newCode();
    await issue(code);
    expect(await hook({})).toEqual(refused);
    expect(await hook({ invitation_code: newCode() })).toEqual(refused);
    expect(await hook({ invitation_code: hash(code) })).toEqual(refused); // the stored hash is not a code
    expect(await hook({ invitation_code: "not hex" })).toEqual(refused);
    expect(await hook({ invitation_code: code }, invited, { is_anonymous: true })).toEqual(refused);
    await expect(createUser({ invitation_code: newCode() })).rejects.toThrow(
      "valid, unused Bastion invitation",
    );
    await expect(createUser({ invitation_code: null })).rejects.toThrow(
      "valid, unused Bastion invitation",
    );
    expect(await userExists()).toBe(false);
    expect((await invitation(code)).redeemed_at).toBeNull();
  });

  it("binds the invitation to the invited email address", async () => {
    await enable();
    const code = newCode();
    await issue(code);
    expect(await hook({ invitation_code: code }, "someone.else@example.test")).toEqual(refused);
    await expect(
      createUser({ invitation_code: code }, "someone.else@example.test"),
    ).rejects.toThrow("valid, unused");
    expect((await invitation(code)).redeemed_at).toBeNull();
  });

  it("refuses expired invitations", async () => {
    await enable();
    const code = newCode();
    await issue(code);
    await superuser();
    await q(
      "UPDATE public.signup_invitations SET expires_at = clock_timestamp() - interval '1 second'",
    );
    expect(await hook({ invitation_code: code })).toEqual(refused);
    await expect(createUser({ invitation_code: code })).rejects.toThrow("valid, unused");
    expect(await userExists()).toBe(false);
  });

  it("allows each invitation to be used once; a second or racing redemption fails", async () => {
    await enable();
    const code = newCode();
    await issue(code);
    // Both requests pass the hook before either account exists (the race window the trigger closes).
    expect(await hook({ invitation_code: code })).toEqual({});
    await createUser({ invitation_code: code });
    await expect(createUser({ invitation_code: code }, invited, otherUser)).rejects.toThrow(
      "valid, unused",
    );
    expect(await hook({ invitation_code: code })).toEqual(refused);
    expect(await userExists(otherUser)).toBe(false);
    expect(await memberships(otherUser)).toEqual([]);
  });

  it("refuses an invitation whose issuer is no longer a commander", async () => {
    await enable();
    const code = newCode();
    await issue(code);
    await as("authenticated", commander);
    await q("SELECT public.set_incident_member($1,$2,'commander')", [incident, responder]);
    await q("SELECT public.set_incident_member($1,$2,'viewer')", [incident, commander]); // the issuer is demoted
    expect(await hook({ invitation_code: code })).toEqual(refused);
    await expect(createUser({ invitation_code: code })).rejects.toThrow("valid, unused");
  });

  it("ignores roles or incidents supplied in sign-up metadata", async () => {
    await enable();
    const code = newCode();
    await issue(code, invited, "viewer");
    await createUser({ invitation_code: code, role: "commander", incident_id: other });
    expect(await memberships()).toEqual([{ incident_id: incident, role: "viewer" }]);
  });

  it("rolls everything back when the membership cannot be added, leaving the invitation unused", async () => {
    await enable();
    const code = newCode();
    await issue(code);
    await superuser();
    await q(
      `CREATE FUNCTION pg_temp.fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated failure'; END $$`,
    );
    await q(
      "CREATE TRIGGER simulated_failure BEFORE INSERT ON public.incident_members FOR EACH ROW EXECUTE FUNCTION pg_temp.fail()",
    );
    await expect(createUser({ invitation_code: code })).rejects.toThrow("simulated failure");
    await superuser();
    await q("DROP TRIGGER simulated_failure ON public.incident_members");
    expect(await userExists()).toBe(false);
    expect((await invitation(code)).redeemed_at).toBeNull();
    await createUser({ invitation_code: code }); // still usable afterwards
    expect(await memberships()).toEqual([{ incident_id: incident, role: "viewer" }]);
  });

  it("keeps administrator-created accounts (no invitation code) working as today", async () => {
    await enable();
    expect(await createUser(null, "admin.made@example.test")).toEqual({ raw_user_meta_data: null });
    expect(
      await createUser({ display_name: "Admin made" }, "admin2@example.test", otherUser),
    ).toEqual({ raw_user_meta_data: { display_name: "Admin made" } });
    expect(await memberships()).toEqual([]);
  });

  it("works as an emergency off switch for invitations already issued", async () => {
    await enable();
    const code = newCode();
    await issue(code);
    await enable(false);
    expect(await hook({ invitation_code: code })).toEqual(refused);
    await expect(createUser({ invitation_code: code })).rejects.toThrow("valid, unused");
    await enable(true);
    expect(await hook({ invitation_code: code })).toEqual({});
  });
});
