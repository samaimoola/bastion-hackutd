import { useEffect, useRef, useState } from "react";
import { SimpleHint } from "./simple-mode";
import { useSimpleMode } from "@/lib/simple-mode-context";
import { emptyNextStep, fieldHints, permissionNextStep } from "@/lib/plain-language";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { incidentMembershipOptions } from "@/lib/incident-queries";
import { messagesKey, messagesOptions } from "@/lib/message-queries";
import { MESSAGE_LIMIT, messageAuthor, messageBody } from "@/lib/message-models";
import { sendIncidentMessage } from "@/lib/messages.functions";
import { canEditIncident } from "@/lib/incident-models";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";

export function RealCommunications({ incidentId, userId }: { incidentId: string; userId: string }) {
  const { simple } = useSimpleMode();
  const client = useQueryClient();
  // DELETE events are not reliably delivered to a removed member under RLS.
  // Recheck access as well as listening for membership events; fail closed on errors.
  const membership = useQuery({ ...incidentMembershipOptions(userId, incidentId), refetchInterval: 5000, refetchIntervalInBackground: true });
  const role = membership.isError ? null : membership.data;
  const member = Boolean(role);
  const messages = useInfiniteQuery({ ...messagesOptions(userId, incidentId), enabled: member });
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState("Connecting to live updates…");
  const lock = useRef(false);
  const attempt = useRef<{ body: string; id: string } | null>(null);
  const active = useRef(false);
  const send = useServerFn(sendIncidentMessage);
  const mutation = useMutation({ mutationFn: send, gcTime: 0 });
  useEffect(() => {
    const key = messagesKey(userId, incidentId);
    if (!member) {
      void client.cancelQueries({ queryKey: key }); client.removeQueries({ queryKey: key });
      setDraft(""); attempt.current = null;
      return;
    }
    active.current = true;
    let stopped = false;
    const refresh = () => { if (!stopped) { void client.invalidateQueries({ queryKey: key }); void client.invalidateQueries({ queryKey: incidentMembershipOptions(userId, incidentId).queryKey }); } };
    const channel = supabase.channel(`messages-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incident_messages", filter: `incident_id=eq.${incidentId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_members", filter: `incident_id=eq.${incidentId}` }, () => {
        if (stopped) return;
        void client.cancelQueries({ queryKey: key }); client.removeQueries({ queryKey: key });
        void client.invalidateQueries({ queryKey: incidentMembershipOptions(userId, incidentId).queryKey });
      })
      .subscribe((status) => {
        if (stopped) return;
        if (status === "SUBSCRIBED") { setLive("Live updates connected"); refresh(); }
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setLive("Live updates unavailable. Refresh to check for new messages.");
      });
    return () => {
      stopped = true; active.current = false;
      void supabase.removeChannel(channel);
      void client.cancelQueries({ queryKey: key }); client.removeQueries({ queryKey: key });
    };
  }, [client, incidentId, userId, member, role]);

  const rows = [...new Map(messages.data?.pages.flat().map((row) => [row.id, row])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  if (membership.isPending) return <section className="py-6"><p role="status">Checking message access…</p></section>;
  if (!member) return <section className="py-6"><p role="alert">Messages are unavailable or you no longer have incident access.</p><Button variant="outline" className="mt-4" onClick={() => { void membership.refetch(); }}>Check access again</Button></section>;
  const allowed = !membership.isFetching && canEditIncident(role);
  return <section className="mx-auto max-w-4xl py-6">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-medium">Communications</h2><p className="mt-2 text-sm text-muted-foreground">{live}</p></div><Button variant="outline" disabled={messages.isFetching} onClick={() => { void membership.refetch(); void messages.refetch(); }}><RefreshCw className="size-4" />Refresh</Button></header>
    {messages.isPending ? <p role="status">Loading messages…</p> : messages.isError ? <p role="alert" className="text-destructive">{messages.error.message}</p> : rows.length === 0 ? <div className="border-y border-border py-10"><h3 className="text-lg font-medium">No messages yet</h3><p className="mt-3 text-sm text-muted-foreground">{allowed ? "Share an update with the incident team." : "Messages from the incident team will appear here."}</p>{allowed && <SimpleHint className="mt-2">{emptyNextStep.messagesCanSend}</SimpleHint>}</div> : <>
      {messages.hasNextPage && <Button variant="outline" className="mb-4" disabled={messages.isFetchingNextPage} onClick={() => { void messages.fetchNextPage(); }}>{messages.isFetchingNextPage ? "Loading…" : "Earlier messages"}</Button>}
      <ol aria-label="Incident messages" className="divide-y divide-border border-y border-border">{rows.map((row) => <li key={row.id} className="py-5"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="break-words text-sm font-medium">{messageAuthor(row)}{row.sender_id === userId ? " · You" : ""}</p><time dateTime={row.created_at} className="font-mono text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{row.body}</p><details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Author reference</summary><p className="mt-1 break-all font-mono">{row.sender_id}</p></details></li>)}</ol>
    </>}
    {allowed ? <form className="mt-6 space-y-3" onSubmit={async (event) => {
      event.preventDefault(); if (lock.current || !active.current) return;
      const parsed = messageBody.safeParse(draft);
      if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check your message."); return; }
      if (attempt.current?.body !== parsed.data) attempt.current = { body: parsed.data, id: crypto.randomUUID() };
      const requestId = attempt.current.id;
      lock.current = true; setError(null);
      try {
        await mutation.mutateAsync({ data: { incidentId, body: parsed.data, requestId } });
        if (active.current) { setDraft(""); attempt.current = null; await client.invalidateQueries({ queryKey: messagesKey(userId, incidentId) }); }
      } catch (failure) {
        if (active.current) { setError(failure instanceof Error ? failure.message : "The message could not be sent."); void membership.refetch(); }
      } finally { lock.current = false; mutation.reset(); }
    }}><Label htmlFor="incident-message">Message</Label><SimpleHint id="hint-incident-message">{fieldHints.message}</SimpleHint><Textarea id="incident-message" aria-describedby={simple ? "hint-incident-message" : undefined} rows={4} maxLength={MESSAGE_LIMIT} disabled={mutation.isPending} value={draft} onChange={(event) => setDraft(event.target.value)} /><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{draft.length.toLocaleString()} / 4,000</p><Button type="submit" disabled={mutation.isPending || !draft.trim()}><Send className="size-4" />{mutation.isPending ? "Sending…" : "Send message"}</Button></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</form> : <div className="mt-6"><p className="text-sm text-muted-foreground">View-only access. Only commanders and responders can send messages.</p><SimpleHint className="mt-1">{permissionNextStep}</SimpleHint></div>}
  </section>;
}