// MOCKED tests only: Supabase is mocked, tokens are fake values generated here, and nothing
// touches the network or .env. They do not prove live authentication works.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const getSession = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: (...args: unknown[]) => getSession(...args) } },
}));

import { forwardSupabaseToken, unauthorizedToResponse } from "@/lib/supabase-bearer-middleware";
import { startInstance } from "@/start";

// Small seeded PRNG (no new dependencies); 100 iterations per property.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._- :/=";
function str(r: () => number, min = 1, max = 40) {
  const n = min + Math.floor(r() * (max - min + 1));
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHABET[Math.floor(r() * ALPHABET.length)];
  return out;
}
const ITER = 100;
type StartOptions = { requestMiddleware: unknown[]; functionMiddleware: unknown[] };

// The middleware objects keep the handler in `options`; call them directly with a fake `next`.
type Handler = (arg: { next: (...a: unknown[]) => unknown }) => Promise<unknown>;
const clientHandler = (forwardSupabaseToken as unknown as { options: { client: Handler } }).options
  .client;
const serverHandler = (unauthorizedToResponse as unknown as { options: { server: Handler } })
  .options.server;

const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;
let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  getSession.mockReset();
  consoleSpies = consoleMethods.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => {
  consoleSpies.forEach((s) => s.mockRestore());
  vi.unstubAllGlobals();
});

describe("forwardSupabaseToken (client)", () => {
  // Feature: authenticated-server-function, Property 1: token present -> one Bearer header
  it("sends exactly one Bearer header, returns next's result unchanged, and never logs the token", async () => {
    const r = rng(1);
    for (let i = 0; i < ITER; i++) {
      const token = str(r, 8, 60);
      const sentinel = { opaque: str(r) };
      getSession.mockResolvedValue({ data: { session: { access_token: token } }, error: null });
      const next = vi.fn().mockResolvedValue(sentinel);

      const result = await clientHandler({ next });

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith({ headers: { Authorization: `Bearer ${token}` } });
      expect(result).toBe(sentinel);
    }
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  // Feature: authenticated-server-function, Property 2: no usable session -> no Authorization header
  it.each([
    ["null session", { data: { session: null }, error: null }],
    ["session without token", { data: { session: {} }, error: null }],
    ["empty token", { data: { session: { access_token: "" } }, error: null }],
    ["getSession error", { data: { session: null }, error: { message: "boom" } }],
  ])("sends no Authorization header for %s", async (_label, session) => {
    const r = rng(2);
    for (let i = 0; i < ITER; i++) {
      const sentinel = { opaque: str(r) };
      getSession.mockResolvedValue(session);
      const next = vi.fn().mockResolvedValue(sentinel);

      const result = await clientHandler({ next });

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(); // no arguments, so no headers
      expect(result).toBe(sentinel);
    }
  });

  it("does nothing and never reads the session when there is no window (SSR)", async () => {
    vi.stubGlobal("window", undefined);
    const sentinel = { ssr: true };
    const next = vi.fn().mockResolvedValue(sentinel);

    const result = await clientHandler({ next });

    expect(getSession).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
    expect(result).toBe(sentinel);
  });
});

describe("unauthorizedToResponse (server)", () => {
  // Feature: authenticated-server-function, Property 4: Unauthorized errors become a plain 401
  it("throws a plain 401 Response whose body never contains error detail", async () => {
    const r = rng(4);
    for (let i = 0; i < ITER; i++) {
      // Detail that must not leak: token-like, claim-like and env-like text.
      const detail = `${str(r, 12, 40)}.${str(r, 12, 40)}.${str(r, 12, 40)}`;
      const error = new Error(`Unauthorized: ${detail}`);
      const next = vi.fn().mockRejectedValue(error);

      let thrown: unknown;
      try {
        await serverHandler({ next });
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeInstanceOf(Response);
      const res = thrown as Response;
      expect(res.status).toBe(401);
      expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
      expect(await res.text()).toBe("Unauthorized");
      const headers = JSON.stringify([...res.headers.entries()]);
      expect(headers).not.toContain(detail);
    }
  });

  // Feature: authenticated-server-function, Property 5: everything else passes through unchanged
  it("rethrows any other value by identity", async () => {
    const r = rng(5);
    for (let i = 0; i < ITER; i++) {
      const candidates: unknown[] = [
        new Error(str(r)),
        new Error(`Server said Unauthorized: ${str(r)}`), // prefix only counts at the start
        Object.assign(new Error("x"), { statusCode: 500 }),
        { statusCode: 401, message: "Unauthorized" }, // not an Error instance
        "Unauthorized: plain string",
        new Response("other", { status: 418 }),
        null,
      ];
      for (const value of candidates) {
        const next = vi.fn().mockRejectedValue(value);
        await expect(serverHandler({ next })).rejects.toBe(value);
      }
    }
  });

  it("returns next's result by identity when nothing throws", async () => {
    const sentinel = { ok: true };
    const next = vi.fn().mockResolvedValue(sentinel);
    await expect(serverHandler({ next })).resolves.toBe(sentinel);
  });
});

describe("start.ts registration", () => {
  it("registers only the client middleware globally and keeps the request middleware", async () => {
    const options = await (
      startInstance as unknown as { getOptions: () => Promise<StartOptions> }
    ).getOptions();
    expect(options.functionMiddleware).toEqual([forwardSupabaseToken]);
    // Scoped 401 handling: the mapping must NOT be global.
    expect(options.functionMiddleware).not.toContain(unauthorizedToResponse);
    expect(options.requestMiddleware).toHaveLength(2);
  });

  it("has no attachSupabaseAuth reference left", () => {
    const src = readFileSync(path.resolve(__dirname, "../start.ts"), "utf8");
    expect(src).not.toContain("attachSupabaseAuth");
  });
});
