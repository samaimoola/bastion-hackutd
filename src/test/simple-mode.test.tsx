// Simple mode is presentation only: these tests cover the preference, its independence from the
// theme, and what each screen shows. Server calls are mocked.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }), signOut: vi.fn() } },
}));
vi.mock("@/lib/incidents.functions", () => ({
  updateIncident: vi.fn(),
  getIncidentMembership: vi.fn(),
  getIncident: vi.fn(),
  listIncidents: vi.fn(),
}));
vi.mock("@tanstack/react-start", async (orig) => ({
  ...(await orig<object>()),
  useServerFn: (fn: unknown) => fn,
}));

import { ThemeProvider, ThemeToggle } from "@/components/theme-provider";
import { SimpleHint, SimpleModeProvider, SimpleModeToggle } from "@/components/simple-mode";
import { AppShell } from "@/components/app-shell";
import { WorkspaceTabBar } from "@/components/workspace-sections";
import { Tabs } from "@/components/ui/tabs";
import { EditIncidentForm } from "@/components/edit-incident-action";
import { ContainmentSandbox } from "@/components/containment-lab";

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset["simple"];
  document.documentElement.classList.remove("dark");
});
const simpleOn = () => localStorage.setItem("bastion-simple-mode", "on");
const withSimple = (ui: ReactNode) => (
  <ThemeProvider>
    <SimpleModeProvider>{ui}</SimpleModeProvider>
  </ThemeProvider>
);

describe("Simple mode preference", () => {
  it("is a clearly labeled toggle, saved locally, and independent of light/dark", () => {
    render(
      withSimple(
        <>
          <SimpleModeToggle />
          <ThemeToggle compact />
        </>,
      ),
    );
    const toggle = screen.getByRole("button", { name: "Simple mode" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset["simple"]).toBe("true");
    expect(localStorage.getItem("bastion-simple-mode")).toBe("on");
    expect(document.documentElement.classList.contains("dark")).toBe(true); // theme untouched
    expect(localStorage.getItem("bastion-theme")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset["simple"]).toBe("true"); // simple untouched
    fireEvent.click(toggle);
    expect(document.documentElement.dataset["simple"]).toBeUndefined();
    expect(localStorage.getItem("bastion-simple-mode")).toBe("off");
    expect(localStorage.getItem("bastion-theme")).toBe("light");
  });

  it("restores the saved preference and only then shows hints", async () => {
    render(withSimple(<SimpleHint>Plain explanation</SimpleHint>));
    expect(screen.queryByText("Plain explanation")).toBeNull();
    cleanup();
    simpleOn();
    render(withSimple(<SimpleHint>Plain explanation</SimpleHint>));
    expect(await screen.findByText("Plain explanation")).toBeInTheDocument();
  });

  it("shows text labels beside header icons and no longer lists the Guide in the main navigation", async () => {
    simpleOn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        {withSimple(
          <AppShell mode="live">
            <p>Page</p>
          </AppShell>,
        )}
      </QueryClientProvider>,
    );
    await screen.findByText("Sign out");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toHaveTextContent(
      "Light appearance",
    );
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).queryByText("AI Guide")).toBeNull();
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.textContent?.trim()),
    ).toEqual(["Incidents", "Team"]);
  });
});

describe("Simple mode screens", () => {
  const bar = (tab: "overview" | "lab", setTab = vi.fn()) =>
    render(
      withSimple(
        <Tabs value={tab}>
          <WorkspaceTabBar tab={tab} setTab={setTab} mode="live" />
        </Tabs>,
      ),
    );

  it("keeps every workspace tab when Simple mode is off", () => {
    bar("overview");
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "More tools" })).toBeNull();
  });

  it("groups secondary tools behind More tools, keeps them reachable, and explains the tab", async () => {
    simpleOn();
    const setTab = vi.fn();
    bar("overview", setTab);
    await waitFor(() =>
      expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
        "Summary",
        "What’s affected?",
        "Team chat",
        "What changed?",
      ]),
    );
    expect(
      screen.getByText("A summary of the incident and links to everything you can do."),
    ).toBeInTheDocument();
    const more = screen.getByRole("button", { name: "More tools" });
    act(() => {
      fireEvent.keyDown(more, { key: "Enter" });
    });
    const item = await screen.findByRole("menuitem", { name: /Compare isolation options/ });
    fireEvent.click(item);
    expect(setTab).toHaveBeenCalledWith("lab");
  });

  it("shows the current tab even when it is a secondary tool", async () => {
    simpleOn();
    bar("lab");
    await waitFor(() =>
      expect(screen.getAllByRole("tab").map((t) => t.textContent)).toContain(
        "Compare isolation options",
      ),
    );
    expect(screen.getByRole("tab", { name: "Compare isolation options" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("explains incident fields and links each explanation to its field", async () => {
    const incident = {
      id: "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b",
      title: "T",
      summary: "D",
      severity: "High" as const,
      stage: "Recovery" as const,
      declaredAt: "2026-11-07T22:00:00Z",
      lastUpdate: "2026-11-07T22:00:00Z",
    };
    const form = () => (
      <QueryClientProvider client={new QueryClient()}>
        {withSimple(<EditIncidentForm incident={incident} userId="u" onSaved={vi.fn()} />)}
      </QueryClientProvider>
    );
    render(form());
    expect(screen.getByLabelText("Severity")).not.toHaveAttribute("aria-describedby");
    cleanup();
    simpleOn();
    render(form());
    await waitFor(() =>
      expect(screen.getByLabelText("Severity")).toHaveAccessibleDescription(
        "How serious the incident is. Critical is the most serious and Low the least.",
      ),
    );
    expect(screen.getByLabelText("Response stage")).toHaveAccessibleDescription(
      "Choose the stage the team is in now. You can change it later.",
    );
    expect(screen.getByLabelText("Description")).toHaveAccessibleDescription(
      /Do not include passwords/,
    );
  });

  it("puts the Containment Lab question, result and tradeoffs first; graph, editing and details stay expandable", async () => {
    simpleOn();
    const { container } = render(withSimple(<ContainmentSandbox />));
    await screen.findByText("Show the graph of systems and connections");
    fireEvent.click(screen.getByRole("button", { name: "Isolate Domain controller" }));
    const order = [
      screen.getByLabelText("Which system would you hypothetically isolate?"),
      screen.getByRole("region", { name: /^Outcome/ }),
      screen.getByRole("region", { name: "Compare isolation options" }),
      screen.getByText("Show the graph of systems and connections"),
      screen.getByText("Edit systems and connections"),
    ];
    for (let i = 1; i < order.length; i++)
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    expect([...container.querySelectorAll("details")].every((d) => !d.open)).toBe(true);
    expect(screen.getByText(/Isolating means cutting a system off/)).toBeInTheDocument();
  });
});
