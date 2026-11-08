import { z } from "zod";

export const entryTypes = ["Finding", "Action", "Decision", "Status change"] as const;
export type EntryType = typeof entryTypes[number];
export interface TimelineEntry {
  id: string;
  at: string;
  recordedAt: string;
  author: string;
  text: string;
  type: EntryType;
}

export const timelineInputSchema = z.object({
  text: z.string().trim().min(1, "Enter an update.").max(2000, "Use 2,000 characters or fewer."),
  type: z.enum(entryTypes),
  at: z.string().datetime({ offset: true, message: "Enter a valid event time." }),
}).superRefine((input, ctx) => {
  if (new Date(input.at).getTime() > Date.now()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["at"], message: "Event time cannot be in the future." });
  }
});
export type TimelineInput = z.infer<typeof timelineInputSchema>;

export function utcInputValue(date = new Date()) {
  return date.toISOString().slice(0, 16);
}

export function eventInput(text: string, type: EntryType, utcTime: string) {
  const date = new Date(`${utcTime}:00Z`);
  return timelineInputSchema.parse({ text, type, at: Number.isNaN(date.getTime()) ? "" : date.toISOString() });
}

/** Plain-language meaning of each response stage. Definitions only, never recommended next steps. */
export const stageMeaning: Record<string, string> = {
  Detection: "The team is confirming what happened and how far it reaches.",
  Containment: "The team is working to stop the problem from spreading.",
  Eradication: "The team is removing the cause, such as malware or a compromised account.",
  Recovery: "The team is restoring affected systems and services.",
  "Post-incident": "The response is wrapping up and the team is reviewing what happened.",
};
