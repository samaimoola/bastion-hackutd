// Renders the synthetic sandbox in jsdom and drives it with clicks and keys. No network, database or AI.
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ContainmentSandbox } from "@/components/containment-lab";

const outcome = () => screen.getByRole("region", { name: /^Outcome/ });

describe("Containment Lab synthetic sandbox", () => {
  it("shows one simulation notice and starts with nothing isolated", () => {
    render(<ContainmentSandbox />);
    const notes = screen.getAllByRole("note");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent("Simulation only. No real system is being isolated.");
    expect(
      within(outcome()).getByText("Choose a system to isolate to see what changes."),
    ).toBeInTheDocument();
  });

  it("puts the selector, examples, outcome and graph before the collapsed editor and details", () => {
    const { container } = render(<ContainmentSandbox />);
    const order = [
      screen.getByLabelText("Which system would you hypothetically isolate?"),
      screen.getByRole("button", { name: "Isolate Domain controller" }),
      outcome(),
      screen.getByRole("group", { name: /Containment model graph/ }),
      screen.getByText("Edit systems and connections"),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    const details = [...container.querySelectorAll("details")];
    expect(details.length).toBeGreaterThanOrEqual(3);
    expect(details.every((d) => !d.open)).toBe(true); // editor and details start collapsed
  });

  it("separates the isolated system from other cut-off systems and explains unavailable-but-reachable", () => {
    render(<ContainmentSandbox />);
    fireEvent.click(screen.getByRole("button", { name: "Isolate Domain controller" }));
    const o = within(outcome());

    expect(
      o.getByRole("heading", { name: "Outcome of isolating Domain controller" }),
    ).toBeInTheDocument();
    expect(
      o.getByText(/stops the modeled attack paths from reaching 1 other system/),
    ).toBeInTheDocument();
    expect(o.getByText("Hypothetically isolated").closest("div")).toHaveTextContent(
      "Domain controller itself is no longer reachable",
    );

    const term = (label: RegExp) => o.getByText(label).closest("div")!;
    expect(term(/^Other systems no longer reachable from modeled attack paths/)).toHaveTextContent(
      "Payroll app",
    );
    expect(
      term(/^Other systems no longer reachable from modeled attack paths/),
    ).not.toHaveTextContent("Domain controller");
    expect(term(/^Business-critical systems still reachable/)).toHaveTextContent("Backup server");
    expect(term(/^Business-critical services unavailable/)).toHaveTextContent(
      "Payroll app (depends on Domain controller)",
    );
    expect(o.getByText(/VPN gateway \(depends on Domain controller\)/)).toBeInTheDocument();
    expect(
      o.getByText(/VPN gateway \(a suspected starting point\) is unavailable but still reachable/),
    ).toBeInTheDocument();
  });

  it("gives the laptop a different tradeoff and resets to nothing isolated", () => {
    render(<ContainmentSandbox />);
    fireEvent.click(screen.getByRole("button", { name: "Isolate Phished laptop (finance)" }));
    expect(
      within(outcome()).getByText(/makes 0 business-critical services unavailable/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(
      within(outcome()).getByText("Choose a system to isolate to see what changes."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Isolate Domain controller" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("lets keyboard users isolate a system from the graph", () => {
    render(<ContainmentSandbox />);
    const node = within(screen.getByRole("group", { name: /Containment model graph/ })).getByRole(
      "button",
      { name: /^File server/ },
    );
    expect(node).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(node, { key: "Enter" });
    expect(
      screen.getByRole("heading", { name: "Outcome of isolating File server" }),
    ).toBeInTheDocument();
    expect(node).toHaveAttribute("aria-pressed", "true");
  });
});
