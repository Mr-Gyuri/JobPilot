import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "green" | "red" | "amber" | "indigo" | "sky";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  red: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONES[tone],
        className
      )}
      {...rest}
    />
  );
}
