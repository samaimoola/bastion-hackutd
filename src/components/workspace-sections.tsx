import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { WorkspaceTab } from "@/lib/guide-navigation";
import { MoreHorizontal } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SimpleHint } from "@/components/simple-mode";
import { useSimpleMode } from "@/lib/simple-mode-context";
import { tabPurpose } from "@/lib/plain-language";

export type WorkspaceAction = {
  tab: WorkspaceTab;
  title: string;
  description: string;
  note?: string | undefined;
};

/** Links to existing workspace tabs, described in plain language. Uses the same URL-backed tabs. */
export function WorkspaceActionList({
  incidentId,
  items,
}: {
  incidentId: string;
  items: WorkspaceAction[];
}) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <li key={item.tab}>
          <Link
            to="/incidents/$id"
            params={{ id: incidentId }}
            search={{ tab: item.tab }}
            className="group flex min-h-11 items-start gap-3 py-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium group-hover:underline">{item.title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{item.description}</span>
              {item.note && (
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.note}</span>
              )}
            </span>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Native disclosure, matching the other workspace sections. Keyboard accessible by default. */
export function Disclosure({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-border">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />
        {title}
      </summary>
      <div className="border-t border-border px-4 py-4 text-sm">{children}</div>
    </details>
  );
}

const tabLabels: Record<WorkspaceTab, string> = {
  overview: "Overview",
  systems: "Affected Systems & Data",
  tasks: "Tasks",
  timeline: "Timeline",
  chat: "Communications",
  lab: "Containment Lab",
};
/** Everyday labels used in Simple mode. Tab values, and therefore URLs, never change. */
const simpleTabLabels: Record<WorkspaceTab, string> = {
  overview: "Summary",
  systems: "What’s affected?",
  tasks: "Tasks",
  timeline: "What changed?",
  chat: "Team chat",
  lab: "Compare isolation options",
};
const tabOrder: Record<"live" | "demo", WorkspaceTab[]> = {
  live: ["overview", "systems", "tasks", "timeline", "chat", "lab"],
  demo: ["overview", "timeline", "systems", "tasks", "chat", "lab"],
};
/** Simple mode: main destinations first, secondary tools under "More tools". */
const simpleLayout: Record<"live" | "demo", { main: WorkspaceTab[]; more: WorkspaceTab[] }> = {
  // Real-incident tasks are not connected, so they are not offered (the ?tab=tasks route still works).
  live: { main: ["overview", "systems", "chat", "timeline"], more: ["lab"] },
  demo: { main: ["overview", "systems", "chat", "timeline"], more: ["tasks", "lab"] },
};

/** Workspace tab bar. Must be rendered inside the workspace's <Tabs>. Tab values and URLs are unchanged. */
export function WorkspaceTabBar({
  tab,
  setTab,
  mode,
}: {
  tab: WorkspaceTab;
  setTab: (value: string) => void;
  mode: "live" | "demo";
}) {
  const { simple } = useSimpleMode();
  const label = simple ? simpleTabLabels : tabLabels;
  const layout = simpleLayout[mode];
  // The current tab is always visible as a tab, even when it is secondary or hidden.
  const shown = simple
    ? [...layout.main, ...(layout.main.includes(tab) ? [] : [tab])]
    : tabOrder[mode];
  const more = simple ? layout.more.filter((t) => t !== tab) : [];
  return (
    <>
      <div className="flex max-w-full items-end gap-3">
        <div className="min-w-0 overflow-x-auto">
          <TabsList
            aria-label="Incident workspace"
            className="h-auto min-w-max justify-start gap-4 rounded-none border-b border-border bg-transparent p-0 [&>button]:min-h-11 [&>button]:rounded-none [&>button]:border-b-2 [&>button]:border-transparent [&>button]:bg-transparent [&>button]:px-1 [&>button]:text-muted-foreground [&>button]:shadow-none [&>button:hover]:text-foreground [&>button[data-state=active]]:border-primary [&>button[data-state=active]]:bg-transparent [&>button[data-state=active]]:text-foreground [&>button[data-state=active]]:shadow-none"
          >
            {shown.map((t) => (
              <TabsTrigger key={t} value={t}>
                {label[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {more.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="mb-1.5 shrink-0">
                <MoreHorizontal className="size-4" aria-hidden />
                More tools
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-xs">
              {more.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onSelect={() => setTab(t)}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="font-medium">{label[t]}</span>
                  <span className="text-xs text-muted-foreground">{tabPurpose[mode][t]}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <SimpleHint className="mt-3">{tabPurpose[mode][tab]}</SimpleHint>
    </>
  );
}
