// MOCKED server-function and model tests. Real permissions are tested in signup-invitations-database.test.ts.
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
type Rec = {
  middleware: unknown[];
  validator?: { parse: (v: unknown) => unknown } | undefined;
  handler: (a: { data: unknown; context: unknown }) => Promise<unknown>;
};
const { REQUIRE_AUTH } = vi.hoisted(() => ({
  REQUIRE_AUTH: { name: "requireSupabaseAuth (mock)" },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const rec = { middleware: [] as unknown[] } as Rec;
    const chain = {
      middleware: (m: unknown[]) => ((rec.middleware = m), chain),
      inputValidator: (v: Rec["validator"]) => ((rec.validator = v), chain),
      handler: (fn: Rec["handler"]) => ((rec.handler = fn), { rec }),
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: REQUIRE_AUTH }));
import * as fns from "@/lib/signup-invitations.functions";
import {
  signupCode,
  signupErrorMessage,
  signupInviteInput,
  signupReadiness,
} from "@/lib/signup-invitation-models";
const issue = (fns.issueSignupInvitation as unknown as { rec: Rec }).rec;
const status = (fns.getSignupInvitationStatus as unknown as { rec: Rec }).rec;
const INC = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
const client = (result: { data: unknown; error: unknown }) => ({
  rpc: vi.fn().mockResolvedValue(result),
});

describe("issueSignupInvitation", () => {
  it("requires a signed-in user and accepts only responder or viewer with a valid email", () => {
    expect(issue.middleware).toEqual([REQUIRE_AUTH]);
    expect(issue.validator!.parse({ id: INC, email: " A@Example.TEST ", role: "viewer" })).toEqual({
      id: INC,
      email: "a@example.test",
      role: "viewer",
    });
    expect(() =>
      issue.validator!.parse({ id: INC, email: "a@example.test", role: "commander" }),
    ).toThrow();
    expect(() => issue.validator!.parse({ id: INC, email: "nope", role: "viewer" })).toThrow();
    expect(() =>
      issue.validator!.parse({ id: INC, email: "a@example.test", role: "viewer", issuer: "x" }),
    ).toThrow();
  });

  it("sends only the SHA-256 hash of a fresh 128-bit code and returns the code once", async () => {
    const supabase = client({ data: "2026-11-09T00:00:00Z", error: null });
    const result = (await issue.handler({
      data: { id: INC, email: "a@example.test", role: "responder" },
      context: { supabase },
    })) as { code: string };
    expect(result).toMatchObject({
      email: "a@example.test",
      role: "responder",
      expiresAt: "2026-11-09T00:00:00Z",
    });
    expect(signupCode.parse(result.code)).toBe(result.code);
    const [fn, args] = supabase.rpc.mock.calls[0]!;
    expect(fn).toBe("issue_signup_invitation");
    expect(args).toEqual({
      _incident_id: INC,
      _email: "a@example.test",
      _role: "responder",
      _code_hash: createHash("sha256").update(result.code).digest("hex"),
    });
    expect(JSON.stringify(args)).not.toContain(result.code);
    const second = (await issue.handler({
      data: { id: INC, email: "a@example.test", role: "responder" },
      context: { supabase },
    })) as { code: string };
    expect(second.code).not.toBe(result.code);
  });

  it("maps database refusals without leaking details", async () => {
    const run = (error: unknown) =>
      issue.handler({
        data: { id: INC, email: "a@example.test", role: "viewer" },
        context: { supabase: client({ data: null, error }) },
      });
    await expect(run({ code: "PGRST202", message: "Could not find the function" })).rejects.toThrow(
      "not set up for this workspace yet",
    );
    await expect(
      run({ code: "55000", message: "Account invitations are not set up yet" }),
    ).rejects.toThrow("not set up for this workspace yet");
    await expect(
      run({ code: "42501", message: "Only commanders can invite new accounts" }),
    ).rejects.toThrow("Only a current commander");
    await expect(run({ code: "22023", message: "Enter a valid email address" })).rejects.toThrow(
      "Enter a valid email address.",
    );
    await expect(run({ code: "XX000", message: "internal detail" })).rejects.toThrow(
      "could not be created",
    );
  });

  it("reports readiness through the user-scoped client", async () => {
    expect(status.middleware).toEqual([REQUIRE_AUTH]);
    await expect(
      status.handler({
        data: undefined,
        context: { supabase: client({ data: true, error: null }) },
      }),
    ).resolves.toEqual({ readiness: "ready" });
  });
});

describe("signup readiness and error messages", () => {
  it("treats a missing function as not installed and other failures as unknown", async () => {
    await expect(
      signupReadiness(client({ data: null, error: { code: "PGRST202" } })),
    ).resolves.toBe("not_ready");
    await expect(signupReadiness(client({ data: false, error: null }))).resolves.toBe("not_ready");
    await expect(
      signupReadiness(client({ data: null, error: { code: "500", message: "boom" } })),
    ).resolves.toBe("unknown");
    await expect(
      signupReadiness({ rpc: vi.fn().mockRejectedValue(new Error("offline")) }),
    ).resolves.toBe("unknown");
    await expect(signupReadiness(client({ data: "yes", error: null }))).resolves.toBe("not_ready");
  });

  it("maps Supabase Auth failures to plain guidance", () => {
    expect(
      signupErrorMessage({
        status: 403,
        message:
          "A valid, unused Bastion invitation for this email address is required to create an account.",
      }),
    ).toMatch(/could not be used/);
    expect(signupErrorMessage({ status: 500, message: "Database error saving new user" })).toMatch(
      /could not be used/,
    );
    expect(
      signupErrorMessage({
        code: "signup_disabled",
        message: "Signups not allowed for this instance",
      }),
    ).toMatch(/not switched on yet/);
    expect(
      signupErrorMessage({ code: "user_already_exists", message: "User already registered" }),
    ).toMatch(/already exists/);
    expect(
      signupErrorMessage({ code: "weak_password", message: "Password is known to be weak" }),
    ).toMatch(/stronger password/);
    expect(signupErrorMessage({ status: 429, message: "rate limit" })).toMatch(/Too many attempts/);
    expect(signupErrorMessage({ message: "something odd" })).toBe(
      "Your account could not be created. Please try again.",
    );
  });

  it("validates invitation input on the shared schema", () => {
    expect(
      signupInviteInput.safeParse({ id: INC, email: "a@example.test", role: "responder" }).success,
    ).toBe(true);
    expect(signupCode.safeParse("g".repeat(32)).success).toBe(false);
  });
});
