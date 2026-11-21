"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  /**
   * Nearly the whole window, and tighter padding. For a full page of document
   * where every pixel of width is another point of legible type.
   */
  roomy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
  roomy?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50",
        roomy ? "p-3 pt-[3vh]" : "p-4 pt-[8vh]"
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "w-full rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900",
          roomy ? "max-w-6xl" : wide ? "max-w-3xl" : "max-w-lg"
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
