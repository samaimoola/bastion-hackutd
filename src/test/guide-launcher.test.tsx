// Floating Guide: open/close, focus, Escape, shortcut menu, static page help and conversation
// persistence. History and routing are mocked; nothing is sent to the Guide backend.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { location, history, fetchSpy, chats } = vi.hoisted(() => ({
  location: {
    pathname: "/incidents/3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b",
    search: { tab: "systems" } as Record<string, unknown>,
  },
  history: vi.fn(),
  fetchSpy: vi.fn(),
  chats: new Set<unknown>(),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (s: { location: typeof location }) => unknown }) =>
    select({ location }),
  Link: ({
    children,
    onClick,
    ...rest
  }: {
    children: ReactNode;
    onClick?: () => void;
    to: string;
    "aria-label"?: string;
  }) => (
    <a
      href={rest.to}
      aria-label={rest["aria-label"]}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
vi.mock("@/lib/guide-queries", () => ({
  guideHistoryOptions: { queryKey: ["guide-history"], queryFn: history, staleTime: 0 },
}));
// The conversation view is replaced by a probe that shows the shared session state.
vi.mock("@/components/bastion-guide", async () => {
  const { useGuideSession } = await import("@/lib/guide-session-context");
  const { useEffect } = await import("react");
  return {
    BastionGuide: ({ incidentId }: { incidentId: string | null }) => {
      const s = useGuideSession();
      const { historyState, loadHistory } = s;
      useEffect(() => {
        if (historyState === "idle") loadHistory();
      }, [historyState, loadHistory]);
      if (s.chat) chats.add(s.chat);
      return (
        <div data-testid="conversation" data-incident={incidentId ?? ""}>
          <p>{s.chat ? `messages:${s.chat.messages.length}` : "loading"}</p>
          <textarea
            aria-label="Ask Bastion Guide"
            value={s.draft}
            onChange={(e) => s.setDraft(e.target.value)}
          />
        </div>
      );
    },
  };
});

import { GuideSessionProvider } from "@/components/guide-session";
import { GuideLauncher } from "@/components/guide-launcher";

const renderLauncher = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GuideSessionProvider>
        <main>
          <button>Page control</button>
        </main>
        <GuideLauncher />
      </GuideSessionProvider>
    </QueryClientProvider>,
  );
const launcher = () => screen.getByRole("button", { name: "Open Bastion Guide" });
const panel = () => screen.getByRole("dialog", { name: "Bastion Guide" });

beforeEach(() => {
  history.mockClear();
  fetchSpy.mockClear();
  location.pathname = "/incidents/3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
  location.search = { tab: "systems" };
  history.mockResolvedValue({
    messages: [{ id: "a1", role: "assistant", parts: [{ type: "text", text: "Earlier answer" }] }],
    blockedReason: null,
  });
  chats.clear();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset["guideOpen"];
});

describe("floating Bastion Guide", () => {
  it("is a named circular button with a first-visit tip that can be dismissed for good", async () => {
    renderLauncher();
    expect(launcher()).toHaveAttribute("aria-haspopup", "dialog");
    const tip = await screen.findByRole("note");
    expect(tip).toHaveTextContent("Questions about Bastion?");
    fireEvent.click(within(tip).getByRole("button", { name: "Dismiss Guide tip" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(localStorage.getItem("bastion-guide-hint-seen")).toBe("1");
    expect(history).not.toHaveBeenCalled(); // history loads only when the Guide is used
  });

  it("opens a non-modal panel, closes on Escape, and returns focus to the button", async () => {
    renderLauncher();
    fireEvent.click(launcher());
    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Bastion Guide" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Expand to the full Guide page" })).toHaveAttribute(
      "href",
      "/guide",
    );
    expect(document.documentElement.dataset["guideOpen"]).toBe("true");
    // The page stays usable: interacting outside does not close the panel.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Page control" }));
    expect(panel()).toBeInTheDocument();
    fireEvent.keyDown(panel(), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(launcher()).toHaveFocus());
    expect(document.documentElement.dataset["guideOpen"]).toBeUndefined();
  });

  it("keeps the same conversation and the unsent draft after closing and reopening", async () => {
    renderLauncher();
    fireEvent.click(launcher());
    expect(await screen.findByText("messages:1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ask Bastion Guide"), {
      target: { value: "half-written question" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close Bastion Guide" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(launcher());
    expect(await screen.findByText("messages:1")).toBeInTheDocument();
    expect(screen.getByLabelText("Ask Bastion Guide")).toHaveValue("half-written question");
    expect(chats.size).toBe(1); // one Chat instance, reused
    expect(history).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("routes explicit navigation commands to the incident on screen", async () => {
    renderLauncher();
    fireEvent.click(launcher());
    expect(await screen.findByTestId("conversation")).toHaveAttribute(
      "data-incident",
      "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b",
    );
  });

  it("shows the shortcut menu on keyboard focus and hover, with both actions", async () => {
    renderLauncher();
    act(() => launcher().focus());
    const menu = screen.getByRole("group", { name: "Guide shortcuts" });
    expect(menu).toBeVisible();
    expect(within(menu).getByRole("button", { name: "Ask Bastion" })).toBeInTheDocument();
    fireEvent.keyDown(launcher(), { key: "Escape" });
    // Hidden menus leave the accessibility tree entirely.
    expect(screen.queryByRole("group", { name: "Guide shortcuts" })).toBeNull();
    expect(launcher()).toHaveFocus();
    fireEvent.mouseEnter(launcher().parentElement!.parentElement!);
    expect(screen.getByRole("group", { name: "Guide shortcuts" })).toBeVisible();
  });

  it("gives static help for this page and pre-fills, but never sends, a follow-up", async () => {
    renderLauncher();
    fireEvent.mouseEnter(launcher().parentElement!.parentElement!);
    fireEvent.click(screen.getByRole("button", { name: "Help with this page" }));
    const p = panel();
    expect(
      within(p).getByRole("heading", { name: "Affected systems and data" }),
    ).toBeInTheDocument();
    expect(p).toHaveTextContent("Select Add system (or Add the first system).");
    expect(p).toHaveTextContent("does not use AI");
    expect(history).not.toHaveBeenCalled(); // reading help loads no conversation
    fireEvent.click(within(p).getByRole("button", { name: "Ask a follow-up" }));
    expect(await screen.findByLabelText("Ask Bastion Guide")).toHaveValue(
      "I'm on the Affected systems and data page. ",
    );
    expect(screen.getByRole("button", { name: "Ask Bastion" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("switches between Ask and Help inside the panel for touch users", () => {
    renderLauncher();
    fireEvent.click(launcher());
    fireEvent.click(screen.getByRole("button", { name: "Help with this page" }));
    expect(screen.getByRole("heading", { name: "Affected systems and data" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask Bastion" }));
    expect(screen.getByTestId("conversation")).toBeInTheDocument();
  });

  it("is hidden on the full Guide page", () => {
    location.pathname = "/guide";
    renderLauncher();
    expect(screen.queryByRole("button", { name: "Open Bastion Guide" })).not.toBeInTheDocument();
  });
});
