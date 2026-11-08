import type { Chat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { createContext, useContext } from "react";

// Stable module so the context keeps its identity through Vite hot updates.
export type GuideView = "ask" | "help";
export type GuideSession = {
  chat: Chat<UIMessage> | null;
  blockedReason: string | null;
  historyState: "idle" | "loading" | "error" | "ready";
  loadHistory: () => void;
  draft: string;
  setDraft: (value: string) => void;
  open: boolean;
  setOpen: (value: boolean) => void;
  view: GuideView;
  setView: (value: GuideView) => void;
};
export const GuideSessionContext = createContext<GuideSession | null>(null);

export function useGuideSession(): GuideSession {
  const context = useContext(GuideSessionContext);
  if (!context) throw new Error("useGuideSession must be used inside GuideSessionProvider");
  return context;
}
