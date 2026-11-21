"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";

/**
 * First-start guided tour.
 *
 * Walks the header one tab at a time, one short sentence per stop. Shows
 * itself once per profile (jp_tour_seen_<id> in localStorage, the same
 * convention as jp_theme) and can be replayed from the ? button this
 * component also renders — the tour's own last stop points at it, so
 * replaying is discoverable without reading anything.
 *
 * Per profile, because the two of them share one browser profile: whoever
 * opens it second still deserves the tour. But never twice in one sitting —
 * the app opens on the lowest profile id, so the common first run is "see the
 * tour, switch to my own name, see the identical tour again". A sessionStorage
 * flag suppresses that second showing and clears when the app closes, so a
 * genuine first run on another day is unaffected.
 */

interface Step {
  /** Matches a [data-tour] attribute in the header; null centres the card. */
  target: string | null;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    target: null,
    title: "Welcome to JobPilot",
    body: "It finds jobs, checks how well you fit them, and writes a resume for each one. Ten quick stops — or skip and just explore.",
  },
  {
    target: "profile-switcher",
    title: "Whose data you're seeing",
    body: "Everything in the app belongs to the name shown here. Check it's yours before you start.",
  },
  {
    target: "dashboard",
    title: "Dashboard",
    body: "Your overview: applications so far, follow-ups coming due, and what happened recently.",
  },
  {
    target: "search",
    title: "Search",
    body: "Find jobs on several sites at once. Not sure what to type? “Suggest from my resume” proposes titles for you.",
  },
  {
    target: "ingest",
    title: "Ingest",
    body: "Found a job somewhere else? Paste its link — or the posting text — and JobPilot saves and analyses it.",
  },
  {
    target: "resumes",
    title: "Resumes",
    body: "Upload your resume and fix anything it misread. Do this first — everything else is built from it.",
  },
  {
    target: "tracker",
    title: "Tracker",
    body: "Drag each job from Saved to Applied and onward, so nothing gets forgotten.",
  },
  {
    target: "profiles",
    title: "Profiles",
    body: "Your details and preferences — target roles, work setup, expected pay. The search uses them.",
  },
  {
    target: "settings",
    title: "Settings",
    body: "AI keys and backups live here.",
  },
  {
    target: "tour-toggle",
    title: "That's the lot",
    body: "Press this ? any time to see the tour again. Good luck! 🎯",
  },
];

const CARD_W = 320;

/** Set on any dismissal; suppresses auto-open for the rest of this sitting. */
const SESSION_KEY = "jp_tour_dismissed";

export function Tour({ activeProfileId }: { activeProfileId: number | null }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const storageKey = activeProfileId == null ? null : `jp_tour_seen_${activeProfileId}`;

  const open = useCallback(() => {
    // Drop stops whose anchor isn't on the page, so a later nav change can
    // never strand the tour on a target that no longer exists.
    const present = STEPS.filter(
      (s) => s.target === null || document.querySelector(`[data-tour="${s.target}"]`)
    );
    setIdx(0);
    setSteps(present);
  }, []);

  const close = useCallback(() => {
    setSteps(null);
    // Any dismissal counts as seen — a tour that nags gets ignored.
    try {
      if (storageKey) localStorage.setItem(storageKey, "1");
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {}
  }, [storageKey]);

  // First start for this profile: show it once, after the header has settled.
  useEffect(() => {
    if (!storageKey) return;
    // Default to "seen" so a storage failure can never turn this into a
    // pop-up that appears on every single page load.
    let seen = "1";
    try {
      seen = localStorage.getItem(storageKey) || sessionStorage.getItem(SESSION_KEY) || "";
    } catch {}
    if (seen) return;
    const t = setTimeout(open, 700);
    return () => clearTimeout(t);
  }, [storageKey, open]);

  // Follow the current stop's anchor, including through window resizes.
  const step = steps?.[idx] ?? null;
  useEffect(() => {
    if (!step) return;
    const measure = () => {
      const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]);

  // Keyboard: arrows move, Escape leaves.
  useEffect(() => {
    if (!steps) return;
    const total = steps.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, total - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps, close]);

  const last = steps != null && idx === steps.length - 1;
  const anchored = step?.target != null && rect != null;

  // Card sits below its anchor, clamped to the viewport. Every anchor lives
  // in the sticky header, so "below" always fits on screen.
  const cardLeft = anchored
    ? Math.max(
        12,
        Math.min(rect.left + rect.width / 2 - CARD_W / 2, window.innerWidth - CARD_W - 12)
      )
    : 0;
  const arrowLeft = anchored
    ? Math.max(14, Math.min(rect.left + rect.width / 2 - cardLeft - 6, CARD_W - 26))
    : 0;

  return (
    <>
      <button
        type="button"
        data-tour="tour-toggle"
        onClick={() => (steps ? close() : open())}
        aria-label={steps ? "Hide the tour" : "Show the tour"}
        title="Quick tour of the app"
        className="flex size-8 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <HelpCircle className="size-4" />
      </button>

      {/*
        Portalled to <body>. This component lives in the header, which uses
        backdrop-blur — and backdrop-filter makes an element a containing block
        for position:fixed descendants, so "fixed inset-0" resolved to the 56px
        header instead of the viewport: the page never dimmed and top-1/3 landed
        at 18px. The anchored stops only looked right because their dimming is a
        9999px box-shadow spread, which paints outside that box anyway.
      */}
      {steps && step && createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="App tour">
          {/* Swallows clicks so the page can't change out from under the tour. */}
          <div className="absolute inset-0" />

          {anchored ? (
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-xl ring-2 ring-indigo-400 transition-all duration-200"
              style={{
                top: rect.top - 5,
                left: rect.left - 5,
                width: rect.width + 10,
                height: rect.height + 10,
                boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.55)",
              }}
            />
          ) : (
            <div aria-hidden className="absolute inset-0 bg-slate-950/55" />
          )}

          <div
            className={
              anchored
                ? "absolute rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                : "absolute left-1/2 top-1/3 w-80 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            }
            style={anchored ? { top: rect.bottom + 14, left: cardLeft, width: CARD_W } : undefined}
          >
            {anchored && (
              <div
                aria-hidden
                className="absolute -top-1.5 size-3 rotate-45 border-l border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                style={{ left: arrowLeft }}
              />
            )}

            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold">{step.title}</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close the tour"
                className="-m-1 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{step.body}</p>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-1" aria-label={`Step ${idx + 1} of ${steps.length}`}>
                {steps.map((_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className={
                      i === idx
                        ? "size-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400"
                        : "size-1.5 rounded-full bg-slate-300 dark:bg-slate-700"
                    }
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => setIdx(idx - 1)}
                    className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (last ? close() : setIdx(idx + 1))}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  {last ? "Done" : idx === 0 ? "Show me" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
