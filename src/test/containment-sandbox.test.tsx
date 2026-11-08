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

  it("puts the selector, outcome, graph and comparison before the collapsed editor and details", () => {
    const { container } = render(<ContainmentSandbox />);
    const order = [
      screen.getByLabelText("Which system would you hypothetically isolate?"),
      screen.getByRole("button", { name: "Isolate Domain controller" }),
      outcome(),
      screen.getByRole("group", { name: /Containment model graph/ }),
      screen.getByRole("region", { name: "Compare isolation options" }),
      screen.getByText("Edit systems and connections"),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    const details = [...container.querySelectorAll("details")];
    expect(details).toHaveLength(2); // model editor, calculation details
    expect(details.every((d) => !d.open)).toBe(true); // both start collapsed
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

  it("keeps the editor collapsed, and an empty model offers a clear way to open it", () => {
    const { container } = render(<ContainmentSandbox />);
    const editor = () => container.querySelector("details")!;
    expect(editor().open).toBe(false);
    for (const name of [
      "Phished laptop (finance)",
      "VPN gateway",
      "File server",
      "Domain controller",
      "Payroll app",
      "Backup server",
    ]) {
      fireEvent.click(screen.getByRole("checkbox", { name }));
    }
    expect(screen.getByText("No systems are in the model yet.")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Compare isolation options" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add systems to the model" }));
    expect(editor().open).toBe(true);
  });

  describe("Compare isolation options", () => {
    const compare = () => screen.getByRole("region", { name: "Compare isolation options" });
    const row = (name: string) =>
      within(compare())
        .getByRole("button", { name: `Show outcome of isolating ${name}` })
        .closest("tr")!;

    it("evaluates every modeled system once, in model order, against the same model", () => {
      render(<ContainmentSandbox />);
      const names = within(compare())
        .getAllByRole("button")
        .map((b) => b.textContent?.replace("Show outcome of isolating ", ""));
      expect(names).toEqual([
        "Phished laptop (finance)",
        "VPN gateway",
        "File server",
        "Domain controller",
        "Payroll app",
        "Backup server",
      ]);
      const cells = (name: string) =>
        [...row(name).querySelectorAll("td")].map((td) => td.lastChild?.textContent);
      expect(cells("Domain controller")).toEqual(["Payroll app", "Backup server", "Payroll app"]);
      expect(cells("Phished laptop (finance)")).toEqual([
        "File server",
        "Payroll app, Backup server",
        "None",
      ]);
    });

    it("opens the selected option's detailed outcome and graph", () => {
      render(<ContainmentSandbox />);
      fireEvent.click(
        within(compare()).getByRole("button", {
          name: "Show outcome of isolating Domain controller",
        }),
      );
      const heading = screen.getByRole("heading", {
        name: "Outcome of isolating Domain controller",
      });
      expect(heading).toHaveFocus();
      expect(
        within(compare()).getByRole("button", {
          name: "Show outcome of isolating Domain controller",
        }),
      ).toHaveAttribute("aria-pressed", "true");
      const graph = screen.getByRole("group", { name: /Containment model graph/ });
      expect(within(graph).getByRole("button", { name: /^Domain controller/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("does not rank options or imply real isolation", () => {
      render(<ContainmentSandbox />);
      expect(compare()).toHaveTextContent("not ranked");
      expect(compare().textContent).not.toMatch(/safest|best|recommend|optimal|probab|likel|%/i);
    });

    it("says what cannot be compared when starting points or business-critical marks are missing", () => {
      render(<ContainmentSandbox />);
      for (const box of screen.getAllByRole("checkbox", { name: "Suspected start" }))
        if (box.getAttribute("aria-checked") === "true") fireEvent.click(box);
      expect(compare()).toHaveTextContent(
        "No suspected starting point is marked, so attack reachability is not compared.",
      );
      expect(within(row("Domain controller")).getAllByText("Not compared")).toHaveLength(2);
      expect(row("Domain controller")).toHaveTextContent("Payroll app"); // availability is still compared

      for (const box of screen.getAllByRole("checkbox", { name: "Business-critical" }))
        if (box.getAttribute("aria-checked") === "true") fireEvent.click(box);
      expect(compare()).toHaveTextContent(
        "No system is marked business-critical, so the business-critical columns are not compared.",
      );
      expect(within(row("Domain controller")).getAllByText("Not compared")).toHaveLength(3);
    });
  });
});
