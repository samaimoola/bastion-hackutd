import { z } from "zod";
const guideUserTurnSchema = z.object({
        id: z.string().min(1).max(200),
        role: z.literal("user"),
        parts: z.array(z.object({ type: z.literal("text"), text: z.string().max(12000) })).min(1),
});

export const guideRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(300),
});

export function validateGuideTurn(input: unknown) {
  const data = guideRequestSchema.parse(input);
  // Earlier browser turns are ignored: account-saved history is authoritative.
  const latest = guideUserTurnSchema.parse(data.messages.at(-1));
  if (!latest.parts.some((p) => p.text.trim()) || latest.parts.reduce((size, part) => size + part.text.length, 0) > 12000) {
    throw new Error("Enter a question for the guide.");
  }
  return latest;
}
