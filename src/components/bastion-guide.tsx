import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BastionEmblem } from "@/components/city-skyline";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse, MessageAction, MessageActions } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";

export function BastionGuide({ initialMessages, blockedReason }: { initialMessages: UIMessage[]; blockedReason: string | null }) {
  const [draft, setDraft] = useState("");
  const [failure, setFailure] = useState<string | null>(blockedReason);
  const input = useRef<HTMLTextAreaElement>(null);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/guide",
    headers: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
    },
    prepareSendMessagesRequest: ({ messages, headers }) => ({ headers, body: { messages: messages.map((m) => ({ id: m.id, role: m.role, parts: m.parts.filter((p) => p.type === "text") })) } }),
    fetch: async (url, init) => {
      const response = await fetch(url, init);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? "The guide could not respond. Please try again.");
      }
      return response;
    },
  }), []);
  const { messages, sendMessage, status, stop } = useChat({
    id: "bastion-guide", messages: initialMessages, transport,
    onError: (error) => setFailure(error.message),
  });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => { if (!busy) input.current?.focus(); }, [busy]);
  const submit = async ({ text }: { text: string }) => {
    if (!text.trim() || busy || blockedReason) return;
    setFailure(null); setDraft("");
    await sendMessage({ text: text.trim() });
    input.current?.focus();
  };
  return (
    <div className="mx-auto flex h-[min(760px,75vh)] min-h-[460px] max-w-3xl flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-7 px-0 py-5">
          {messages.length === 0 && <div className="flex flex-col items-center py-8 text-center">
            <BastionEmblem className="mb-4 h-12 w-12" />
            <h2 className="text-2xl">Where would you like to start?</h2>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["How do I add a task?", "How do I record a timeline event?", "Where is the Response Brief?"].map((text) => <Button key={text} variant="outline" onClick={() => { setDraft(text); input.current?.focus(); }}>{text}</Button>)}
            </div>
          </div>}
          {messages.map((message) => <Message key={message.id} from={message.role}>
            <span className="text-xs font-medium text-muted-foreground">{message.role === "user" ? "You" : "Bastion Guide"}</span>
            <MessageContent className={message.role === "user" ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground" : "w-full"}>
              {message.parts.map((part, index) => part.type === "text" ? <MessageResponse key={index}>{part.text}</MessageResponse> : part.type === "reasoning" ? <Reasoning key={index} defaultOpen={false} isStreaming={busy && message.id === messages.at(-1)?.id}><ReasoningTrigger /><ReasoningContent>{part.text}</ReasoningContent></Reasoning> : null)}
            </MessageContent>
            {message.role === "assistant" && !busy && <MessageActions><MessageAction tooltip="Copy answer" onClick={() => { void navigator.clipboard.writeText(message.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n")); }}><Copy /></MessageAction></MessageActions>}
          </Message>)}
          {status === "submitted" && <div role="status"><Shimmer>Thinking…</Shimmer></div>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {failure && <p role="alert" className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{failure}</p>}
      <PromptInput onSubmit={submit} className="shrink-0">
        <PromptInputTextarea ref={input} autoFocus aria-label="Ask Bastion Guide" placeholder="Ask about using Bastion…" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={12000} className="min-h-20" />
        <PromptInputFooter className="justify-end"><PromptInputSubmit status={status} onStop={() => { void stop(); }} disabled={Boolean(blockedReason) || (!busy && !draft.trim())} /></PromptInputFooter>
      </PromptInput>
      <p className="mt-3 text-center text-xs text-muted-foreground">Saved to your account · AI answers may be inaccurate. Don’t share secrets or confidential incident details.</p>
    </div>
  );
}