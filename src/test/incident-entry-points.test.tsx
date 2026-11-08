// Exercises the real list page with mocked identity/server calls; not a hosted auth check.
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { incidentKeys } from "@/lib/incident-queries";
import { Route } from "@/routes/_authenticated/dashboard";

const { create, list, navigate } = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/lib/incidents.functions", () => ({
  createIncident: create,
  listIncidents: list,
  getIncident: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useRouteContext: () => ({ authUser: { id: "user-a" } }),
    useNavigate: () => navigate,
  }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  SeverityBadge: () => null,
  StageBadge: () => null,
}));
vi.mock("@/lib/demo-store", () => ({ fmt: (date: string) => date }));
// The stakeholder card has its own tests; stub it so this test stays about incident creation.
vi.mock("@/components/stakeholder-update-card", () => ({
  StakeholderUpdateCard: ({ incidents }: { incidents: unknown[] }) => (
    <p>stakeholder card for {incidents.length}</p>
  ),
}));

const record = {
  id: "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b",
  title: "VPN compromise",
  summary: "Confirmed login anomaly",
  severity: "Medium" as const,
  stage: "Detection" as const,
  declaredAt: "2026-11-07T22:00:00Z",
  lastUpdate: "2026-11-07T22:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([]);
  create.mockResolvedValue(record);
  navigate.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("Incident list creation entry points", () => {
  it.each(["New Incident", "Create your first incident"])(
    "creates through the existing form from %s and opens the returned workspace",
    async (entry) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      client.setQueryData(incidentKeys.list("user-a"), []);
      const Page = Route.options.component;
      if (!Page) throw new Error("Incident list component missing");
      render(
        <QueryClientProvider client={client}>
          <Page />
        </QueryClientProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: entry }));
      fireEvent.change(screen.getByLabelText("Title"), { target: { value: "VPN compromise" } });
      fireEvent.change(screen.getByLabelText(/^Description/), {
        target: { value: "Confirmed login anomaly" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create incident" }));
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({ to: "/incidents/$id", params: { id: record.id } }),
      );
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0]?.[0]).toEqual({
        data: {
          title: "VPN compromise",
          description: "Confirmed login anomaly",
          severity: "Medium",
          stage: "Detection",
        },
      });
      expect(client.getQueryData(incidentKeys.detail("user-a", record.id))).toEqual(record);
      expect(list).toHaveBeenCalled();
    },
  );
  it("shows the stakeholder card only when there are incidents, above the list", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(incidentKeys.list("user-a"), [record]);
    const Page = (Route as unknown as { options: { component: () => ReactNode } }).options
      .component;
    render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("stakeholder card for 1")).toBeInTheDocument();
    cleanup();
    client.setQueryData(incidentKeys.list("user-a"), []);
    render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>,
    );
    expect(screen.queryByText(/stakeholder card/)).toBeNull();
  });
});
