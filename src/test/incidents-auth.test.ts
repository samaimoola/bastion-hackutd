// MOCKED test of the REAL generated requireSupabaseAuth middleware that guards the incident
// functions. The request headers and the Supabase client are fakes, and env values are fake, so
// nothing contacts Supabase. It shows how the middleware treats missing/invalid credentials and
// which client it builds. It does NOT prove that a real token is accepted by a real project.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, createClientMock } = vi.hoisted(() => {
  const state = {
    authorization: null as string | null,
    claims: { data: null, error: null } as unknown,
  };
  const createClientMock = vi.fn((..._args: unknown[]) => ({
    auth: { getClaims: vi.fn(async () => state.claims) },
  }));
  return { state, createClientMock };
});

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({
    headers: new Headers(state.authorization ? { authorization: state.authorization } : {}),
  }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Next = (arg: { context: { supabase: unknown; userId: string; claims: unknown } }) => unknown;
const server = (
  requireSupabaseAuth as unknown as { options: { server: (a: { next: Next }) => Promise<unknown> } }
).options.server;

const FAKE_JWT = "aaaa.bbbb.cccc"; // three segments, fake
const FAKE_PUBLISHABLE = "sb_publishable_FAKE_FOR_TESTS";

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", FAKE_PUBLISHABLE);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "FAKE_SERVICE_ROLE_MUST_NOT_BE_USED");
  state.authorization = null;
  state.claims = { data: { claims: { sub: "user-123" } }, error: null };
  createClientMock.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("requireSupabaseAuth as used by the incident functions", () => {
  it("rejects a request with no Authorization header and never reaches the handler", async () => {
    const next = vi.fn();
    await expect(server({ next })).rejects.toThrow(/^Unauthorized/);
    expect(next).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-Bearer scheme", "Basic dXNlcjpwYXNz"],
    ["an empty Bearer token", "Bearer "],
    ["a token that is not a three-part JWT", "Bearer not-a-jwt"],
  ])("rejects %s", async (_label, header) => {
    state.authorization = header;
    const next = vi.fn();
    await expect(server({ next })).rejects.toThrow(/^Unauthorized/);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token that Supabase refuses to verify", async () => {
    state.authorization = `Bearer ${FAKE_JWT}`;
    state.claims = { data: null, error: { message: "internal verifier detail" } };
    const next = vi.fn();
    const err = await server({ next }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/^Unauthorized/);
    expect((err as Error).message).not.toContain("internal verifier detail");
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects verified claims that carry no user id", async () => {
    state.authorization = `Bearer ${FAKE_JWT}`;
    state.claims = { data: { claims: {} }, error: null };
    await expect(server({ next: vi.fn() })).rejects.toThrow(/^Unauthorized/);
  });

  it("accepts a verified token and passes a user-scoped client plus the verified user id", async () => {
    state.authorization = `Bearer ${FAKE_JWT}`;
    const next = vi.fn((_arg: unknown) => "handler-ran");
    const out = await server({ next });

    expect(out).toBe("handler-ran");
    const arg = next.mock.calls[0]?.[0] as unknown as {
      context: { userId: string; supabase: unknown };
    };
    expect(arg.context.userId).toBe("user-123");

    // The client is built with the publishable key and the caller's token, so row-level security
    // sees the caller. The service-role key is never read.
    const [, key, options] = createClientMock.mock.calls[0] as unknown as [
      string,
      string,
      { global: { headers: { Authorization: string } } },
    ];
    expect(key).toBe(FAKE_PUBLISHABLE);
    expect(key).not.toContain("SERVICE_ROLE");
    expect(options.global.headers.Authorization).toBe(`Bearer ${FAKE_JWT}`);
  });
});
