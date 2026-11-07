import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { AppShell } from "./app-shell";
import { Button } from "./ui/button";
import { NOT_FOUND_MESSAGE } from "@/lib/incident-models";

export function IncidentLoading() {
  return <AppShell mode="live"><p role="status" className="py-12 text-muted-foreground">Loading incidents…</p></AppShell>;
}

export function IncidentNotFound() {
  return <AppShell mode="live"><h1 className="text-2xl">Incident not found</h1><p className="mt-3 text-sm text-muted-foreground">This incident does not exist or is not accessible to your account.</p><Button asChild variant="outline" className="mt-6"><Link to="/">All incidents</Link></Button></AppShell>;
}

export function IncidentError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  if (error instanceof Error && error.message === NOT_FOUND_MESSAGE) return <IncidentNotFound />;
  return <AppShell mode="live"><h1 className="text-2xl">Incidents could not be loaded</h1><p role="alert" className="mt-3 text-sm text-muted-foreground">Please try again. If your session has expired, sign in again.</p><Button className="mt-6" onClick={() => { void router.invalidate(); reset(); }}>Try again</Button></AppShell>;
}