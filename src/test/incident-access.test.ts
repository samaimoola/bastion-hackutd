import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureInvitation, clearInvitation, hashInvitation, inviteInput, redeemInput } from "@/lib/incident-access-models";

beforeEach(() => { sessionStorage.clear(); window.history.replaceState(null, "", "/invite"); });
describe("Invitation credentials", () => {
  it("uses SHA-256 and rejects role/incident overrides in redemption", async () => {
    expect(await hashInvitation("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(redeemInput.safeParse({ hash: "a".repeat(64), role: "commander" }).success).toBe(false);
    expect(inviteInput.safeParse({ id: "11111111-1111-1111-1111-111111111111", role: "commander" }).success).toBe(false);
  });
  it("scrubs fragment credentials and restores only tab-scoped pending state", () => {
    window.history.replaceState(null, "", `/invite#invite=${"a".repeat(64)}`);
    expect(captureInvitation()).toBe("a".repeat(64));
    expect(window.location.hash).toBe("");
    expect(captureInvitation()).toBe("a".repeat(64));
    clearInvitation(); expect(captureInvitation()).toBeNull();
  });
  it("discards expired pending tokens", () => {
    window.history.replaceState(null, "", `/invite#invite=${"b".repeat(64)}`); captureInvitation();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 24 * 3600 * 1000 + 1);
    expect(captureInvitation()).toBeNull(); vi.restoreAllMocks();
  });
});