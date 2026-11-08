import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { GuideSessionProvider } from "@/components/guide-session";
import { GuideLauncher } from "@/components/guide-launcher";

// Client-only gate: the session lives in browser storage, so SSR cannot see it.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    return { authUser: data.user };
  },
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background" role="status">
      <p className="text-sm text-muted-foreground">Checking your session…</p>
    </div>
  ),
  component: AuthenticatedLayout,
});

// The Guide lives here, above the pages, so its conversation survives page changes and closing the
// panel. Keyed by user so a different account never sees another account's conversation.
function AuthenticatedLayout() {
  const { authUser } = Route.useRouteContext();
  return <GuideSessionProvider key={authUser.id}>
    <Outlet />
    <GuideLauncher />
  </GuideSessionProvider>;
}
