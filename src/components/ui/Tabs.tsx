"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useSessionValue } from "@/lib/use-external-state";

export interface TabDef {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export function Tabs({
  tabs,
  initial,
  /**
   * Remember the open tab for this sitting. Without it, stepping away to check
   * a resume and coming back drops you on the first tab again.
   */
  rememberAs,
}: {
  tabs: TabDef[];
  initial?: string;
  rememberAs?: string;
}) {
  const fallback = initial ?? tabs[0]?.id;
  const remembered = useSessionValue(`jp_tab_${rememberAs ?? ""}`, fallback);
  const local = useState(fallback);
  const [active, setActive] = rememberAs ? remembered : local;
  // A remembered id can outlive the tab itself (a tab that only appears when a
  // match exists, say), so fall back rather than render nothing.
  const current = tabs.find((t) => t.id === active) ?? tabs.find((t) => t.id === fallback) ?? tabs[0];

  return (
    <div>
      <div
        role="tablist"
        className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === active}
            onClick={() => setActive(tab.id)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab.id === active
                ? "border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-4">
        {current?.content}
      </div>
    </div>
  );
}
