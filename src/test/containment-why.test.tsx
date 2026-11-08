// "Why?" explanations in the synthetic sandbox: readable text, graph highlighting, Clear, stale
// cleanup and Simple-mode graph reveal. No network, database or AI.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContainmentSandbox } from "@/components/containment-lab";
import { SimpleModeProvider } from "@/components/simple-mode";

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset["simple"];
});
const graph = () => screen.getByRole("group", { name: /Containment model graph/ });
const highlighted = (kind: string) => graph().querySelectorAll(`[data-highlight="${kind}"]`).length;
const isolate = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name: `Isolate ${name}` }));

describe("Containment Lab Why? explanations", () => {
  it("explains a still-reachable system with an example attack path, in text and in the graph", async () => {
    render(<ContainmentSandbox />);
    isolate("Phished laptop (finance)");
    const why = screen.getByRole("button", { name: "Why can Payroll app still be reached?" });
    expect(why).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(why);
    const panel = screen.getByRole("region", { name: "Why can Payroll app still be reached?" });
    await waitFor(() => expect(within(panel).getByRole("heading")).toHaveFocus());
    const steps = within(panel)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(steps).toEqual([
      "Suspected startVPN gateway is a suspected starting point.",
      "Attack/access linkVPN gateway can reach Domain controller (attack/access link).",
      "Attack/access linkDomain controller can reach Payroll app (attack/access link).",
    ]);
    expect(panel).toHaveTextContent("one example path");
    expect(
      screen.getByRole("button", { name: "Why can Payroll app still be reached?" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(highlighted("attack")).toBe(2);
    expect(highlighted("dependency")).toBe(0);
    expect(highlighted("node")).toBe(3);
    expect(graph().closest("figure")).toHaveTextContent(
      "Highlighted: one example attack/access path",
    );
  });

  it("explains an unavailable service with its business-dependency chain to the isolated system", () => {
    render(<ContainmentSandbox />);
    isolate("Domain controller");
    fireEvent.click(screen.getByRole("button", { name: "Why is Payroll app unavailable?" }));
    const panel = screen.getByRole("region", { name: "Why is Payroll app unavailable?" });
    expect(
      within(panel)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Business dependencyPayroll app needs Domain controller to keep working (business dependency).",
      "Isolated systemDomain controller is the hypothetically isolated system.",
    ]);
    expect(highlighted("dependency")).toBe(1);
    expect(highlighted("attack")).toBe(0);
    // Non-critical unavailable systems can be explained too.
    fireEvent.click(screen.getByRole("button", { name: "Why is VPN gateway unavailable?" }));
    expect(
      screen.getByRole("region", { name: "Why is VPN gateway unavailable?" }),
    ).toBeInTheDocument();
  });

  it("Clear explanation removes the text and every highlight", () => {
    render(<ContainmentSandbox />);
    isolate("Phished laptop (finance)");
    fireEvent.click(
      screen.getByRole("button", { name: "Why can Backup server still be reached?" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear explanation" }));
    expect(screen.queryByRole("region", { name: /^Why/ })).toBeNull();
    expect(graph().querySelectorAll("[data-highlight]")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: /^Outcome of isolating/ })).toHaveFocus();
  });

  it("clears stale explanations when the isolation choice changes", () => {
    render(<ContainmentSandbox />);
    isolate("Phished laptop (finance)");
    fireEvent.click(screen.getByRole("button", { name: "Why can Payroll app still be reached?" }));
    isolate("Domain controller");
    expect(screen.queryByRole("region", { name: /^Why/ })).toBeNull();
    expect(graph().querySelectorAll("[data-highlight]")).toHaveLength(0);
  });

  it("clears stale explanations when the model changes", () => {
    render(<ContainmentSandbox />);
    isolate("Phished laptop (finance)");
    fireEvent.click(screen.getByRole("button", { name: "Why can Payroll app still be reached?" }));
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Business-critical" })[0]!); // mark the laptop critical
    expect(screen.queryByRole("region", { name: /^Why/ })).toBeNull();
    expect(graph().querySelectorAll("[data-highlight]")).toHaveLength(0);
  });

  it("offers no reachability Why? when no starting point is marked", () => {
    render(<ContainmentSandbox />);
    for (const box of screen.getAllByRole("checkbox", { name: "Suspected start" }))
      if (box.getAttribute("aria-checked") === "true") fireEvent.click(box);
    isolate("Domain controller");
    expect(screen.queryByRole("button", { name: /still be reached\?$/ })).toBeNull();
    expect(screen.getByText("None: no suspected starting point is marked.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Why is Payroll app unavailable?" }),
    ).toBeInTheDocument();
  });

  it("keeps comparison selection and graph keyboard selection working", () => {
    render(<ContainmentSandbox />);
    fireEvent.click(
      within(screen.getByRole("region", { name: "Compare isolation options" })).getByRole(
        "button",
        { name: "Show outcome of isolating File server" },
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Outcome of isolating File server" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(within(graph()).getByRole("button", { name: /^Backup server/ }), {
      key: "Enter",
    });
    expect(
      screen.getByRole("heading", { name: "Outcome of isolating Backup server" }),
    ).toBeInTheDocument();
  });

  it("in Simple mode, opening Why reveals the collapsed graph", async () => {
    localStorage.setItem("bastion-simple-mode", "on");
    const { container } = render(
      <SimpleModeProvider>
        <ContainmentSandbox />
      </SimpleModeProvider>,
    );
    const graphDetails = () =>
      [...container.querySelectorAll("details")].find((d) =>
        d.querySelector("summary")?.textContent?.includes("Show the graph"),
      )!;
    await waitFor(() => expect(graphDetails()).toBeDefined());
    expect(graphDetails().open).toBe(false);
    isolate("Domain controller");
    fireEvent.click(screen.getByRole("button", { name: "Why is Payroll app unavailable?" }));
    await waitFor(() => expect(graphDetails().open).toBe(true));
    expect(highlighted("dependency")).toBe(1);
  });
});
