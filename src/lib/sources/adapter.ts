import type { SettingKey } from "@/lib/config";
import type { ApiSourceId, NormalizedJob, SearchParams } from "@/lib/types";

/**
 * One adapter per external job API.
 *
 * `keySets` lists the credential combinations that enable the source: a set is
 * satisfied when every key in it is present, and the source is enabled when
 * ANY set is satisfied. Most sources have a single set; JSearch has two because
 * it can be bought through RapidAPI or direct from its publisher, and the two
 * use different credentials.
 *
 * `keys` is pre-resolved by the registry and contains only the keys that were
 * actually found, so an adapter can tell which credential it was given.
 */
export interface SourceAdapter {
  id: ApiSourceId;
  label: string;
  keySets: SettingKey[][];
  search(params: SearchParams, keys: Record<string, string>): Promise<NormalizedJob[]>;
}

/** The first fully-present key set, or null when the source is unconfigured. */
export function resolveKeySet(
  adapter: SourceAdapter,
  lookup: (key: SettingKey) => string | undefined
): Record<string, string> | null {
  for (const set of adapter.keySets) {
    const resolved: Record<string, string> = {};
    let complete = true;
    for (const key of set) {
      const value = lookup(key);
      if (!value) {
        complete = false;
        break;
      }
      resolved[key] = value;
    }
    if (complete) return resolved;
  }
  return null;
}

/**
 * Keys to surface as "missing" in the UI: the set that is closest to complete,
 * so a half-filled Adzuna pair reports only the field still needed rather than
 * both.
 */
export function missingKeysFor(
  adapter: SourceAdapter,
  lookup: (key: SettingKey) => string | undefined
): SettingKey[] {
  let best: SettingKey[] | null = null;
  for (const set of adapter.keySets) {
    const missing = set.filter((key) => !lookup(key));
    if (best === null || missing.length < best.length) best = missing;
  }
  return best ?? [];
}

/**
 * Default per-request ceiling. Generous enough for a normal API, but JSearch
 * aggregates Google for Jobs live and its published average latency is ~8.7s,
 * so it passes a longer one explicitly — at 10s a slower-than-average call
 * times out after the credit has already been spent.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Thrown when a host answers with a bot-protection challenge rather than its
 * API. Solving one would mean defeating the protection, which this app does not
 * do, so the registry surfaces it as its own kind of failure — the source is
 * unreachable from this network, not misconfigured.
 */
export class BotProtectionError extends Error {
  constructor(host: string) {
    super(
      `${host} answered with a bot-protection challenge instead of API data. ` +
        `The site is blocking automated requests from this network, so this source ` +
        `cannot be queried from the app. Use its search link in the browser instead.`
    );
    this.name = "BotProtectionError";
  }
}

/**
 * Pull the human-readable message out of an error body. Every provider picks a
 * different field, and the text is the whole diagnostic value of a failed call
 * ("Invalid API key" vs "not subscribed" vs "quota exceeded" are three very
 * different fixes), so it is worth digging for.
 */
function errorMessageFrom(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      // Careerjet uses `error`, JSearch/OpenWeb Ninja `message`, Adzuna `display`.
      for (const field of ["error", "message", "display", "detail", "exception"]) {
        const value = o[field];
        if (typeof value === "string" && value.trim()) return value.trim();
        if (value && typeof value === "object") {
          const nested = (value as Record<string, unknown>).message;
          if (typeof nested === "string" && nested.trim()) return nested.trim();
        }
      }
    }
  } catch {
    // Not JSON. An HTML body is almost always an error page rather than the API.
    if (/^\s*</.test(trimmed)) return null;
    return trimmed.slice(0, 200);
  }
  return null;
}

/** Cloudflare and friends answer with an interstitial HTML page, not JSON. */
function isChallenge(res: Response, body: string): boolean {
  if (res.headers.get("cf-mitigated") === "challenge") return true;
  return (
    (res.status === 403 || res.status === 503) &&
    /just a moment|attention required|checking your browser|cf-browser-verification|challenge-platform/i.test(
      body.slice(0, 1500)
    )
  );
}

/**
 * Shared fetch wrapper for all adapters: 10s hard timeout, readable errors
 * that name the host so registry error strings are useful as-is.
 */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const host = new URL(url).hostname;
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error(`Request to ${host} timed out after ${timeoutMs / 1000}s`);
    }
    throw new Error(`Network error reaching ${host}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (isChallenge(res, body)) throw new BotProtectionError(host);
    const detail = errorMessageFrom(body);
    const status = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
    throw new Error(detail ? `${host}: ${detail} (${status})` : `${host} responded with ${status}`);
  }

  // A 200 can still carry a challenge page on some edge configurations.
  const text = await res.text();
  if (isChallenge(res, text)) throw new BotProtectionError(host);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${host} returned a non-JSON response`);
  }
}

/** Flatten an HTML fragment to plain text — several APIs ship snippets as HTML. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&hellip;/gi, "…")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Case-insensitive "looks remote" check shared by adapters without a remote flag. */
export function mentionsRemote(...texts: (string | undefined | null)[]): boolean {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  return /\bremote\b|work[ -]from[ -]home\b|\bwfh\b/.test(haystack);
}

/** Trim a full job description down to a display snippet. */
export function toSnippet(text: string | undefined | null, max = 500): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
