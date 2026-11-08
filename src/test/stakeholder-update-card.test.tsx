// Stakeholder card content. The member-scoped affected-systems server function is mocked.
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { systems } = vi.hoisted(() => ({ systems: vi.fn() }));
vi.mock("@/lib/affected-systems.functions", () => ({ listAffectedSystems: systems }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    search,
  }: {
    children: ReactNode;
    params?: { id: string };
    search?: { tab?: string };
  }) => (
    <a href={`/incidents/${params?.id}${search?.tab ? `?tab=${search.tab}` : ""}`}>{children}</a>
  ),
}));
vi.mock("@/components/app-shell", () => ({
  SeverityBadge: ({ s }: { s: string }) => <span>Severity: {s}</span>,
  StageBadge: ({ s }: { s: string }) => <span>Stage: {s}</span>,
}));
import { StakeholderUpdateCard } from "@/components/stakeholder-update-card";
import type { IncidentRecord } from "@/lib/incident-models";

const record = (
  id: string,
  lastUpdate: string,
  summary = "Unusual VPN logins overnight.",
): IncidentRecord => ({
  id,
  lastUpdate,
  title: `Incident ${id}`,
  summary,
  severity: "High",
  stage: "Containment",
  declaredAt: "2026-11-07T06:00:00Z",
});
const OLD = record("11111111-1111-4111-8111-111111111111", "2026-11-07T08:00:00Z");
const NEW = record("22222222-2222-4222-8222-222222222222", "2026-11-08T14:21:00Z");
const view = (incidents: IncidentRecord[]) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <StakeholderUpdateCard incidents={incidents} userId="user-a" />
    </QueryClientProvider>,
  );

beforeEach(() => {
  systems.mockReset();
  systems.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("stakeholder update card", () => {
  it("shows the most recently updated accessible incident as saved, and says it is not an announcement", async () => {
    view([OLD, NEW]);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Incident 22222222");
    expect(
      screen.getByText(
        /the most recently updated of 2 incidents you can access\. Not an approved or sent announcement\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Unusual VPN logins overnight.")).toBeInTheDocument();
    expect(
      screen.getByText(/Containment\. The team is working to stop the problem from spreading\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/This may still be an initial estimate/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View incident/ })).toHaveAttribute(
      "href",
      `/incidents/${NEW.id}`,
    );
    expect(screen.getByRole("link", { name: /Team chat/ })).toHaveAttribute(
      "href",
      `/incidents/${NEW.id}?tab=chat`,
    );
    expect(systems).toHaveBeenCalledWith({ data: { incidentId: NEW.id } });
  });

  it("marks unknown information as unknown instead of implying nothing happened", async () => {
    view([record(NEW.id, NEW.lastUpdate, "")]);
    expect(
      screen.getByText(
        "No description has been recorded yet, so what happened is still unknown here.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("None recorded yet. That does not mean nothing is affected."),
    ).toBeInTheDocument();
  });

  it("reports recorded containment statuses without claiming the incident is contained", async () => {
    systems.mockResolvedValue([
      { containment_status: "contained" },
      { containment_status: "contained" },
    ]);
    view([NEW]);
    const line = await screen.findByText(
      /2 systems recorded: 0 not contained, 0 in progress, 2 marked contained\./,
    );
    expect(line).toHaveTextContent("Recorded statuses do not confirm the incident is contained.");
    // The only mention of "contained" as a conclusion is the caveat that statuses do not confirm it.
    const text = document.body.textContent ?? "";
    expect(text.match(/incident is contained/g)).toHaveLength(1);
    expect(text).not.toMatch(/resolved|all clear|is safe/i);
  });

  it("keeps a loading state while recorded systems load", () => {
    systems.mockImplementation(() => new Promise(() => {}));
    view([NEW]);
    expect(screen.getByText("Loading recorded systems…")).toBeInTheDocument();
  });

  it("keeps an error state when recorded systems cannot be loaded", async () => {
    systems.mockImplementation(async () => {
      throw new Error("Affected systems could not be loaded. Please try again.");
    });
    view([NEW]);
    expect(
      await screen.findByText("Could not be loaded. Open the incident to check."),
    ).toBeInTheDocument();
  });

  it("does not invent an update when no saved time is valid", () => {
    view([record(NEW.id, "not a date")]);
    expect(
      screen.getByText("No incident update with a valid saved time is available yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(systems).not.toHaveBeenCalled();
  });
});
