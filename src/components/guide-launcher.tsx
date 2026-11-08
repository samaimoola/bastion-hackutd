import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Expand, MessageCircleQuestion, MessageSquare, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { BastionGuide } from "@/components/bastion-guide";
import { useGuideSession, type GuideView } from "@/lib/guide-session-context";
import { useSimpleMode } from "@/lib/simple-mode-context";
import { followUpPrompt, incidentIdFromPath, pageHelp, type PageHelp } from "@/lib/page-help";

const HINT_KEY = "bastion-guide-hint-seen";
const readHintSeen = () => {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true;
  }
};
const markHintSeen = () => {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    /* Hint simply shows again. */
  }
};
/** Runs after the next paint (or next tick where requestAnimationFrame is unavailable). */
const afterPaint = (fn: () => void) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
  else window.setTimeout(fn, 0);
};
const isFocusVisible = (el: Element) => {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
};

/**
 * Floating Bastion Guide for signed-in pages. Opens the same Guide conversation as /guide in a
 * non-modal side panel (full screen on small screens), so the incident stays visible and usable.
 */
export function GuideLauncher() {
  const session = useGuideSession();
  const { open, setOpen, view, setView } = session;
  const { simple } = useSimpleMode();
  const location = useRouterState({ select: (s) => s.location });
  const onGuidePage = location.pathname.startsWith("/guide");
  const help = pageHelp(location.pathname, location.search as Record<string, unknown>);
  const incidentId = incidentIdFromPath(location.pathname);
  const launcher = useRef<HTMLButtonElement>(null);
  const helpHeading = useRef<HTMLHeadingElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [menu, setMenu] = useState(false);
  const [hint, setHint] = useState(false);
  const panelId = useId();
  const menuId = useId();

  useEffect(() => {
    setHint(!readHintSeen());
  }, []);
  // The full Guide page already shows the conversation; never show two Guides at once.
  useEffect(() => {
    if (onGuidePage && open) setOpen(false);
  }, [onGuidePage, open, setOpen]);
  // Wide screens make room for the panel so the incident stays visible beside it.
  useEffect(() => {
    if (open) document.documentElement.dataset["guideOpen"] = "true";
    else delete document.documentElement.dataset["guideOpen"];
    return () => {
      delete document.documentElement.dataset["guideOpen"];
    };
  }, [open]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const openPanel = (next: GuideView) => {
    setView(next);
    setOpen(true);
    setMenu(false);
    if (hint) {
      setHint(false);
      markHintSeen();
    }
  };
  const showMenu = () => {
    window.clearTimeout(closeTimer.current);
    setMenu(true);
  };
  const hideMenuSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMenu(false), 200);
  };
  const onFocus = (e: FocusEvent) => {
    if (e.target === launcher.current ? isFocusVisible(e.target) : true) showMenu();
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMenu(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && menu) {
      e.stopPropagation();
      setMenu(false);
      launcher.current?.focus();
    }
  };

  if (onGuidePage) return null;
  return (
    <>
      {!open && (
        <div
          className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden"
          onMouseEnter={showMenu}
          onMouseLeave={hideMenuSoon}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        >
          {hint && !menu && (
            <div
              role="note"
              className="flex max-w-56 items-start gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
            >
              <p>Questions about Bastion? Ask the Guide or get help with this page.</p>
              <button
                type="button"
                aria-label="Dismiss Guide tip"
                className="-mr-1 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setHint(false);
                  markHintSeen();
                }}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            {simple && (
              <span
                aria-hidden
                className="rounded-md bg-background/90 px-2 py-1 text-sm font-medium shadow"
              >
                Help
              </span>
            )}
            <button
              ref={launcher}
              type="button"
              aria-label="Open Bastion Guide"
              aria-haspopup="dialog"
              aria-expanded={false}
              aria-controls={panelId}
              aria-describedby={menu ? menuId : undefined}
              title="Bastion Guide"
              onClick={() => openPanel("ask")}
              className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-offset-background transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              <MessageCircleQuestion className="size-6" aria-hidden />
            </button>
          </div>
          {/* Shortcut menu: shown on hover or keyboard focus; the same actions are inside the panel for touch. */}
          <div
            id={menuId}
            role="group"
            aria-label="Guide shortcuts"
            hidden={!menu}
            className={`order-first flex flex-col gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg`}
          >
            <button
              type="button"
              onClick={() => openPanel("ask")}
              className="flex min-h-10 items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MessageSquare className="size-4" aria-hidden />
              Ask Bastion
            </button>
            <button
              type="button"
              onClick={() => openPanel("help")}
              className="flex min-h-10 items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BookOpen className="size-4" aria-hidden />
              Help with this page
            </button>
          </div>
        </div>
      )}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            id={panelId}
            aria-describedby={`${panelId}-desc`}
            // Keep the panel open while people use the page beside it; Escape or Close dismisses it.
            onInteractOutside={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => {
              if (view === "help") {
                e.preventDefault();
                afterPaint(() => helpHeading.current?.focus());
              }
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              afterPaint(() => launcher.current?.focus());
            }}
            className="fixed inset-0 z-40 flex flex-col bg-background text-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 md:inset-y-0 md:left-auto md:right-0 md:w-[26rem] md:border-l md:border-border md:data-[state=open]:slide-in-from-right motion-reduce:animate-none"
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
              <DialogPrimitive.Title className="flex-1 text-base font-medium">
                Bastion Guide
              </DialogPrimitive.Title>
              <Button
                asChild
                variant="ghost"
                size={simple ? "sm" : "icon"}
                title="Open the full Guide page"
              >
                <Link
                  to="/guide"
                  aria-label="Expand to the full Guide page"
                  onClick={() => setOpen(false)}
                >
                  <Expand className="size-4" aria-hidden />
                  {simple && "Expand"}
                </Link>
              </Button>
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size={simple ? "sm" : "icon"}
                  aria-label="Close Bastion Guide"
                  title="Close (Esc)"
                >
                  <X className="size-4" aria-hidden />
                  {simple && "Close"}
                </Button>
              </DialogPrimitive.Close>
            </header>
            <DialogPrimitive.Description id={`${panelId}-desc`} className="sr-only">
              Ask questions about using Bastion, or read help for this page. The page stays usable
              while this panel is open. Press Escape to close.
            </DialogPrimitive.Description>
            <div
              role="group"
              aria-label="Guide view"
              className="flex shrink-0 gap-1 border-b border-border px-4 py-2"
            >
              {(
                [
                  ["ask", "Ask Bastion"],
                  ["help", "Help with this page"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={view === value ? "secondary" : "ghost"}
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
              {view === "ask" ? (
                <BastionGuide variant="panel" incidentId={incidentId} />
              ) : (
                <HelpView
                  help={help}
                  headingRef={helpHeading}
                  onAsk={() => {
                    if (!session.draft.trim()) session.setDraft(followUpPrompt(help));
                    setView("ask");
                  }}
                />
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

function HelpView({
  help,
  headingRef,
  onAsk,
}: {
  help: PageHelp;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onAsk: () => void;
}) {
  return (
    <div className="h-full space-y-4 overflow-y-auto py-4 text-sm">
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-medium focus:outline-none">
        {help.title}
      </h2>
      <p>{help.purpose}</p>
      <ol className="list-decimal space-y-2 pl-5">
        {help.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {help.note && <p className="text-muted-foreground">{help.note}</p>}
      <div className="border-t border-border pt-4">
        <p className="text-muted-foreground">
          Still unsure? Ask a follow-up. Nothing is sent until you submit your question, and page
          records are never included.
        </p>
        <Button variant="outline" className="mt-3" onClick={onAsk}>
          <MessageSquare className="size-4" aria-hidden />
          Ask a follow-up
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        This help is written for this screen and does not use AI.
      </p>
    </div>
  );
}
