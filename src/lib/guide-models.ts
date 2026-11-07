import { z } from "zod";
export const guideRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        role: z.enum(["user", "assistant"]),
        parts: z.array(z.object({ type: z.literal("text"), text: z.string().max(12000) })).min(1),
      }),
    )
    .min(1)
    .max(300),
});

export function validateGuideTurn(input: unknown) {
  const data = guideRequestSchema.parse(input);
  const latest = data.messages.at(-1);
  if (!latest || latest.role !== "user" || !latest.parts.some((p) => p.text.trim())) {
    throw new Error("Enter a question for the guide.");
  }
  return latest;
}
