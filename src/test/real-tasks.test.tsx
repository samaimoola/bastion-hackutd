// MOCKED UI tests for real incident tasks. Server functions and Realtime are fakes.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { role, list, add, edit, members, channel } = vi.hoisted(() => {
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return {
    role: { value: "responder" as string | null },
    list: vi.fn(),
    add: vi.fn(),
    edit: vi.fn(),
    members: vi.fn(),
    channel,
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { channel: () => channel, removeChannel: vi.fn() },
}));
vi.mock("@/lib/incidents.functions", () => ({
  getIncidentMembership: vi.fn(async () => role.value),
  getIncident: vi.fn(),
  listIncidents: vi.fn(),
  updateIncident: vi.fn(),
}));
vi.mock("@/lib/tasks.functions", () => ({
  listIncidentTasks: list,
  addIncidentTask: add,
  editIncidentTask: edit,
}));
vi.mock("@/lib/incident-access.functions", () => ({ listIncidentMembers: members }));
vi.mock("@tanstack/react-start", async (orig) => ({
  ...(await orig<object>()),
  useServerFn: (fn: unknown) => fn,
}));

import { RealTasks } from "@/components/real-tasks";

const INC = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
const ME = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";
const task = {
  id: "11111111-1111-4111-8111-111111111111",
  incident_id: INC,
  title: "Reset VPN passwords",
  details: "Finance group first",
  assignee_id: OTHER,
  status: "in_progress",
  created_by: ME,
  updated_by: ME,
  created_at: "2026-11-08T10:00:00Z",
  updated_at: "2026-11-08T10:00:00Z",
};
const view = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RealTasks incidentId={INC} userId={ME} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  role.value = "responder";
  list.mockResolvedValue({ available: true, tasks: [task] });
  members.mockResolvedValue([
    { user_id: ME, role: "responder" },
    { user_id: OTHER, role: "viewer" },
  ]);
  add.mockResolvedValue(task);
  edit.mockResolvedValue(task);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("real incident tasks", () => {
  it("says shared tasks are not set up and offers no writes when the database lacks them", async () => {
    list.mockResolvedValue({ available: false });
    view();
    expect(
      await screen.findByRole("heading", { name: "Shared tasks are not set up yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing is stored in your browser/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add task/ })).toBeNull();
    expect(channel.subscribe).not.toHaveBeenCalled(); // no live subscription to a table that does not exist
  });

  it("shows tasks with status text and assignee, and subscribes to live changes", async () => {
    view();
    const item = await screen.findByRole("listitem");
    expect(item).toHaveTextContent("Reset VPN passwords");
    expect(item).toHaveTextContent("In progress");
    expect(item).toHaveTextContent("Assigned to: Member 33333333");
    expect(item).toHaveTextContent("Finance group first");
    await waitFor(() =>
      expect(channel.on).toHaveBeenCalledWith(
        "postgres_changes",
        expect.objectContaining({ table: "incident_tasks", filter: `incident_id=eq.${INC}` }),
        expect.any(Function),
      ),
    );
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({ table: "incident_members" }),
      expect.any(Function),
    );
  });

  it("is read-only for viewers, with a brief explanation", async () => {
    role.value = "viewer";
    view();
    expect(
      await screen.findByText(
        "View-only access. Only commanders and responders can add or change tasks.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /Status for/ })).toBeNull();
    expect(members).not.toHaveBeenCalled();
  });

  it("lets responders add a task with only a title, unassigned by default", async () => {
    view();
    const addButton = await screen.findByRole("button", { name: "Add task" });
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.click(addButton);
    const dialog = await screen.findByRole("dialog", { name: "Add task" });
    expect(within(dialog).getByLabelText(/^Details/)).toHaveValue("");
    expect(
      within(dialog).getByText("Only people with access to this incident can be assigned."),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Call the insurer" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add task" }));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({
        data: { title: "Call the insurer", details: "", assigneeId: null, incidentId: INC },
      }),
    );
  });

  it("refuses to save an empty title", async () => {
    view();
    const addButton = await screen.findByRole("button", { name: "Add task" });
    await waitFor(() => expect(addButton).toBeEnabled());
    fireEvent.click(addButton);
    const dialog = await screen.findByRole("dialog");
    // The required title blocks submission natively; whitespace-only titles hit the form's own check.
    expect(within(dialog).getByLabelText("Title")).toBeInvalid();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add task" }));
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add task" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Enter a task title.");
    expect(add).not.toHaveBeenCalled();
  });

  it("shows the database's assignee rejection instead of hiding it", async () => {
    edit.mockRejectedValue(new Error("The assignee must be a current member of this incident."));
    view();
    const editButton = await screen.findByRole("button", { name: "Edit" });
    fireEvent.click(editButton);
    const dialog = await screen.findByRole("dialog", { name: "Edit task" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save task" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The assignee must be a current member of this incident.",
    );
    expect(edit).toHaveBeenCalledWith({
      data: {
        title: task.title,
        details: task.details,
        assigneeId: OTHER,
        id: task.id,
        status: "in_progress",
      },
    });
  });

  it("clears cached tasks and offers a recheck when access is gone", async () => {
    role.value = null;
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tasks are unavailable or you no longer have incident access.",
    );
    expect(list).not.toHaveBeenCalled();
  });
});
