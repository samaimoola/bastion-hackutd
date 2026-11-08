import { Chat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { guideHistoryOptions } from "@/lib/guide-queries";
import { createGuideTransport } from "@/lib/guide-transport";
import {
  GuideSessionContext,
  type GuideSession,
  type GuideView,
} from "@/lib/guide-session-context";

// One Guide conversation per signed-in user, shared by the floating panel and the /guide page.
// Same backend route, transport and owner-scoped history as before; only where it lives changed,
// so closing the panel or moving between pages never erases the conversation.
export function GuideSessionProvider({ children }: { children: ReactNode }) {
  // History is fetched only once the Guide is first used (or already cached by the /guide loader).
  const [wanted, setWanted] = useState(false);
  const history = useQuery({ ...guideHistoryOptions, enabled: wanted });
  const chatRef = useRef<Chat<UIMessage> | null>(null);
  const [chat, setChat] = useState<Chat<UIMessage> | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<GuideView>("ask");
  useEffect(() => {
    if (chatRef.current || !history.data) return;
    const messages = Array.isArray(history.data.messages)
      ? (history.data.messages as unknown as UIMessage[])
      : [];
    chatRef.current = new Chat<UIMessage>({
      id: "bastion-guide",
      messages,
      transport: createGuideTransport(),
    });
    setChat(chatRef.current);
  }, [history.data]);
  useEffect(
    () => () => {
      void chatRef.current?.stop();
    },
    [],
  );
  const historyState = chat
    ? "ready"
    : history.isError
      ? "error"
      : wanted || history.isFetching
        ? "loading"
        : "idle";
  const value: GuideSession = {
    chat,
    blockedReason: history.data?.blockedReason ?? null,
    historyState,
    loadHistory: () => {
      if (history.isError) void history.refetch();
      else setWanted(true);
    },
    draft,
    setDraft,
    open,
    setOpen,
    view,
    setView,
  };
  return <GuideSessionContext.Provider value={value}>{children}</GuideSessionContext.Provider>;
}
