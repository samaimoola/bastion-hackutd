// Reviewed, static "Help with this page" guidance. Chosen only from the URL; it never reads incident
// records, messages or other page content, and nothing here is sent to the AI.
import { parseWorkspaceTab, type WorkspaceTab } from "./guide-navigation";

export type PageHelp = {
  key: string;
  title: string;
  purpose: string;
  steps: string[];
  note?: string;
};

const workspaceLive: Record<WorkspaceTab, Omit<PageHelp, "key">> = {
  overview: {
    title: "Incident overview",
    purpose: "A plain summary of what happened, where the response is, and what you can do.",
    steps: [
      "Read “What happened” and “Current status”.",
      "Use “What you can do here” to open a section.",
      "Select Edit incident to change the title, description, severity or stage.",
      "Select Team access to see who can open this incident.",
    ],
    note: "Commanders and responders can edit. Only commanders can invite people or change access.",
  },
  systems: {
    title: "Affected systems and data",
    purpose: "Record each computer, account or service involved and track whether it is contained.",
    steps: [
      "Select Add system (or Add the first system).",
      "Name the system, describe the data and choose how certain the finding is.",
      "Update the containment status as the team makes progress.",
    ],
    note: "Commanders and responders can add and edit. Viewers can read.",
  },
  tasks: {
    title: "Tasks",
    purpose: "Tasks are not available for real incidents yet.",
    steps: ["Open the demo workspace from the Incidents page to see how tasks will work."],
  },
  timeline: {
    title: "Timeline",
    purpose: "A record of changes to this incident, newest first.",
    steps: [
      "Entries are added automatically. You do not need to write them.",
      "Each entry shows what changed, who changed it and when (UTC).",
    ],
  },
  chat: {
    title: "Communications",
    purpose: "Messages for everyone with access to this incident.",
    steps: ["Type in the Message box.", "Select Send message."],
    note: "Messages cannot be edited after sending. Do not share passwords or other secrets.",
  },
  lab: {
    title: "Containment Lab",
    purpose:
      "Compare “what if we isolate this system?” before deciding. Nothing is actually isolated.",
    steps: [
      "Choose a system under “Which system would you hypothetically isolate?”.",
      "Read the outcome: what is cut off, what is still exposed, and what stops working.",
      "Use “Compare isolation options” to see every choice side by side.",
      "Open “Edit systems and connections” to change the model.",
    ],
  },
};

const workspaceDemo: Record<WorkspaceTab, Omit<PageHelp, "key">> = {
  ...workspaceLive,
  overview: {
    title: "Demo incident overview",
    purpose: "A practice incident with made-up records, kept only in this browser tab.",
    steps: [
      "Read “What happened” and “Current status”.",
      "Select Add an update to record what you found.",
      "Use “What you can do here” to open a section.",
    ],
  },
  systems: {
    title: "Demo affected systems",
    purpose: "Practice list of affected systems.",
    steps: [
      "Change a system’s status with its Update menu.",
      "Add a system with Hostname, Type and Add system.",
    ],
  },
  tasks: {
    title: "Demo tasks",
    purpose: "Practice creating and tracking tasks.",
    steps: [
      "Type in New task and choose an Assignee.",
      "Select Add task.",
      "Change a task’s status with its Update menu.",
    ],
  },
  timeline: {
    title: "Demo timeline",
    purpose: "What happened in this practice incident, in order.",
    steps: ["Select Add update, fill in the update and event time, then select Record update."],
  },
  chat: {
    title: "Demo team chat",
    purpose: "Practice messages. They are not delivered to anyone.",
    steps: ["Type a message and select Send."],
  },
};

const pages: Record<string, Omit<PageHelp, "key">> = {
  incidents: {
    title: "Incidents",
    purpose: "Every incident your account can open.",
    steps: [
      "Select an incident to open its workspace.",
      "Select New Incident to start one. You become its commander.",
      "Open the demo workspace to practice with made-up data.",
    ],
  },
  team: {
    title: "Response team (demo)",
    purpose: "A practice list of team members. Changes are not saved.",
    steps: ["Enter a name and email, choose a role, then select Add member."],
    note: "Real incident access is managed under Team access inside each incident.",
  },
  guide: {
    title: "Bastion Guide",
    purpose: "Ask questions about using Bastion.",
    steps: ["Type a question and press Enter.", "Your conversation is saved to your account."],
    note: "Answers can be wrong. Do not share secrets or confidential incident details.",
  },
  other: {
    title: "This page",
    purpose: "No page-specific help is written for this screen yet.",
    steps: ["Ask Bastion a question instead."],
  },
};

export function pageHelp(pathname: string, search: Record<string, unknown>): PageHelp {
  const incident = /^\/incidents\/([^/]+)\/?$/.exec(pathname);
  if (incident) {
    const tab = parseWorkspaceTab(search["tab"]);
    const demo = decodeURIComponent(incident[1]!) === "INC-2026-0412";
    return {
      key: `${demo ? "demo" : "live"}:${tab}`,
      ...(demo ? workspaceDemo : workspaceLive)[tab],
    };
  }
  if (pathname === "/" || pathname === "") return { key: "incidents", ...pages["incidents"]! };
  if (pathname.startsWith("/team")) return { key: "team", ...pages["team"]! };
  if (pathname.startsWith("/guide")) return { key: "guide", ...pages["guide"]! };
  return { key: "other", ...pages["other"]! };
}

/** Pre-filled (never auto-sent) follow-up question. Contains only the page name. */
export const followUpPrompt = (help: PageHelp) => `I'm on the ${help.title} page. `;

/** The incident open in the URL, if any. Used only to route explicit Guide navigation commands. */
export function incidentIdFromPath(pathname: string): string | null {
  const match = /^\/incidents\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}
