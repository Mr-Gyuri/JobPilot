"use client";

import { useCallback, useSyncExternalStore } from "react";

// Reading browser-owned state (the <html> dark class, localStorage) belongs in
// useSyncExternalStore rather than an effect: React uses the server snapshot
// during hydration and then syncs, so there is no mismatch and no cascading
// render.

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (typeof window !== "undefined") {
    // Another tab writing the same key should update this one too.
    window.addEventListener("storage", onChange);
  }
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onChange);
    }
  };
}

function emit(): void {
  for (const onChange of listeners) onChange();
}

export const THEME_KEY = "jp_theme";

/** Dark mode lives on the <html> element, set pre-paint by the inline script. */
export function useDarkMode(): [boolean, (next: boolean) => void] {
  const isDark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false
  );

  const setDark = useCallback((next: boolean) => {
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // private mode / storage disabled — the class still applies for this session
    }
    emit();
  }, []);

  return [isDark, setDark];
}

// getSnapshot must return a referentially stable value, so parsed arrays are
// cached against the raw string they came from.
const listCache = new Map<string, { raw: string | null; value: readonly string[] }>();

function readList(key: string, fallback: readonly string[]): readonly string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  const cached = listCache.get(key);
  if (cached && cached.raw === raw) return cached.value;

  let value: readonly string[] = fallback;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
        value = parsed;
      }
    } catch {
      // corrupt entry — fall back
    }
  }
  listCache.set(key, { raw, value });
  return value;
}

// Same referential-stability trick as listCache, for arbitrary JSON.
const jsonCache = new Map<string, { raw: string | null; value: unknown }>();

function readJson<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    return fallback;
  }
  const cached = jsonCache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  let value: T = fallback;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      // corrupt entry — fall back
    }
  }
  jsonCache.set(key, { raw, value });
  return value;
}

/**
 * Work in progress, kept in sessionStorage so it survives moving between tabs.
 *
 * Every page here is a fresh mount — the nav uses <Link>, and the pages are
 * server components — so anything held in useState is gone the moment you look
 * at another tab. For search results that is worse than an inconvenience: the
 * only way back is to run the search again, and each one spends a JSearch
 * credit from a monthly 200.
 *
 * sessionStorage rather than localStorage because this is in-progress work, not
 * a preference: it should outlive a click on "Resumes", not the app itself.
 * Search results go stale (the server-side cache holds them 6 hours at most),
 * and reviving three-day-old postings that look current would mislead.
 */
export function useSessionValue<T>(key: string, fallback: T): [T, (next: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readJson(key, fallback),
    () => fallback
  );

  const setValue = useCallback(
    (next: T) => {
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage disabled or over quota. The write is lost, so navigating away
        // loses this state — exactly the old behaviour, which is a fine floor.
      }
      jsonCache.delete(key);
      emit();
    },
    [key]
  );

  return [value, setValue];
}

/**
 * A string-array preference persisted in localStorage. `fallback` is used on
 * the server, on first visit, and whenever the stored value is unusable.
 */
export function usePersistedList<T extends string>(
  key: string,
  fallback: readonly T[]
): [readonly T[], (next: readonly T[]) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readList(key, fallback) as readonly T[],
    () => fallback
  );

  const setValue = useCallback(
    (next: readonly T[]) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore — the UI still reflects the change for this session
      }
      listCache.delete(key);
      emit();
    },
    [key]
  );

  return [value, setValue];
}
