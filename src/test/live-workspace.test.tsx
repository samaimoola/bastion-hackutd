import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { LiveIncidentWorkspace } from "@/components/live-incident-workspace";
import type { WorkspaceTab } from "@/lib/guide-navigation";

const { demo } = vi.hoisted(() => ({ demo: vi.fn(() => { throw new Error("Real workspace must not read demo records"); }) }));
vi.mock("@/lib/demo-store", () => ({ useDemo: demo }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>, SeverityBadge: () => null, StageBadge: () => null }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
vi.mock("@/components/edit-incident-action", () => ({ EditIncidentAction: () => null }));
afterEach(cleanup);
const incident = { id: "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b", title: "Real incident", summary: "Recorded description", severity: "High" as const, stage: "Recovery" as const, declaredAt: "2026-11-07T22:00:00Z", lastUpdate: "2026-11-07T22:00:00Z" };

it.each<WorkspaceTab>(["overview", "systems", "tasks", "timeline", "chat"])("real %s section never consumes demo data and its unsupported writes are disabled", (tab) => {
  const write = vi.fn();
  render(<LiveIncidentWorkspace incident={incident} userId="user-a" tab={tab} setTab={write} />);
  const controls = screen.getByRole("tabpanel").querySelectorAll("button");
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) { expect(control).toBeDisabled(); fireEvent.click(control); }
  expect(write).not.toHaveBeenCalled();
  expect(demo).not.toHaveBeenCalled();
});