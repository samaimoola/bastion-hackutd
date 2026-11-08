import { useContext, useEffect, useState, type ReactNode } from "react";
import { SimpleModeContext, useSimpleMode } from "@/lib/simple-mode-context";
import { Glasses } from "lucide-react";
import { Button } from "@/components/ui/button";

// Presentation-only preference. Stored in this browser, independent of the light/dark theme, and never
// used for authorization: every permission check stays where it was.
const STORAGE_KEY = "bastion-simple-mode";

const apply = (on: boolean) => {
  if (on) document.documentElement.dataset["simple"] = "true";
  else delete document.documentElement.dataset["simple"];
};

export function SimpleModeProvider({ children }: { children: ReactNode }) {
  const [simple, setState] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* Storage can be unavailable. */
    }
    const initial = saved === "on";
    setState(initial);
    apply(initial);
  }, []);
  const setSimple = (value: boolean) => {
    setState(value);
    apply(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
    } catch {
      /* Still works for this tab. */
    }
  };
  return (
    <SimpleModeContext.Provider value={{ simple, setSimple }}>
      {children}
    </SimpleModeContext.Provider>
  );
}

export function SimpleModeToggle() {
  const context = useContext(SimpleModeContext);
  if (!context) return null;
  const { simple, setSimple } = context;
  return (
    <Button
      variant={simple ? "default" : "outline"}
      size="sm"
      aria-pressed={simple}
      onClick={() => setSimple(!simple)}
      title={
        simple
          ? "Simple mode is on: larger text and short explanations"
          : "Turn on larger text and short explanations"
      }
      className={simple ? "shrink-0" : "shrink-0 bg-background/90"}
    >
      <Glasses aria-hidden className="size-4" />
      Simple mode
    </Button>
  );
}

/** Short static explanation shown only in Simple mode. Pass `id` to reference it with aria-describedby. */
export function SimpleHint({
  children,
  id,
  className = "",
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const { simple } = useSimpleMode();
  if (!simple) return null;
  return (
    <p id={id} className={`text-sm text-muted-foreground ${className}`}>
      {children}
    </p>
  );
}
