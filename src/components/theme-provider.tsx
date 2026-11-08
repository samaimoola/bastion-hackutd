import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("bastion-theme"); } catch { /* Storage can be unavailable. */ }
    const initial = saved === "light" ? "light" : "dark";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
    document.documentElement.style.colorScheme = initial;
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem("bastion-theme", next); } catch { /* Theme still works without storage. */ }
  };
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle({ compact = false, labeled = false }: { compact?: boolean; labeled?: boolean }) {
  const context = useContext(ThemeContext);
  if (!context) return null;
  const { theme, toggleTheme } = context;
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} theme`;
  return (
    <Button variant="outline" size={compact && !labeled ? "icon" : "sm"} onClick={toggleTheme} aria-label={label} title={label} className={compact ? "shrink-0 bg-background/90" : "w-full justify-start"}>
      {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      {(!compact || labeled) && <span>{theme === "dark" ? "Light appearance" : "Dark appearance"}</span>}
    </Button>
  );
}