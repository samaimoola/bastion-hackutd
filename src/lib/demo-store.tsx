// SYNTHETIC DEMO DATA — temporary in-memory state only. Replaced by the authenticated backend next.
import { createContext, useContext, useState, type ReactNode } from "react";

export type Severity = "Critical" | "High" | "Medium" | "Low";
export type Stage = "Detection" | "Containment" | "Eradication" | "Recovery" | "Post-incident";
export type SystemStatus = "Encrypted" | "Isolated" | "Under review" | "Restored" | "Unaffected";
export type TaskStatus = "Open" | "In progress" | "Blocked" | "Done";
export type Role = "Incident Commander" | "Responder" | "Communications" | "Legal" | "Observer";

export interface Member { id: string; name: string; email: string; role: Role; active: boolean }
export interface System { id: string; name: string; type: string; owner: string; status: SystemStatus; note: string }
export interface Task { id: string; title: string; assigneeId: string; status: TaskStatus; due: string }
export interface TimelineEvent { id: string; at: string; author: string; text: string }
export interface ChatMessage { id: string; at: string; authorId: string; text: string }
export interface Incident {
  id: string; title: string; severity: Severity; stage: Stage; commanderId: string;
  declaredAt: string; lastUpdate: string; summary: string; nextActions: string[];
}

const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 9);

const members: Member[] = [
  { id: "m1", name: "Dana Okafor", email: "dana.okafor@example.test", role: "Incident Commander", active: true },
  { id: "m2", name: "Marcus Lee", email: "marcus.lee@example.test", role: "Responder", active: true },
  { id: "m3", name: "Priya Raman", email: "priya.raman@example.test", role: "Responder", active: true },
  { id: "m4", name: "Tom Brennan", email: "tom.brennan@example.test", role: "Communications", active: true },
  { id: "m5", name: "Elena Vasquez", email: "elena.vasquez@example.test", role: "Legal", active: true },
  { id: "m6", name: "Sam Whitfield", email: "sam.whitfield@example.test", role: "Observer", active: false },
];

const incident: Incident = {
  id: "INC-2026-0412",
  title: "Ransomware encryption on finance file servers",
  severity: "Critical",
  stage: "Containment",
  commanderId: "m1",
  declaredAt: "2026-11-07T06:42:00Z",
  lastUpdate: "2026-11-07T18:55:00Z",
  summary:
    "Files on two finance file servers were encrypted with a .lockr extension and a ransom note was found. Initial access is suspected via a compromised VPN account. Affected hosts are isolated; backups are being validated.",
  nextActions: [
    "Confirm integrity of last clean backup (Nov 6, 23:00)",
    "Reset credentials for all finance VPN accounts",
    "Brief executive team at 20:00 UTC",
  ],
};

const systems: System[] = [
  { id: "s1", name: "FIN-FS-01", type: "File server", owner: "IT Infrastructure", status: "Encrypted", note: "Ransom note found in \\\\Shares\\AP" },
  { id: "s2", name: "FIN-FS-02", type: "File server", owner: "IT Infrastructure", status: "Isolated", note: "Partial encryption, network disabled" },
  { id: "s3", name: "VPN-GW-EAST", type: "VPN gateway", owner: "Network Ops", status: "Under review", note: "Suspicious logins from unfamiliar IP range" },
  { id: "s4", name: "WS-FIN-114", type: "Workstation", owner: "Finance", status: "Isolated", note: "Likely patient zero" },
  { id: "s5", name: "BKP-VAULT-01", type: "Backup appliance", owner: "IT Infrastructure", status: "Under review", note: "Validating snapshot integrity" },
  { id: "s6", name: "ERP-APP-01", type: "Application server", owner: "Finance Systems", status: "Unaffected", note: "No indicators found" },
];

const tasks: Task[] = [
  { id: "t1", title: "Validate Nov 6 backup snapshot on BKP-VAULT-01", assigneeId: "m3", status: "In progress", due: "2026-11-07T21:00:00Z" },
  { id: "t2", title: "Force credential reset for finance VPN group", assigneeId: "m2", status: "Open", due: "2026-11-07T20:00:00Z" },
  { id: "t3", title: "Collect memory image from WS-FIN-114", assigneeId: "m2", status: "Done", due: "2026-11-07T12:00:00Z" },
  { id: "t4", title: "Draft internal staff notice", assigneeId: "m4", status: "In progress", due: "2026-11-07T22:00:00Z" },
  { id: "t5", title: "Assess regulatory notification obligations", assigneeId: "m5", status: "Blocked", due: "2026-11-08T12:00:00Z" },
];

