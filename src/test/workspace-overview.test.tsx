// Stage 1 usability checks: plain-language overview, one primary action, details collapsed,
// and a role explanation that stays display-only.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { role } = vi.hoisted(() => ({ role: { value: "viewer" as string | Error } }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: ReactNode; search?: { tab?: string } }) => (
    <a data-tab={search?.tab}>{children}</a>
  ),
}));
vi.mock("@/lib/incident-queries", () => ({
  incidentMembershipOptions: (userId: string, id: string) =>
    queryOptions({
      queryKey: ["incidents", userId, "membership", id],
      queryFn: async () => {
        if (role.value instanceof Error) throw role.value;
        return role.value;
      },
      retry: false,
    }),
}));

import { DemoProvider } from "@/lib/demo-store";
import { WorkspaceOverview } from "@/components/workspace-overview";
import { YourAccess } from "@/components/incident-access-summary";

afterEach(cleanup);

describe("demo incident overview", () => {
  const renderOverview = (onUpdate = vi.fn()) => {
    const view = render(
      <DemoProvider>
        <WorkspaceOverview
          onUpdate={onUpdate}
          nextActions={<p>next-actions-slot</p>}
          editors={<p>editors-slot</p>}
        />
      </DemoProvider>,
    );
    return { ...view, onUpdate };
  };

  it("leads with what happened and the current status in plain language", () => {
    renderOverview();
    expect(screen.getByRole("heading", { name: "What happened" })).toBeInTheDocument();
    const status = screen.getByRole("heading", { name: "Current status" }).parentElement!;
    expect(status).toHaveTextContent("Stage: Containment.");
    expect(status).toHaveTextContent("The team is working to stop the problem from spreading.");
    expect(status).toHaveTextContent("Commander: Dana Okafor");
  });

  it("has one primary action and links every other action to an existing tab", () => {
    const { onUpdate, container } = renderOverview();
    const primary = screen.getByRole("button", { name: "Add an update" });
    fireEvent.click(primary);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const tabs = [...container.querySelectorAll("a[data-tab]")].map((a) =>
      a.getAttribute("data-tab"),
    );
    expect(tabs).toEqual(["systems", "tasks", "timeline", "chat", "lab"]);
  });

  it("keeps detailed lists, editors and identifiers in collapsed sections", () => {
    const { container } = renderOverview();
    const details = [...container.querySelectorAll("details")];
    expect(details.map((d) => d.querySelector("summary")?.textContent)).toEqual([
      "Urgent tasks and latest updates",
      "Change severity, stage or commander",
      "Incident details and reference",
    ]);
    expect(details.every((d) => !d.open)).toBe(true);
    expect(within(details[1]!).getByText("editors-slot")).toBeInTheDocument();
    expect(within(details[2]!).getByText("INC-2026-0412")).toBeInTheDocument();
  });

  it("still opens the response brief", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("button", { name: "View response brief" }));
    expect(screen.getByRole("dialog", { name: "Response Brief" })).toBeInTheDocument();
  });
});

describe("YourAccess", () => {
  const renderAccess = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <YourAccess incidentId="i" userId="u" />
      </QueryClientProvider>,
    );
  it.each([
    ["commander", "Commander: you can edit this incident, add records and manage team access."],
    ["responder", "Responder: you can edit this incident and add records."],
    ["viewer", "Viewer: you can read everything here, but cannot make changes."],
  ])("explains the %s role", async (value, text) => {
    role.value = value;
    renderAccess();
    expect(await screen.findByText(text, { exact: false })).toBeInTheDocument();
  });
  it("says so when access cannot be checked", async () => {
    role.value = new Error("no");
    renderAccess();
    expect(await screen.findByText(/Your access could not be checked/)).toBeInTheDocument();
  });
});
