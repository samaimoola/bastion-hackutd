import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AppShell, SeverityBadge } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt, useDemo } from "@/lib/demo-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Incidents — Bastion" },
      { name: "description", content: "Overview of active cyber incidents, severity, stage, and next actions." },
      { property: "og:title", content: "Incidents — Bastion" },
      { property: "og:description", content: "Overview of active cyber incidents, severity, stage, and next actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { incident: i, memberName, tasks } = useDemo();
  const open = tasks.filter((t) => t.status !== "Done").length;
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Active incidents</h1>
      <p className="mt-1 text-sm text-muted-foreground">1 active incident · synthetic demo record</p>
      <Card className="mt-6 border-l-4 border-l-destructive">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{i.id}</p>
            <CardTitle className="mt-1 text-lg">{i.title}</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              <SeverityBadge s={i.severity} />
              <Badge variant="info">Stage: {i.stage}</Badge>
              <Badge variant="neutral">{open} open tasks</Badge>
            </div>
          </div>
          <Button asChild>
            <Link to="/incidents/$id" params={{ id: i.id }}>Open workspace <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-muted-foreground">Commander</dt><dd className="font-medium">{memberName(i.commanderId)}</dd></div>
            <div><dt className="text-muted-foreground">Declared</dt><dd>{fmt(i.declaredAt)}</dd></div>
            <div><dt className="text-muted-foreground">Last update</dt><dd>{fmt(i.lastUpdate)}</dd></div>
          </dl>
          <div className="md:col-span-2">
            <h3 className="text-sm font-medium text-muted-foreground">Next actions</h3>
            <ol className="mt-2 space-y-2 text-sm">
              {i.nextActions.map((a, n) => (
                <li key={a} className="flex gap-3 rounded-md bg-muted px-3 py-2">
                  <span className="font-mono text-muted-foreground">{n + 1}.</span>{a}
                </li>
              ))}
            </ol>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