const timeline: TimelineEvent[] = [
  { id: "e1", at: "2026-11-07T06:31:00Z", author: "Endpoint alerting", text: "Mass file rename activity detected on FIN-FS-01." },
  { id: "e2", at: "2026-11-07T06:42:00Z", author: "Dana Okafor", text: "Incident declared. Severity set to Critical." },
  { id: "e3", at: "2026-11-07T07:10:00Z", author: "Marcus Lee", text: "FIN-FS-01, FIN-FS-02 and WS-FIN-114 isolated from network." },
  { id: "e4", at: "2026-11-07T11:48:00Z", author: "Priya Raman", text: "VPN logs show login for j.doe from unfamiliar IP range at 02:14 UTC." },
  { id: "e5", at: "2026-11-07T18:55:00Z", author: "Dana Okafor", text: "Stage moved to Containment. Backup validation underway." },
];

const chat: ChatMessage[] = [
  { id: "c1", at: "2026-11-07T18:40:00Z", authorId: "m3", text: "Snapshot from Nov 6 23:00 mounts cleanly so far. Checksums running." },
  { id: "c2", at: "2026-11-07T18:47:00Z", authorId: "m1", text: "Thanks. Hold restore until Marcus confirms VPN reset." },
  { id: "c3", at: "2026-11-07T18:52:00Z", authorId: "m4", text: "Staff notice draft ready for review in 30 min." },
];

interface Store {
  incident: Incident;
  updateIncident: (p: Partial<Incident>) => void;
  members: Member[];
  setMembers: (fn: (m: Member[]) => Member[]) => void;
  systems: System[];
  setSystemStatus: (id: string, s: SystemStatus) => void;
  addSystem: (s: Omit<System, "id">) => void;
  tasks: Task[];
  addTask: (t: Omit<Task, "id">) => void;
  setTaskStatus: (id: string, s: TaskStatus) => void;
  timeline: TimelineEvent[];
  addEvent: (text: string) => void;
  chat: ChatMessage[];
  sendChat: (text: string) => void;
  memberName: (id: string) => string;
}

const Ctx = createContext<Store | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [inc, setInc] = useState(incident);
  const [mem, setMem] = useState(members);
  const [sys, setSys] = useState(systems);
  const [tsk, setTsk] = useState(tasks);
  const [tl, setTl] = useState(timeline);
  const [msgs, setMsgs] = useState(chat);

  const author = "Signed-in user (demo log)";
  const log = (text: string) => {
    setTl((t) => [...t, { id: uid(), at: now(), author, text }]);
    setInc((i) => ({ ...i, lastUpdate: now() }));
  };
  const memberName = (id: string) => mem.find((m) => m.id === id)?.name ?? "Unassigned";

  const value: Store = {
    incident: inc,
    updateIncident: (p) => {
      setInc((i) => ({ ...i, ...p, lastUpdate: now() }));
      if (p.stage) log(`Stage changed to ${p.stage}.`);
      if (p.severity) log(`Severity changed to ${p.severity}.`);
    },
    members: mem,
    setMembers: (fn) => setMem(fn),
    systems: sys,
    setSystemStatus: (id, s) => {
      setSys((x) => x.map((y) => (y.id === id ? { ...y, status: s } : y)));
      log(`${sys.find((y) => y.id === id)?.name} marked ${s}.`);
    },
    addSystem: (s) => { setSys((x) => [...x, { ...s, id: uid() }]); log(`${s.name} added to affected systems.`); },
    tasks: tsk,
    addTask: (t) => { setTsk((x) => [...x, { ...t, id: uid() }]); log(`Task created: ${t.title}`); },
    setTaskStatus: (id, s) => {
      setTsk((x) => x.map((y) => (y.id === id ? { ...y, status: s } : y)));
      log(`Task "${tsk.find((y) => y.id === id)?.title}" set to ${s}.`);
    },
    timeline: tl,
    addEvent: log,
    chat: msgs,
    sendChat: (text) => setMsgs((m) => [...m, { id: uid(), at: now(), authorId: "m1", text }]),
    memberName,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemo() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDemo must be used inside DemoProvider");
  return c;
}

export const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";
