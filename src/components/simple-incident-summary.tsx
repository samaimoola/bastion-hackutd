import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { EditIncidentAction } from "./edit-incident-action";
import { affectedOptions } from "@/lib/affected-system-queries";
import { incidentMembershipOptions } from "@/lib/incident-queries";
import { canEditIncident, type IncidentRecord } from "@/lib/incident-models";
import { messagesOptions } from "@/lib/message-queries";
import { terms } from "@/lib/plain-language";
import { stageMeaning } from "@/lib/workspace-models";
import type { WorkspaceTab } from "@/lib/guide-navigation";

const formatTime = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function EntryPoint({
  id,
  title,
  explanation,
  children,
  action,
}: {
  id: string;
  title: string;
  explanation: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-5">
      <section aria-labelledby={id} className="flex flex-1 flex-col">
        <h2 id={id} className="text-xl font-medium">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{explanation}</p>
        <div className="mt-4 flex-1 text-base">{children}</div>
        <div className="mt-4">{action}</div>
      </section>
    </li>
  );
}

function OpenTab({
  incidentId,
  tab,
  children,
}: {
  incidentId: string;
  tab: WorkspaceTab;
  children: ReactNode;
}) {
  return (
    <Button asChild variant="outline" className="w-full sm:w-auto">
      <Link to="/incidents/$id" params={{ id: incidentId }} search={{ tab }}>
        {children}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Button>
  );
}

/**
 * Simple-mode Summary for a real incident: three entry points built only from saved records. It
 * states facts (counts, recorded statuses, latest message time) and never infers that the incident
 * is contained or recommends what to do next.
 */
export function SimpleIncidentSummary({
  incident: i,
  userId,
}: {
  incident: IncidentRecord;
  userId: string;
}) {
  const membership = useQuery(incidentMembershipOptions(userId, i.id));
  const role = membership.isError ? null : membership.data;
  const member = Boolean(role);
  const systems = useQuery({ ...affectedOptions(userId, i.id), enabled: member });
  const messages = useInfiniteQuery({ ...messagesOptions(userId, i.id), enabled: member });
  const canEdit = canEditIncident(role);

  const systemsState =
    membership.isPending || (member && systems.isPending)
      ? "Loading affected systems…"
      : !member || systems.isError
        ? "Affected systems could not be loaded."
        : null;
  const rows = systems.data ?? [];
  const byStatus = (status: string) => rows.filter((r) => r.containment_status === status).length;

  const firstPage = messages.data?.pages[0] ?? [];
  const latest = firstPage.reduce<string | null>(
    (max, m) => (max === null || m.created_at > max ? m.created_at : max),
    null,
  );
  const messagesState =
    membership.isPending || (member && messages.isPending)
      ? "Loading messages…"
      : !member || messages.isError
        ? "Messages could not be loaded."
        : null;

  return (
    <div className="space-y-6">
      <section aria-labelledby="where-things-stand" className="rounded-lg border border-border p-5">
        <h2 id="where-things-stand" className="text-xl font-medium">
          Where things stand
        </h2>
        <dl className="mt-3 space-y-2 text-base">
          <div>
            <dt className="inline font-medium">Stage: {i.stage}.</dt>{" "}
            <dd className="inline text-muted-foreground">{stageMeaning[i.stage] ?? ""}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Severity: {i.severity}.</dt>{" "}
            <dd className="inline text-muted-foreground">{terms.severity}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Last updated:</dt>{" "}
            <dd className="inline">{formatTime(i.lastUpdate)} UTC</dd>
          </div>
        </dl>
      </section>
      <ul aria-label="Main things to do" className="grid gap-4 md:grid-cols-3">
        <EntryPoint
          id="entry-what-happened"
          title="What happened?"
          explanation="The description the team has written for this incident."
          action={
            <EditIncidentAction
              key={`${userId}:${i.id}`}
              incident={i}
              userId={userId}
              label="Edit what happened"
              readOnlyText="You have read-only access, so you can read this but not change it."
            />
          }
        >
          <p className="whitespace-pre-wrap break-words leading-7">
            {i.summary || "No description has been written yet."}
          </p>
        </EntryPoint>
        <EntryPoint
          id="entry-whats-affected"
          title={"What\u2019s affected?"}
          explanation="Computers, accounts and data the team has recorded."
          action={
            <OpenTab incidentId={i.id} tab="systems">
              {canEdit ? "Open and add systems" : "Open the list"}
            </OpenTab>
          }
        >
          {systemsState ? (
            <p className="text-muted-foreground">{systemsState}</p>
          ) : rows.length === 0 ? (
            <p>No affected systems recorded.</p>
          ) : (
            <>
              <p>{count(rows.length, "system")} recorded.</p>
              <ul className="mt-2 space-y-1 text-sm">
                <li>Not contained: {byStatus("not contained")}</li>
                <li>In progress: {byStatus("in progress")}</li>
                <li>Marked contained: {byStatus("contained")}</li>
              </ul>
              <p className="mt-2 text-sm text-muted-foreground">
                These are the statuses the team recorded. They do not confirm that the incident is
                contained.
              </p>
            </>
          )}
        </EntryPoint>
        <EntryPoint
          id="entry-talk-to-team"
          title="Talk to your team"
          explanation="Messages that everyone with access to this incident can read."
          action={
            <OpenTab incidentId={i.id} tab="chat">
              {canEdit ? "Open Team chat" : "Read Team chat"}
            </OpenTab>
          }
        >
          {messagesState ? (
            <p className="text-muted-foreground">{messagesState}</p>
          ) : firstPage.length === 0 ? (
            <p>No messages yet.</p>
          ) : (
            <p>
              {messages.hasNextPage ? "More than 100 messages" : count(firstPage.length, "message")}
              . Latest {latest ? `${formatTime(latest)} UTC` : "time unknown"}.
            </p>
          )}
          {member && !canEdit && !membership.isFetching && (
            <p className="mt-2 text-sm text-muted-foreground">
              You have read-only access, so you can read messages but not post.
            </p>
          )}
        </EntryPoint>
      </ul>
    </div>
  );
}
