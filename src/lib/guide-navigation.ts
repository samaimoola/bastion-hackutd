export const workspaceTabs = ["overview", "timeline", "systems", "tasks", "chat", "lab"] as const;
export type WorkspaceTab = (typeof workspaceTabs)[number];
export type GuideDestination = { page: "incidents" | "team" } | { page: "workspace"; tab: WorkspaceTab };

/** Only explicit navigation requests trigger a move; ordinary help questions remain in chat. */
export function guideDestination(text: string): GuideDestination | null {
  const command = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (!/^(?:please\s+)?(?:open|show(?:\s+me)?|go\s+to|take\s+me\s+to|navigate\s+to|bring\s+me\s+to)\s+/.test(command)) return null;
  const target = command.replace(/^(?:please\s+)?(?:open|show(?:\s+me)?|go\s+to|take\s+me\s+to|navigate\s+to|bring\s+me\s+to)\s+/, "").replace(/^(?:the|my)\s+/, "").replace(/\s+(?:page|tab|please)$/, "");
  if (/^(tasks?|task list)$/.test(target)) return { page: "workspace", tab: "tasks" };
  if (/^(timeline|events?|updates?)$/.test(target)) return { page: "workspace", tab: "timeline" };
  if (/^(affected systems(?: and data)?|systems?|assets?)$/.test(target)) return { page: "workspace", tab: "systems" };
  if (/^(communications?|team chat|chat)$/.test(target)) return { page: "workspace", tab: "chat" };
  if (/^(containment lab|lab|what-if|simulation)$/.test(target)) return { page: "workspace", tab: "lab" };
  if (/^(overview|workspace|incident workspace|response brief)$/.test(target)) return { page: "workspace", tab: "overview" };
  if (/^(team|team administration|members)$/.test(target)) return { page: "team" };
  if (/^(incidents?|home|dashboard)$/.test(target)) return { page: "incidents" };
  return null;
}

export function parseWorkspaceTab(value: unknown): WorkspaceTab {
  return workspaceTabs.find((tab) => tab === value) ?? "overview";
}