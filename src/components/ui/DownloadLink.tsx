import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A real anchor for file downloads — supports right-click "save as" and
 * middle-click, and works before hydration. Styled to match Button.
 */
export function DownloadLink({
  href,
  children,
  variant = "secondary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: "secondary" | "ghost";
  className?: string;
}) {
  return (
    <a
      href={href}
      download
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        variant === "secondary"
          ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
        className
      )}
    >
      {children}
    </a>
  );
}
