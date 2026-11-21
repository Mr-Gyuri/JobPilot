"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

export function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const tag = draft.trim().replace(/,+$/, "");
    if (tag && !value.some((v) => v.toLowerCase() === tag.toLowerCase())) {
      onChange([...value, tag]);
    }
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:outline-2 focus-within:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((v) => v !== tag))}
            className="rounded-full hover:text-indigo-950 dark:hover:text-white"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : undefined}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
      />
    </div>
  );
}
