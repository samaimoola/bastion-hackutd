import { createContext, useContext } from "react";

// Stable module so the context keeps its identity through Vite hot updates (same reason as
// DemoContext). Presentation-only preference; never used for authorization.
export type SimpleMode = { simple: boolean; setSimple: (value: boolean) => void };
export const SimpleModeContext = createContext<SimpleMode | null>(null);

/** Outside the provider (for example in isolated component tests) Simple mode is off. */
export function useSimpleMode(): SimpleMode {
  return useContext(SimpleModeContext) ?? { simple: false, setSimple: () => {} };
}

/** Returns an aria-describedby value only while Simple mode is showing the hint. */
export function useHintId(id: string): string | undefined {
  return useSimpleMode().simple ? id : undefined;
}
