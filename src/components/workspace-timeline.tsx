import { useState } from "react";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { useWorkspace } from "@/lib/workspace-api";
import { entryTypes, eventInput, utcInputValue, type EntryType } from "@/lib/workspace-models";
import { fmt } from "@/lib/demo-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function WorkspaceTimeline({ open, setOpen }: { open: boolean; setOpen: (value: boolean) => void }) {
  const { timeline, api } = useWorkspace();
  const [text, setText] = useState("");
  const [type, setType] = useState<EntryType>("Finding");
  const [at, setAt] = useState(() => utcInputValue());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const entries = [...timeline].sort((a, b) => b.at.localeCompare(a.at) || b.recordedAt.localeCompare(a.recordedAt));
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSuccess("");
    try {
      const input = eventInput(text, type, at);
      setSaving(true);
      await api.recordEvent(input);
      setText(""); setAt(utcInputValue()); setOpen(false);
      setSuccess("Update recorded in demo data. Changes are not saved after refresh.");
    } catch (failure) {
      setError(failure instanceof z.ZodError ? failure.issues[0]?.message ?? "Check the update." : "Update could not be saved. Your text is preserved; try again.");
    } finally { setSaving(false); }
  }
  return <section aria-labelledby="timeline-title">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 id="timeline-title" className="text-lg font-medium">Incident timeline</h2><p className="text-xs text-muted-foreground">Event time, newest first · All times UTC</p></div><Button onClick={() => { setSuccess(""); setOpen(true); }}><Plus className="size-4" aria-hidden /> Add update</Button></div>
    {success && <p role="status" className="mb-4 text-sm text-success">{success}</p>}
    <ol className="divide-y divide-border">{entries.map((entry) => <li key={entry.id} className="grid gap-2 py-4 sm:grid-cols-[150px_1fr]"><div><p className="font-mono text-xs text-muted-foreground"><time dateTime={entry.at}>{fmt(entry.at)}</time></p><p className="mt-1 text-xs font-medium text-primary">{entry.type}</p></div><div><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{entry.text}</p><p className="mt-2 text-xs text-muted-foreground">{entry.author} · Recorded <time dateTime={entry.recordedAt}>{fmt(entry.recordedAt)}</time></p></div></li>)}{entries.length === 0 && <li className="py-8 text-sm text-muted-foreground">No updates recorded.</li>}</ol>
    <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}><DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto"><DialogHeader><DialogTitle>Record an update</DialogTitle><DialogDescription>Synthetic incident record · All times UTC · Author: signed-in user (demo log)</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4">
      <div className="space-y-2"><Label htmlFor="entry-type">Entry type</Label><Select value={type} onValueChange={(value) => setType(value as EntryType)} disabled={saving}><SelectTrigger id="entry-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{entryTypes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="event-time">Event time (UTC)</Label><Input id="event-time" type="datetime-local" required value={at} max={utcInputValue()} onChange={(e) => setAt(e.target.value)} disabled={saving} /></div>
      <div className="space-y-2"><Label htmlFor="update-text">Update</Label><Textarea id="update-text" required maxLength={2000} rows={5} value={text} onChange={(e) => setText(e.target.value)} disabled={saving} aria-describedby="update-limit" /><p id="update-limit" className="text-xs text-muted-foreground">{text.length}/2,000 characters</p></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 aria-hidden className="size-4 animate-spin" />}{saving ? "Recording…" : "Record update"}</Button></div>
    </form></DialogContent></Dialog>
  </section>;
}