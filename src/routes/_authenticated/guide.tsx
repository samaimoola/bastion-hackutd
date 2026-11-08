import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { BastionGuide } from "@/components/bastion-guide";
import { SimpleHint } from "@/components/simple-mode";
import { guideHistoryOptions } from "@/lib/guide-queries";
export const Route = createFileRoute("/_authenticated/guide")({
  head: () => ({
    meta: [
      { title: "AI Guide — Bastion" },
      {
        name: "description",
        content: "Ask Bastion Guide for help using incident workspaces, tasks, and timelines.",
      },
      { property: "og:title", content: "AI Guide — Bastion" },
      { property: "og:description", content: "Get help navigating and using Bastion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // The loader still fetches history first, so direct links behave as before.
  loader: ({ context }) => context.queryClient.ensureQueryData(guideHistoryOptions),
  component: GuidePage,
});
function GuidePage() {
  // Same conversation as the floating panel: it continues here when the panel is expanded.
  return (
    <AppShell mode="account">
      <div className="mx-auto max-w-3xl text-center"><PageHeader eyebrow="Your workspace assistant" title="Bastion Guide" />
        <SimpleHint className="-mt-5 mb-6">Ask how to do something in Bastion. Type your question below and press Enter.</SimpleHint></div>
      <BastionGuide variant="page" />
    </AppShell>
  );
}
