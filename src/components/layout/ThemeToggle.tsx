"use client";

import { Moon, Sun } from "lucide-react";
import { useDarkMode } from "@/lib/use-external-state";

export function ThemeToggle() {
  const [dark, setDark] = useDarkMode();

  return (
    <button
      type="button"
      onClick={() => setDark(!dark)}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex size-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
