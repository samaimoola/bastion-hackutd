import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { AppShell, PageHeader } from "@/components/app-shell";
import { BastionGuide } from "@/components/bastion-guide";
import { guideHistory } from "@/lib/guide.functions";

const historyOptions = queryOptions({
  queryKey: ["guide-history"],
  queryFn: () => guideHistory(),
  staleTime: 0,
});
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
  loader: ({ context }) => context.queryClient.ensureQueryData(historyOptions),
  component: GuidePage,
});
function GuidePage() {
  const { data } = useSuspenseQuery(historyOptions);
  const messages = Array.isArray(data.messages) ? (data.messages as unknown as UIMessage[]) : [];
  return (
    <AppShell>
      <PageHeader eyebrow="Workspace help" title="Bastion Guide" />
      <BastionGuide initialMessages={messages} blockedReason={data.blockedReason} />
    </AppShell>
  );
}
