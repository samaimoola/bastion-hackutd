import { useRef, useState } from "react";
import { SimpleHint } from "./simple-mode";
import { terms } from "@/lib/plain-language";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Copy, Link2, Trash2, Users } from "lucide-react";
import { changeIncidentMember, issueIncidentInvitation, listIncidentMembers, removeIncidentMember } from "@/lib/incident-access.functions";
import { inviteRoleSchema, memberRoleSchema } from "@/lib/incident-access-models";
import { incidentKeys, incidentMembershipOptions } from "@/lib/incident-queries";
import { invitationOrigin, invitationUrl } from "@/lib/invitation-url";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function IncidentTeamAccess({ id, userId }: { id: string; userId: string }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(true)}><Users className="size-4" aria-hidden />Team access</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Team access</DialogTitle><DialogDescription>People with access to this incident.</DialogDescription></DialogHeader>
      <IncidentTeamPanel key={`${userId}:${id}`} id={id} userId={userId} />
    </DialogContent></Dialog></>;
}

export function IncidentTeamPanel({ id, userId }: { id: string; userId: string }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const membership = useQuery(incidentMembershipOptions(userId, id));
  const members = useQuery(queryOptions({ queryKey: [...incidentKeys.all, userId, "members", id], queryFn: () => listIncidentMembers({ data: { id } }), retry: false, staleTime: 0 }));
  const commander = !membership.isError && !membership.isFetching && membership.data === "commander";
  const [role, setRole] = useState<"responder" | "viewer">("responder");
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const issue = useServerFn(issueIncidentInvitation);
  const change = useServerFn(changeIncidentMember);
  const remove = useServerFn(removeIncidentMember);
  const mutation = useMutation({ mutationFn: async (action: () => Promise<void>) => action(), gcTime: 0 });
  const refresh = async () => { await client.invalidateQueries({ queryKey: [...incidentKeys.all, userId] }); };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setError(null);
    try { await mutation.mutateAsync(action); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The change could not be saved."); }
    finally { lock.current = false; mutation.reset(); }
  };
  if (members.isPending || membership.isPending) return <p role="status" className="py-6 text-sm text-muted-foreground">Loading team access…</p>;
  if (members.isError || membership.isError) return <div role="alert"><p>Team access could not be checked.</p><Button variant="outline" className="mt-3" onClick={() => { void members.refetch(); void membership.refetch(); }}>Try again</Button></div>;
  const lastCommander = members.data.filter((m) => m.role === "commander").length === 1;
  return <div className="space-y-6">
    <p className="text-sm text-muted-foreground">Commander: manages access · Responder: edits incident · Viewer: read only</p>
    <SimpleHint>{terms.commander} {terms.responder} A viewer is {terms.viewer.charAt(0).toLowerCase()}{terms.viewer.slice(1)}</SimpleHint>
    <ul className="divide-y divide-border border-y border-border">{members.data.map((member) => {
      const protectLast = member.role === "commander" && lastCommander;
      return <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0 flex-1"><p className="break-all font-mono text-xs">{member.user_id}</p>{member.user_id === userId && <p className="mt-1 text-xs text-muted-foreground">You</p>}</div>
        {commander ? <div className="flex items-center gap-2"><Select value={member.role} disabled={mutation.isPending || protectLast} onValueChange={(value) => { void run(async () => { await change({ data: { id, userId: member.user_id, role: memberRoleSchema.parse(value) } }); setLink(null); if (member.user_id === userId && value !== "commander") { await navigate({ to: "/" }); } await refresh(); }); }}><SelectTrigger className="w-32" aria-label={`Role for ${member.user_id}`}><SelectValue /></SelectTrigger><SelectContent>{memberRoleSchema.options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>
          <Button variant="ghost" size="icon" aria-label={`Remove access for ${member.user_id}`} title={protectLast ? "Keep at least one commander" : "Remove access"} disabled={mutation.isPending || protectLast} onClick={() => { if (!window.confirm("Remove this person's access to this incident?")) return; void run(async () => { await remove({ data: { id, userId: member.user_id } }); setLink(null); if (member.user_id === userId) await navigate({ to: "/" }); await refresh(); }); }}><Trash2 className="size-4 text-destructive" /></Button></div> : <span className="text-sm capitalize">{member.role}</span>}
        {protectLast && <p className="basis-full text-xs text-muted-foreground">Keep at least one commander.</p>}
      </li>;
    })}</ul>
    {commander && <section className="space-y-3"><h2 className="text-lg font-medium">Invite someone</h2><p className="text-sm text-muted-foreground">Share a one-use link with someone who already has a Bastion account. It expires in 24 hours.</p>
      <div className="flex flex-wrap items-end gap-3"><div className="space-y-2"><Label htmlFor="invited-role">Access level</Label><Select value={role} onValueChange={(value) => setRole(inviteRoleSchema.parse(value))}><SelectTrigger id="invited-role" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="responder">Responder</SelectItem><SelectItem value="viewer">Viewer</SelectItem></SelectContent></Select></div><Button disabled={mutation.isPending} onClick={() => { void run(async () => { const origin = invitationOrigin(window.location.origin); const result = await issue({ data: { id, role } }); setLink({ url: invitationUrl(origin, result.token), expiresAt: result.expiresAt }); setCopied(false); }); }}><Link2 className="size-4" />Generate invitation link</Button></div>
      {link && <div className="space-y-2"><Label htmlFor="invitation-link">Invitation link</Label><div className="flex gap-2"><Input id="invitation-link" readOnly value={link.url} /><Button variant="outline" size="icon" aria-label="Copy invitation link" title="Copy invitation link" onClick={() => { void navigator.clipboard.writeText(link.url).then(() => setCopied(true)).catch(() => setError("Copy failed. Select and copy the link instead.")); }}><Copy className="size-4" /></Button></div><p className="text-xs text-muted-foreground">{copied ? "Copied · " : ""}Expires {new Date(link.expiresAt).toLocaleString()}</p></div>}
    </section>}
    {!commander && <div><p className="text-sm text-muted-foreground">Only commanders can invite people or change access.</p><SimpleHint className="mt-1">If someone needs access or a different role, ask a commander listed above.</SimpleHint></div>}
    {mutation.isPending && <p role="status" className="text-sm">Saving…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}