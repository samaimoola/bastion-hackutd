import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Megaphone, MessageSquare } from "lucide-react";
import type { IncidentRecord } from "@/lib/incident-models";
import { affectedOptions } from "@/lib/affected-system-queries";
import { latestStakeholderRecord } from "@/lib/stakeholder-update";
import { stageMeaning } from "@/lib/workspace-models";
import { SeverityBadge, StageBadge } from "./app-shell";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

const formatTime = (value: string) =>
  `${new Date(value).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC`;
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Ported from the teammate's dashboard. Shows the most recently updated incident the signed-in user can
 * access, as saved. It is not an approved or sent announcement, it never infers containment from the
 * existence of records, and it says plainly what has not been recorded.
 */
export function StakeholderUpdateCard({
  incidents,
  userId,
}: {
  incidents: readonly IncidentRecord[];
  userId: string;
}) {
  const incident = latestStakeholderRecord(incidents);
  return (
    <Card
      className="mb-8 min-w-0 rounded-lg border-border shadow-none"
      aria-labelledby="stakeholder-update-title"
    >
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Megaphone className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <h2 id="stakeholder-update-title" className="text-xl font-medium">
              Latest incident update for stakeholders
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              From the saved incident record
              {incidents.length > 1
                ? `, the most recently updated of ${count(incidents.length, "incident")} you can access`
                : ""}
              . Not an approved or sent announcement.
            </p>
          </div>
        </div>
        {incident ? (
          <StakeholderBody incident={incident} userId={userId} />
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            No incident update with a valid saved time is available yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StakeholderBody({ incident, userId }: { incident: IncidentRecord; userId: string }) {
  // Same member-scoped query the workspace uses; the database decides what this account may read.
  const systems = useQuery(affectedOptions(userId, incident.id));
  const rows = systems.data ?? [];
  const by = (status: string) => rows.filter((r) => r.containment_status === status).length;
  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <SeverityBadge s={incident.severity} />
        <StageBadge s={incident.stage} />
      </div>
      <h3 className="mt-3 break-words text-lg font-medium">{incident.title}</h3>
      <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7">
        {incident.summary ||
          "No description has been recorded yet, so what happened is still unknown here."}
      </p>
      <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
        <div>
          <dt className="inline font-medium">Recorded stage: </dt>
          <dd className="inline">
            {incident.stage}. {stageMeaning[incident.stage] ?? ""}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">Recorded severity: </dt>
          <dd className="inline">{incident.severity}. This may still be an initial estimate.</dd>
        </div>
        <div aria-live="polite">
          <dt className="inline font-medium">Affected systems: </dt>
          <dd className="inline">
            {systems.isPending ? (
              <span className="text-muted-foreground">Loading recorded systems…</span>
            ) : systems.isError ? (
              <span className="text-muted-foreground">
                Could not be loaded. Open the incident to check.
              </span>
            ) : rows.length === 0 ? (
              "None recorded yet. That does not mean nothing is affected."
            ) : (
              <>
                {count(rows.length, "system")} recorded: {by("not contained")} not contained,{" "}
                {by("in progress")} in progress, {by("contained")} marked contained. Recorded
                statuses do not confirm the incident is contained.
              </>
            )}
          </dd>
        </div>
        <p className="text-xs text-muted-foreground">
          Incident record updated{" "}
          <time dateTime={incident.lastUpdate}>{formatTime(incident.lastUpdate)}</time>
        </p>
      </dl>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button asChild className="w-full sm:w-auto">
          <Link to="/incidents/$id" params={{ id: incident.id }}>
            View incident <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link to="/incidents/$id" params={{ id: incident.id }} search={{ tab: "chat" }}>
            <MessageSquare className="size-4" aria-hidden />
            Team chat
          </Link>
        </Button>
      </div>
    </>
  );
}
