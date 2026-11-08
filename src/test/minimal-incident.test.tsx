// Starting an incident with minimal information. Mocked server function; no hosted data.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/incidents.functions", () => ({
  createIncident: create,
  getIncident: vi.fn(),
  listIncidents: vi.fn(),
  getIncidentMembership: vi.fn(),
  updateIncident: vi.fn(),
}));
vi.mock("@tanstack/react-start", async (orig) => ({
  ...(await orig<object>()),
  useServerFn: (fn: unknown) => fn,
}));
import { NewIncidentForm } from "@/components/new-incident-form";

afterEach(cleanup);
const record = {
  id: "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b",
  title: "Odd VPN logins",
  summary: "",
  severity: "Medium",
  stage: "Detection",
  declaredAt: "",
  lastUpdate: "",
};

it("starts an incident with only a title and says which fields are optional or estimates", async () => {
  create.mockResolvedValue(record);
  const onCreated = vi.fn(async () => {});
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NewIncidentForm userId="u" onCreated={onCreated} />
    </QueryClientProvider>,
  );
  expect(
    screen.getByText(
      "Only a title is required. Start with what you know now and add details as you learn more.",
    ),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/^Description/)).not.toBeRequired();
  expect(screen.getByText("(optional)")).toBeInTheDocument();
  expect(screen.getByText("(initial estimate)")).toBeInTheDocument();
  expect(screen.getByText(/not a verified assessment/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Odd VPN logins" } });
  fireEvent.click(screen.getByRole("button", { name: "Create incident" }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  // react-query passes a context object as the second argument; only the submitted data matters here.
  expect(create.mock.calls[0]![0]).toEqual({
    data: { title: "Odd VPN logins", description: "", severity: "Medium", stage: "Detection" },
  });
  expect(onCreated).toHaveBeenCalledWith(record);
});
