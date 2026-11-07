import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider, ThemeToggle } from "@/components/theme-provider";

afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.classList.remove("dark"); });

describe("Bastion appearance", () => {
  it("switches between light and dark and saves the choice", () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("bastion-theme")).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("bastion-theme")).toBe("dark");
  });

  it("restores a saved light appearance", async () => {
    localStorage.setItem("bastion-theme", "light");
    render(<ThemeProvider><ThemeToggle compact /></ThemeProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeTruthy());
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});