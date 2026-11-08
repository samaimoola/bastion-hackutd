import { Chat, useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";
import { Copy } from "lucide-react";
import { BastionEmblem } from "@/components/city-skyline";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageAction,
  MessageActions,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useWorkspace } from "@/lib/workspace-api";
import { guideDestination } from "@/lib/guide-navigation";
import { useGuideSession } from "@/lib/guide-session-context";

/** Loads the shared conversation (if needed) and renders the Guide. Used by the page and the panel. */
export function BastionGuide({ variant = "page", incidentId }: { variant?: "page" | "panel"; incidentId?: string | null }) {
  const session = useGuideSession();
  const { historyState, loadHistory } = session;
  useEffect(() => { if (historyState === "idle") loadHistory(); }, [historyState, loadHistory]);
  if (!session.chat) {
    return historyState === "error"
      ? <div role="alert" className="p-4 text-sm"><p>Your guide history could not be loaded.</p><Button variant="outline" className="mt-3" onClick={loadHistory}>Try again</Button></div>
      : <p role="status" className="p-4 text-sm text-muted-foreground">Loading your conversation…</p>;
  }
  return <GuideConversation chat={session.chat} blockedReason={session.blockedReason} draft={session.draft} setDraft={session.setDraft} variant={variant} incidentId={incidentId ?? null} />;
}

function GuideConversation({
  chat,
  blockedReason,
  draft,
  setDraft,
  variant,
  incidentId,
}: {
  chat: Chat<UIMessage>;
  blockedReason: string | null;
  draft: string;
  setDraft: (value: string) => void;
  variant: "page" | "panel";
  incidentId: string | null;
}) {
  const navigate = useNavigate();
  const { incident } = useWorkspace();
  const input = useRef<HTMLTextAreaElement>(null);
  const { messages, sendMessage, status, stop, error, clearError } = useChat({ chat });
  const failure = error?.message ?? blockedReason;
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    if (!busy) input.current?.focus();
  }, [busy]);
  const submit = async ({ text }: { text: string }) => {
    if (!text.trim() || busy) return;
    const destination = guideDestination(text);
    if (destination) {
      if (destination.page === "workspace") {
        // Workspace commands open the incident currently on screen, or the demo incident otherwise.
        await navigate({ to: "/incidents/$id", params: { id: incidentId ?? incident.id }, search: { tab: destination.tab } });
      } else {
        await navigate({ to: destination.page === "team" ? "/team" : "/" });
      }
      return;
    }
    if (blockedReason) return;
    clearError();
    setDraft("");
    await sendMessage({ text: text.trim() });
    input.current?.focus();
  };
  return (
    <div className={variant === "page" ? "mx-auto flex h-[min(760px,70dvh)] min-h-[420px] w-full max-w-3xl flex-col border-t border-border pt-3" : "flex h-full min-h-0 w-full flex-col"}>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-7 px-0 py-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center py-8 text-center">
              <BastionEmblem className="mb-4 h-12 w-12" />
              <h2 className={variant === "page" ? "text-2xl" : "text-xl"}>What do you need help with?</h2>
              <div className={`mt-6 grid w-full max-w-xl gap-3 ${variant === "page" ? "sm:grid-cols-3" : ""}`}>
                {[
                  "What should I do first?",
                  "How do I update an incident?",
                  "How do I invite someone?",
                ].map((text) => (
                  <Button
                    key={text}
                    variant="outline"
                    className="h-auto min-h-14 whitespace-normal px-4 py-3 text-left"
                    onClick={() => {
                      setDraft(text);
                      input.current?.focus();
                    }}
                  >
                    {text}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <span className="text-xs font-medium text-muted-foreground">
                {message.role === "user" ? "You" : "Bastion Guide"}
              </span>
              <MessageContent
                className={
                  message.role === "user"
                    ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground"
                    : "w-full"
                }
              >
                {message.parts.map((part, index) =>
                  part.type === "text" ? (
                    <MessageResponse key={index}>{part.text}</MessageResponse>
                  ) : part.type === "reasoning" ? (
                    <Reasoning
                      key={index}
                      defaultOpen={false}
                      isStreaming={busy && message.id === messages.at(-1)?.id}
                    >
                      <ReasoningTrigger />
                      <ReasoningContent>{part.text}</ReasoningContent>
                    </Reasoning>
                  ) : null,
                )}
              </MessageContent>
              {message.role === "assistant" && !busy && (
                <MessageActions>
                  <MessageAction
                    tooltip="Copy answer"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        message.parts
                          .filter((p) => p.type === "text")
                          .map((p) => p.text)
                          .join("\n"),
                      );
                    }}
                  >
                    <Copy />
                  </MessageAction>
                </MessageActions>
              )}
            </Message>
          ))}
          {status === "submitted" && (
            <div role="status">
              <Shimmer>Thinking…</Shimmer>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {failure && (
        <p
          role="alert"
          className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {failure}
        </p>
      )}
      <PromptInput onSubmit={submit} className="shrink-0">
        <PromptInputTextarea
          ref={input}
          autoFocus={variant === "page"}
          aria-label="Ask Bastion Guide"
          placeholder="Ask about using Bastion…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={12000}
          className="min-h-20"
        />
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit
            status={status}
            onStop={() => {
              void stop();
            }}
            disabled={(!busy && !draft.trim()) || (Boolean(blockedReason) && !guideDestination(draft))}
          />
        </PromptInputFooter>
      </PromptInput>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Saved to your account · AI answers may be inaccurate. Don’t share secrets or confidential
        incident details.
      </p>
    </div>
  );
}
