import { createContext, type Context } from "react";
import type { Store } from "@/lib/demo-store";

// Keep context identity independent of the frequently edited data/provider module.
// Retain it even when this module itself is replaced by Vite hot updates.
const hotData = import.meta.hot?.data;
const previous = hotData?.demoContext as Context<Store | null> | undefined;
export const DemoContext = previous ?? createContext<Store | null>(null);
if (hotData) hotData.demoContext = DemoContext;