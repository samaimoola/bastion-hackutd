// Stage 1: guided Simple mode. Mocked user-scoped queries; these check navigation, factual states
// and role behavior, not hosted data.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { role, systems, messages } = vi.hoisted(() => ({
  role: { value: "viewer" as string },
  systems: vi.fn(),
  messages: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: ReactNode; search?: { tab?: string } }) => (
    <a href={`?tab=${search?.tab ?? ""}`} data-tab={search?.tab}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/incidents.functions", () => ({
  getIncidentMembership: vi.fn(async () => role.value),
  updateIncident: vi.fn(),
  getIncident: vi.fn(),
  listIncidents: vi.fn(),
}));
vi.mock("@/lib/affected-systems.functions", () => ({ listAffectedSystems: systems }));
vi.mock("@/lib/messages.functions", () => ({ listIncidentMessages: messages }));
vi.mock("@tanstack/react-start", async (orig) => ({
  ...(await orig<object>()),
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  SeverityBadge: () => null,
  StageBadge: () => null,
}));
vi.mock("@/components/incident-team-access", () => ({
  IncidentTeamAccess: () => <button>Team access</button>,
}));
vi.mock("@/components/incident-access-summary", () => ({ YourAccess: () => null }));
vi.mock("@/components/real-affected-systems", () => ({
  RealAffectedSystems: () => <p>systems section</p>,
}));
vi.mock("@/components/real-communications", () => ({
  RealCommunications: () => <p>chat section</p>,
}));
vi.mock("@/components/real-timeline", () => ({ RealTimeline: () => <p>timeline section</p> }));
vi.mock("@/components/containment-lab", () => ({ ContainmentLab: () => <p>lab section</p> }));

import { SimpleModeProvider } from "@/components/simple-mode";
import { LiveIncidentWorkspace } from "@/components/live-incident-workspace";
import { WorkspaceTabBar } from "@/components/workspace-sections";
import { SimpleIncidentSummary } from "@/components/simple-incident-summary";
import { Tabs } from "@/components/ui/tabs";
import type { WorkspaceTab } from "@/lib/guide-navigation";

const APOS = "\u2019";
const incident = {
  id: "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b",
  title: "VPN compromise",
  summary: "Unusual VPN logins overnight.",
  severity: "High" as const,
  stage: "Containment" as const,
  declaredAt: "2026-11-07T22:00:00Z",
  lastUpdate: "2026-11-07T22:30:00Z",
};
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const row = (status: string) => ({ id: crypto.randomUUID(), containment_status: status });

beforeEach(() => {
  localStorage.setItem("bastion-simple-mode", "on");
  systems.mockResolvedValue([]);
  messages.mockResolvedValue([]);
  role.value = "viewer";
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset["simple"];
});

