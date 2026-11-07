// MOCKED tests only: the framework's createServerFn and both middleware are replaced with
// recording stand-ins, and values are generated here. They do not prove live authentication works.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

type HandlerArg = { context: Record<string, unknown> };

const { recorded, REQUIRE_AUTH, MAP_401 } = vi.hoisted(() => ({
  recorded: {} as {
    opts?: unknown;
    middleware?: unknown[];
    handler?: (a: HandlerArg) => Promise<unknown>;
  },
  REQUIRE_AUTH: { name: "requireSupabaseAuth (mock)" },
  MAP_401: { name: "unauthorizedToResponse (mock)" },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: (opts: unknown) => {
    recorded.opts = opts;
    const chain = {
      middleware: (m: unknown[]) => {
        recorded.middleware = m;
        return chain;
      },
      handler: (fn: (a: HandlerArg) => Promise<unknown>) => {
        recorded.handler = fn;
        return fn;
      },
    };
    return chain;
  },
}));

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: REQUIRE_AUTH }));
vi.mock("@/lib/supabase-bearer-middleware", () => ({ unauthorizedToResponse: MAP_401 }));

import "@/lib/auth.functions";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789-_.@";
const str = (r: () => number, n = 24) =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(r() * ALPHABET.length)]).join("");

const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;
let spies: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  spies = consoleMethods.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => spies.forEach((s) => s.mockRestore()));

describe("getAuthenticatedUserId definition", () => {
  it("uses POST", () => {
    expect(recorded.opts).toEqual({ method: "POST" });
  });

  it("puts the 401 mapping before requireSupabaseAuth, on this function only", () => {
    expect(recorded.middleware).toEqual([MAP_401, REQUIRE_AUTH]);
    expect(recorded.middleware?.[0]).toBe(MAP_401); // outermost, so it wraps the auth failure
  });

  it("does not reference the service-role admin client", () => {
    const src = readFileSync(path.resolve(__dirname, "../lib/auth.functions.ts"), "utf8");
    expect(src).not.toMatch(/client\.server/);
    expect(src).not.toMatch(/supabaseAdmin/);
  });
});

describe("getAuthenticatedUserId handler", () => {
  // Feature: authenticated-server-function, Property 3: returns only the authenticated user ID
  it("returns an object whose only key is userId, without leaking other context fields", async () => {
    const r = rng(3);
    for (let i = 0; i < 100; i++) {
      const userId = str(r, 36);
      const extra = {
        claims: { sub: userId, email: `${str(r, 8)}@example.test`, jwt: str(r, 40) },
        supabase: { token: str(r, 40) },
        token: str(r, 40),
      };
      const result = (await recorded.handler!({ context: { userId, ...extra } })) as Record<
        string,
        unknown
      >;

      expect(Object.keys(result)).toEqual(["userId"]);
      expect(result["userId"]).toBe(userId);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(extra.claims.email);
      expect(serialized).not.toContain(extra.claims.jwt);
      expect(serialized).not.toContain(extra.token);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
