import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/guide")({
  server: { handlers: { POST: async ({ request }) => {
    const { handleGuide } = await import("@/lib/guide.server");
    return handleGuide(request);
  } } },
});