import { createFileRoute } from "@tanstack/react-router";
import { SimpleHint } from "@/components/simple-mode";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDemo, type Role } from "@/lib/demo-store";

const roles: Role[] = ["Incident Commander", "Responder", "Communications", "Legal", "Observer"];

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team administration — Bastion" },
      { name: "description", content: "Manage incident-response team members and roles." },
      { property: "og:title", content: "Team administration — Bastion" },
      { property: "og:description", content: "Manage incident-response team members and roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Team,
});

function Team() {
  const { members, setMembers } = useDemo();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Responder");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (members.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
      toast.error("That email is already on the team.");
      return;
    }
    setMembers((m) => [...m, { id: Math.random().toString(36).slice(2), name, email, role, active: true }]);
    toast.success(`${name} added (demo only)`);
    setName(""); setEmail("");
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Administration" title="Response team">
        <p className="mt-2 text-sm text-muted-foreground">Changes are local to this tab and are not saved.</p>
        <SimpleHint className="mt-2 max-w-xl">This is a practice list. Real incident access is managed under Team access inside each incident.</SimpleHint>
      </PageHeader>
      <Card className="panel border-border">
        <CardHeader><CardTitle className="font-display text-lg font-medium">Add member</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="flex flex-wrap gap-3">
            <Input aria-label="Name" placeholder="Full name" required value={name} onChange={(e) => setName(e.target.value)} className="w-48" />
            <Input aria-label="Email" type="email" placeholder="email@example.test" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-64" />
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-48" aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="submit">Add member</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="panel mt-6 overflow-hidden border-border">
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{m.email}</TableCell>
                <TableCell>
                  <Select value={m.role} onValueChange={(v) => setMembers((all) => all.map((x) => (x.id === m.id ? { ...x, role: v as Role } : x)))}>
                    <SelectTrigger className="h-8 w-44" aria-label={`Role for ${m.name}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Badge variant={m.active ? "success" : "neutral"}>{m.active ? "Active" : "Deactivated"}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant={m.active ? "destructive" : "outline"} onClick={() => setMembers((all) => all.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)))}>
                    {m.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </AppShell>
  );
}
