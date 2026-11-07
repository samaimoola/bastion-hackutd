import { createContext } from "react";
import type { Store } from "@/lib/demo-store";

// Keep context identity independent of the frequently edited data/provider module.
// Retain it even when this module itself is replaced by Vite hot updates.
const previous = import.meta.hot?.data.demoContext;
export const DemoContext = previous as React.Context<Store | null> | undefined ?? createContext<Store | null>(null);
if (import.meta.hot) import.meta.hot.data.demoContext = DemoContext;