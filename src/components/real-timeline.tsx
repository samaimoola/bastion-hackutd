import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { incidentMembershipOptions } from "@/lib/incident-queries";
import { activityKey, activityOptions } from "@/lib/activity-queries";
import { activityActor, activityChanges, activityField, activitySummary, activityValue } from "@/lib/activity-models";
import { Button } from "./ui/button";

const time = (value: string) => `${new Date(value).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`;
export function RealTimeline({ incidentId, userId }: { incidentId: string; userId: string }) {
  const client = useQueryClient();
  const membership = useQuery({ ...incidentMembershipOptions(userId, incidentId), refetchInterval: 5000, refetchIntervalInBackground: true });
  const role = membership.isError ? null : membership.data;
  const member = Boolean(role);
  const activity = useInfiniteQuery({ ...activityOptions(userId, incidentId), enabled: member });
  const [live, setLive] = useState("Connecting to live updates…");
  useEffect(() => {
    const key = activityKey(userId, incidentId);
    const clear = () => { void client.cancelQueries({ queryKey: key }); client.removeQueries({ queryKey: key }); };
    if (!member) { clear(); return; }
    let stopped = false;
    const checkAccess = () => { if (!stopped) void client.invalidateQueries({ queryKey: incidentMembershipOptions(userId, incidentId).queryKey }); };
    const refresh = () => { if (!stopped) { void client.invalidateQueries({ queryKey: key }); checkAccess(); } };
    const channel = supabase.channel(`activity-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incident_activity", filter: `incident_id=eq.${incidentId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_members", filter: `incident_id=eq.${incidentId}` }, () => { if (!stopped) { clear(); checkAccess(); } })
      .subscribe((status) => {
        if (stopped) return;
        if (status === "SUBSCRIBED") { setLive("Live updates connected"); refresh(); }
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setLive("Live updates unavailable. Refresh to check for activity.");
      });
    return () => { stopped = true; void supabase.removeChannel(channel); clear(); };
  }, [client, incidentId, userId, member, role]);
  if (membership.isPending) return <section className="py-6"><p role="status">Checking timeline access…</p></section>;
  if (!member) return <section className="py-6"><p role="alert">Timeline is unavailable or you no longer have incident access.</p><Button variant="outline" className="mt-4" onClick={() => { void membership.refetch(); }}>Check access again</Button></section>;
  const rows = [...new Map(activity.data?.pages.flatMap((page) => page.events).map((event) => [event.id, event])).values()].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id));
  const beganAt = activity.data?.pages[0]?.beganAt;
  return <section className="mx-auto max-w-4xl py-6">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-medium">Timeline</h2><p className="mt-2 text-sm text-muted-foreground">{live}</p></div><Button variant="outline" disabled={activity.isFetching} onClick={() => { void membership.refetch(); void activity.refetch(); }}><RefreshCw className="size-4" />Refresh</Button></header>
    {beganAt && <p className="mb-6 border-l-2 border-border pl-4 text-sm text-muted-foreground">Activity recording began {time(beganAt)}. Earlier changes were not recorded.</p>}
    {activity.isPending ? <p role="status">Loading timeline…</p> : activity.isError ? <p role="alert" className="text-destructive">{activity.error.message}</p> : rows.length === 0 ? <div className="border-y border-border py-10"><h3 className="text-lg font-medium">No activity recorded yet</h3><p className="mt-3 text-sm text-muted-foreground">New incident changes will appear here.</p></div> : <>
      <ol aria-label="Incident activity" className="divide-y divide-border border-y border-border">{rows.map((event) => {
        const changes = activityChanges(event);
        return <li key={event.id} className="py-5"><h3 className="break-words text-base font-medium">{activitySummary(event)}</h3><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="break-words">{activityActor(event)}{event.actor_id === userId ? " · You" : ""}</span><time dateTime={event.occurred_at} className="font-mono">{time(event.occurred_at)}</time></div>{changes.length > 0 && <dl className="mt-4 space-y-3 text-sm">{changes.map((change) => <div key={change.field}><dt className="font-medium">{activityField(change.field)}</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-6 text-muted-foreground">{"before" in change ? `${activityValue(change.before)} → ${activityValue(change.after)}` : activityValue(change.after)}</dd></div>)}</dl>}<details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Activity references</summary><div className="mt-2 space-y-1 break-all font-mono"><p>Actor: {event.actor_id}</p><p>Record: {event.entity_id}</p></div></details></li>;
      })}</ol>
      {activity.hasNextPage && <Button variant="outline" className="mt-5" disabled={activity.isFetchingNextPage} onClick={() => { void activity.fetchNextPage(); }}>{activity.isFetchingNextPage ? "Loading…" : "Earlier activity"}</Button>}
    </>}
  </section>;
}