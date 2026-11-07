import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DemoContext } from "@/lib/demo-context";
import { DemoProvider } from "@/lib/demo-store";

afterEach(() => {
  cleanup();
  vi.doUnmock("@/lib/demo-context");
});

it("keeps refreshed consumers connected to an already mounted demo provider", async () => {
  // Model a hot-updated store with its unchanged context dependency cached by Vite.
  vi.resetModules();
  vi.doMock("@/lib/demo-context", () => ({ DemoContext }));
  const refreshed = await import("@/lib/demo-store");
  function UpdatedConsumer() {
    const { incident } = refreshed.useDemo();
    return <span>{incident.id}</span>;
  }
  render(<DemoProvider><UpdatedConsumer /></DemoProvider>);
  expect(screen.getByText("INC-2026-0412")).toBeInTheDocument();
});