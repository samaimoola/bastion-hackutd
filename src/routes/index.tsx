import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Wordmark } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-provider";
import welcomeImage from "@/assets/bastion-welcome.jpg";

// Public welcome page (ported from the teammate's version). It only links onward: /dashboard and every
// workspace stay behind the existing _authenticated session gate, which sends visitors to /login.
// Account creation is invitation-only: the sign-up link leads to /signup, which shows a setup message until
// the database protection (docs/database-proposals/signup-invitations.sql) is installed and switched on.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bastion — Cyber incident command center" },
      {
        name: "description",
        content:
          "A shared place for your incident response team to stay informed and coordinate the response.",
      },
      { property: "og:title", content: "Bastion — Cyber incident command center" },
      {
        property: "og:description",
        content: "Stay informed and coordinate your incident response team with Bastion.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link to="/" aria-label="Bastion home">
            <Wordmark />
          </Link>
          <nav aria-label="Account navigation" className="flex items-center gap-2">
            <ThemeToggle compact />
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/signup">Create an account with an invitation</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/login">Sign in</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main>
        <section className="welcome-hero relative isolate flex min-h-[min(660px,72svh)] items-center overflow-hidden bg-welcome text-welcome-foreground">
          <img
            src={welcomeImage}
            alt=""
            width={1536}
            height={1024}
            fetchPriority="high"
            className="absolute inset-0 -z-10 h-full w-full object-cover object-right"
          />
          <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
            <div className="max-w-xl">
              <p className="text-sm font-medium text-welcome-accent">Cyber incident response</p>
              <h1 className="mt-4 text-6xl font-medium leading-tight sm:text-7xl">Bastion</h1>
              <p className="mt-5 max-w-md text-xl leading-8">
                A shared place to stay informed, coordinate the response, and work together.
              </p>
              <Button
                asChild
                size="lg"
                className="mt-8 h-12 w-full bg-welcome-accent text-welcome hover:bg-welcome-accent/90 sm:w-auto"
              >
                <Link to="/dashboard">
                  Enter dashboard <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </section>
        <section className="border-b border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 size-5 shrink-0 text-info" aria-hidden />
              <div>
                <h2 className="text-lg font-medium">One team. A clear picture.</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                  Keep the incident record, affected systems, tasks and team conversations together.
                </p>
              </div>
            </div>
            <div className="max-w-sm text-sm leading-6 text-muted-foreground">
              <p>
                Accounts are invitation-only. Your Bastion administrator creates them, or an incident
                commander sends you a one-use invitation code.
              </p>
              <Link
                to="/signup"
                className="mt-1 inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
              >
                Have an invitation code? Create your account
              </Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="mx-auto max-w-6xl px-5 py-6 text-xs text-muted-foreground sm:px-8">
        Bastion · Incident response workspace
      </footer>
    </div>
  );
}
