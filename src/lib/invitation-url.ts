// Confirmed public destination for invitations generated on non-public surfaces.
export const CANONICAL_PUBLISHED_APP_URL = "https://incident-command-harbor.lovable.app";

export function isNonPublicInvitationHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const inZone = (zone: string) => host === zone || host.endsWith(`.${zone}`);
  if (["lovableproject.com", "lovableproject-dev.com", "lovable.dev", "gptengineer.app"].some(inZone)) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || /^127\./.test(host)) return true;
  if (!["lovable.app", "gpt-eng.com", "gptengineer.run"].some(inZone)) return false;
  const first = host.split(".")[0];
  return /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(first)
    || /^project--[0-9a-f-]{36}-dev$/.test(first)
    || /^live--[0-9a-f-]{36}(?:-thr_[a-z0-9]+)?$/.test(first);
}

export function invitationOrigin(runtimeOrigin: string, canonicalUrl = CANONICAL_PUBLISHED_APP_URL): string {
  // Never include a caller's path, query, fragment, or credentials in a shared URL.
  let runtime: URL;
  try { runtime = new URL(runtimeOrigin); }
  catch { throw new Error("The app address is unavailable. No invitation link was generated."); }
  if (runtime.protocol === "https:" && !runtime.username && !runtime.password && !isNonPublicInvitationHost(runtime.hostname)) {
    return runtime.origin;
  }
  let canonical: URL;
  try { canonical = new URL(canonicalUrl); }
  catch { throw new Error("Configure a published Bastion address before sharing invitations from preview."); }
  if (canonical.protocol !== "https:" || canonical.username || canonical.password || isNonPublicInvitationHost(canonical.hostname)) {
    throw new Error("Configure a public HTTPS Bastion address before sharing invitations from preview.");
  }
  return canonical.origin;
}

export function invitationUrl(origin: string, token: string): string {
  const url = new URL("/invite", invitationOrigin(origin));
  url.hash = `invite=${encodeURIComponent(token)}`;
  return url.href;
}