describe("Simple-mode navigation", () => {
  const bar = (mode: "live" | "demo", tab: WorkspaceTab = "overview") =>
    render(
      <SimpleModeProvider>
        <Tabs value={tab}>
          <WorkspaceTabBar tab={tab} setTab={vi.fn()} mode={mode} />
        </Tabs>
      </SimpleModeProvider>,
    );
  const openMore = async () => {
    fireEvent.keyDown(screen.getByRole("button", { name: "More tools" }), { key: "Enter" });
    return screen.findAllByRole("menuitem");
  };

  it("uses everyday labels and offers real-incident Tasks under More tools", async () => {
    bar("live");
    await waitFor(() =>
      expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
        "Summary",
        `What${APOS}s affected?`,
        "Team chat",
        "What changed?",
      ]),
    );
    const items = await openMore();
    expect(items.map((i) => i.querySelector("span")?.textContent)).toEqual([
      "Tasks",
      "Compare isolation options",
    ]);
  });

  it("keeps demo Tasks reachable under More tools", async () => {
    bar("demo");
    await screen.findByRole("tab", { name: "Summary" });
    expect((await openMore()).map((i) => i.querySelector("span")?.textContent)).toEqual([
      "Tasks",
      "Compare isolation options",
    ]);
  });

  it("still shows a directly linked real ?tab=tasks as the active tab", async () => {
    bar("live", "tasks");
    expect(await screen.findByRole("tab", { name: "Tasks" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("leaves normal mode unchanged", () => {
    localStorage.clear();
    bar("live");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Overview",
      "Affected Systems & Data",
      "Tasks",
      "Timeline",
      "Communications",
      "Containment Lab",
    ]);
    expect(screen.queryByRole("button", { name: "More tools" })).toBeNull();
  });
});

describe("Simple-mode real incident Summary", () => {
  const summary = () =>
    render(
      <QueryClientProvider client={client()}>
        <SimpleModeProvider>
          <SimpleIncidentSummary incident={incident} userId="user-a" />
        </SimpleModeProvider>
      </QueryClientProvider>,
    );
  const entry = (name: string) => screen.getByRole("region", { name });

  it("offers three entry points that open the existing sections", async () => {
    summary();
    expect(
      within(entry("What happened?")).getByText("Unusual VPN logins overnight."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(entry(`What${APOS}s affected?`)).getByRole("link")).toHaveAttribute(
        "data-tab",
        "systems",
      ),
    );
    expect(within(entry("Talk to your team")).getByRole("link")).toHaveAttribute(
      "data-tab",
      "chat",
    );
  });

  it("states facts from saved records without claiming containment", async () => {
    summary();
    expect(
      await within(entry(`What${APOS}s affected?`)).findByText("No affected systems recorded."),
    ).toBeInTheDocument();
    expect(
      await within(entry("Talk to your team")).findByText("No messages yet."),
    ).toBeInTheDocument();
    cleanup();
    systems.mockResolvedValue([row("contained"), row("contained"), row("not contained")]);
    messages.mockResolvedValue([
      { id: "m1", created_at: "2026-11-07T23:00:00Z" },
      { id: "m2", created_at: "2026-11-07T22:00:00Z" },
    ]);
    summary();
    const affected = entry(`What${APOS}s affected?`);
    expect(await within(affected).findByText("3 systems recorded.")).toBeInTheDocument();
    expect(affected).toHaveTextContent("Not contained: 1");
    expect(affected).toHaveTextContent("Marked contained: 2");
    expect(affected).toHaveTextContent("They do not confirm that the incident is contained.");
    expect(affected.textContent).not.toMatch(/you should|recommend|safe|resolved/i);
    expect(
      await within(entry("Talk to your team")).findByText(
        /2 messages\. Latest 7 Nov 2026, 23:00 UTC\./,
      ),
    ).toBeInTheDocument();
  });

  it.each([["commander"], ["responder"]])(
    "lets a %s open the existing editor from What happened?",
    async (value) => {
      role.value = value;
      summary();
      const button = await within(entry("What happened?")).findByRole("button", {
        name: "Edit what happened",
      });
      await waitFor(() => expect(button).toBeEnabled());
      expect(within(entry("Talk to your team")).queryByText(/read-only access/)).toBeNull();
    },
  );

  it("explains read-only access briefly for viewers and offers no edit control", async () => {
    role.value = "viewer";
    summary();
    expect(
      await within(entry("What happened?")).findByText(
        "You have read-only access, so you can read this but not change it.",
      ),
    ).toBeInTheDocument();
    expect(within(entry("What happened?")).queryByRole("button")).toBeNull();
    expect(
      await within(entry("Talk to your team")).findByText(
        "You have read-only access, so you can read messages but not post.",
      ),
    ).toBeInTheDocument();
    expect(within(entry(`What${APOS}s affected?`)).getByRole("link")).toHaveTextContent(
      "Open the list",
    );
  });
});

describe("Simple-mode real workspace", () => {
  const workspace = (tab: WorkspaceTab) =>
    render(
      <QueryClientProvider client={client()}>
        <SimpleModeProvider>
          <LiveIncidentWorkspace incident={incident} userId="user-a" tab={tab} setTab={vi.fn()} />
        </SimpleModeProvider>
      </QueryClientProvider>,
    );

  it("puts editing only in the What happened? entry point on the Summary, with no duplicate action list", async () => {
    role.value = "responder";
    workspace("overview");
    await screen.findByRole("button", { name: "Edit what happened" });
    expect(screen.getAllByRole("button", { name: /^Edit/ })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "What you can do here" })).toBeNull();
    expect(screen.getByRole("button", { name: "Team access" })).toBeInTheDocument();
  });

  it("keeps the header editor on other tabs so editing stays reachable", async () => {
    role.value = "responder";
    workspace("systems");
    expect(await screen.findByRole("button", { name: "Edit incident" })).toBeInTheDocument();
    expect(screen.getByText("systems section")).toBeInTheDocument();
  });
});
