import { describe, expect, it } from "vitest";
import { invitationOrigin, invitationUrl } from "@/lib/invitation-url";

const project = "9ba069c6-8ccc-4ed0-a83b-625dfa770c44";
describe("externally shareable invitations", () => {
  it.each([
    `https://${project}.lovableproject.com`,
    `https://${project}.lovableproject-dev.com`,
    `https://id-preview--${project}.lovable.app`,
    `https://id-preview-6--${project}.lovable.app`,
    `https://id-preview-abcdef--${project}.lovable.app`,
    "https://preview--bastion.lovable.app",
    "https://preview-6--bastion.workspace.lovable.app",
    `https://project--${project}-dev.lovable.app`,
    `https://live--${project}.workspace.lovable.app`,
    `https://live--${project}-thr_abc.workspace.lovable.app`,
    "https://preview-abcdef--bastion.gpt-eng.com",
    "https://preview--bastion.gptengineer.run",
    "https://lovable.dev",
    "http://localhost:8080",
  ])("never offers a preview/editor/local address: %s", (origin) => {
    expect(invitationOrigin(origin)).toBe("https://incident-command-harbor.lovable.app");
  });
  it.each(["https://incident-command-harbor.lovable.app", "https://bastion.example.org", `https://project--${project}.lovable.app`])("uses the published runtime origin rather than embedded configuration: %s", (origin) => {
    expect(invitationOrigin(origin, "https://old-bastion.example.org")).toBe(origin);
  });
  it.each(["", "https://preview--bastion.lovable.app", "https://lovable.dev", "http://bastion.example.org"])("refuses unsafe or missing canonical configuration: %s", (canonical) => {
    expect(() => invitationOrigin("https://preview--bastion.lovable.app", canonical)).toThrow();
  });
  it("retains /invite and puts the credential only in the fragment", () => {
    const url = new URL(invitationUrl(`https://${project}.lovableproject.com`, "synthetic-test-credential"));
    expect(url.origin).toBe("https://incident-command-harbor.lovable.app");
    expect(url.pathname).toBe("/invite");
    expect(url.search).toBe("");
    expect(url.hash.startsWith("#invite=")).toBe(true);
  });
});