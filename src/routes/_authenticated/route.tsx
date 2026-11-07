import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Client-only gate: the session lives in browser storage, so SSR cannot see it.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    return { authUser: data.user };
  },
  pendingComponent: () => (
    <div className="sky flex min-h-screen items-center justify-center" role="status">
      <p className="text-sm text-muted-foreground">Checking your session…</p>
    </div>
  ),
  component: () => <Outlet />,
});
