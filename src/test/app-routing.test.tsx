import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "@/routeTree.gen";
// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
const ids = (path: string) => router.matchRoutes(path).map((m) => m.routeId);

describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    expect(router.matchRoutes("/").at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("serves the public welcome page at / outside the session gate", () => {
    expect(ids("/").at(-1)).toBe("/");
    expect(ids("/")).not.toContain("/_authenticated");
  });

  it("moves the incident list to /dashboard behind the session gate", () => {
    expect(ids("/dashboard")).toEqual([
      rootRouteId,
      "/_authenticated",
      "/_authenticated/dashboard",
    ]);
  });

  it("keeps direct incident links and other signed-in pages protected and unchanged", () => {
    expect(ids("/incidents/3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b")).toEqual([
      rootRouteId,
      "/_authenticated",
      "/_authenticated/incidents/$id",
    ]);
    expect(ids("/incidents/INC-2026-0412").at(-1)).toBe("/_authenticated/incidents/$id");
    expect(ids("/team")).toContain("/_authenticated");
    expect(ids("/guide")).toContain("/_authenticated");
  });

  it("keeps invitation redemption public so the link's fragment survives to its own sign-in step", () => {
    expect(ids("/invite")).toEqual([rootRouteId, "/invite"]);
    expect(ids("/login")).toEqual([rootRouteId, "/login"]);
  });

  it("serves invitation-only sign-up publicly, outside the session gate", () => {
    expect(ids("/signup")).toEqual([rootRouteId, "/signup"]);
  });

  it("does not add verification or account routes", () => {
    for (const path of ["/verify", "/account"]) expect(ids(path).at(-1)).not.toBe(path);
  });
});
