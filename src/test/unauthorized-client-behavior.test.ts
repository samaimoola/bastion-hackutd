// MOCKED test of the REAL framework client code. `fetch` is faked, so this documents how a browser
// caller treats a 401 shaped like unauthorizedToResponse's output. It does NOT prove the live server
// sends that shape (the `x-tss-raw` header is added by the framework's server handler); the live
// rejection check covers that.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncLocalStorage } from "node:async_hooks";
import { createClientRpc } from "@tanstack/react-start/client-rpc";

// In a browser the client reads window.__TSS_START_OPTIONS__. Under Vitest the framework's
// server-side branch runs instead and needs a Start context, so run each call inside the
// framework's global AsyncLocalStorage (internal symbol, test-only) with empty start options.
const startStorage = (globalThis as Record<symbol, unknown>)[
  Symbol.for("tanstack-start:start-storage-context")
] as AsyncLocalStorage<{ startOptions: object }>;

type RpcFn = (opts: { method: "POST"; headers?: HeadersInit }) => Promise<unknown>;

beforeEach(() => {
  vi.stubEnv("TSS_SERVER_FN_BASE", "/_serverFn/");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const call = (fetchImpl: typeof fetch) => {
  vi.stubGlobal("fetch", fetchImpl);
  return startStorage.run({ startOptions: {} }, () =>
    (createClientRpc("fake-id") as unknown as RpcFn)({ method: "POST" }),
  );
};

describe("browser caller on an unauthorized (401) server function response", () => {
  it("RESOLVES with the 401 Response when the server marks it raw (x-tss-raw: true)", async () => {
    const result = await call(
      async () =>
        new Response("Unauthorized", {
          status: 401,
          headers: {
            "content-type": "text/plain;charset=UTF-8",
            "www-authenticate": "Bearer",
            "x-tss-raw": "true",
          },
        }),
    );

    // Not a rejection: callers must check the returned value.
    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
  });

  it("would REJECT with the response text if the raw marker were missing (control)", async () => {
    await expect(
      call(
        async () =>
          new Response("Unauthorized", {
            status: 401,
            headers: { "content-type": "text/plain;charset=UTF-8" },
          }),
      ),
    ).rejects.toThrow("Unauthorized");
  });

  it("sends x-tsr-serverFn so the server uses the raw-response path", async () => {
    const fetchSpy = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response("Unauthorized", { status: 401, headers: { "x-tss-raw": "true" } }),
    );
    await call(fetchSpy as unknown as typeof fetch);
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("x-tsr-serverFn")).toBe("true");
  });
});
