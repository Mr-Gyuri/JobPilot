import { getDb, nowIso } from "@/lib/db";

// Settings precedence: a value saved on the Settings page (SQLite) overrides
// the .env.local default; env fills the gaps. Empty DB value = cleared, fall
// back to env.

export const SECRET_KEYS = [
  "ANTHROPIC_API_KEY",
  // Alternative AI provider. Gemini has a genuinely free tier, which Anthropic
  // does not; the trade-off is documented on the Settings page because Google's
  // terms allow human review of free-tier content.
  "GEMINI_API_KEY",
  // JSearch is sold both through RapidAPI and direct from its publisher
  // (OpenWeb Ninja). Either credential enables the source; the adapter picks
  // the matching host, auth header and response shape.
  "RAPIDAPI_KEY",
  "OPENWEBNINJA_API_KEY",
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "JOOBLE_API_KEY",
  // v4 authenticates with an API key over Basic auth. The old affiliate ID
  // belonged to the legacy endpoint, which is closed to new accounts.
  "CAREERJET_API_KEY",
] as const;

export const PLAIN_KEYS = [
  "AI_MODEL",
  "DEFAULT_LOCATION",
  "ADZUNA_COUNTRY",
  "DEFAULT_TEMPLATE",
  "PAPER_SIZE",
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];
export type PlainKey = (typeof PLAIN_KEYS)[number];
export type SettingKey = SecretKey | PlainKey;

export const DEFAULTS: Record<PlainKey, string> = {
  // Empty on purpose: AI_MODEL is an override, and the real default depends on
  // which provider is active (see lib/ai/provider.ts). Naming a Claude model
  // here would display it as the default even when Gemini is the one in use.
  AI_MODEL: "",
  DEFAULT_LOCATION: "Philippines",
  ADZUNA_COUNTRY: "sg",
  // centered rather than modern: it is the only template that puts the role,
  // employer and dates on separate lines, so a text extractor never has to
  // guess where one field ends and the next begins. See the round-trip
  // assertions in scripts/verify-pipeline.mts.
  DEFAULT_TEMPLATE: "centered",
  PAPER_SIZE: "Letter",
};

export function getConfigValue(key: SettingKey): string | undefined {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  if (row?.value?.trim()) return row.value.trim();
  const env = process.env[key];
  if (env?.trim()) return env.trim();
  if (key in DEFAULTS) return DEFAULTS[key as PlainKey];
  return undefined;
}

/**
 * Reject a pasted credential that plainly is not one, returning the reason.
 *
 * Without this the value saves happily and only surfaces much later as an
 * unexplained auth failure from the provider. Pasting the dashboard URL is the
 * easy mistake — it sits right next to the key on the page you copy from, and a
 * saved URL produces "not subscribed" rather than "that is not a key".
 *
 * Deliberately only rejects what is unambiguous: no provider issues a key that
 * is a URL, contains whitespace, or comes wrapped in quotes. Length and
 * character set are left alone so a provider changing its format can never lock
 * a real key out.
 */
export function rejectionReasonFor(key: SettingKey, value: string): string | null {
  if (!(SECRET_KEYS as readonly string[]).includes(key)) return null;
  const v = value.trim();
  if (v === "") return null; // clearing is legitimate

  if (/^https?:\/\//i.test(v)) {
    return "That looks like a URL, not a key. Open that page and copy the key value itself — on RapidAPI it is the Application Key row under Authorizations.";
  }
  if (/\s/.test(v)) {
    return "That contains a space or line break, so some of the page came along with the key. Copy just the key value.";
  }
  if (/^["'].*["']$/.test(v)) {
    return "Remove the surrounding quotes — paste the key value on its own.";
  }
  if (v.startsWith("<") || v.endsWith(">")) {
    return "That looks like a placeholder rather than a real key.";
  }
  return null;
}

export function setConfigValue(key: SettingKey, value: string): void {
  const db = getDb();
  if (value.trim() === "") {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  } else {
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, value.trim(), nowIso());
  }
}

export interface KeyStatus {
  key: SettingKey;
  isSet: boolean;
  source: "db" | "env" | "default" | null;
  maskedValue: string | null;
}

function mask(value: string): string {
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

/** Status for the Settings UI. Secret values never leave the server unmasked. */
export function getKeyStatus(key: SettingKey): KeyStatus {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  const isSecret = (SECRET_KEYS as readonly string[]).includes(key);
  if (row?.value?.trim()) {
    const v = row.value.trim();
    return { key, isSet: true, source: "db", maskedValue: isSecret ? mask(v) : v };
  }
  const env = process.env[key];
  if (env?.trim()) {
    return { key, isSet: true, source: "env", maskedValue: isSecret ? mask(env.trim()) : env.trim() };
  }
  if (key in DEFAULTS) {
    return { key, isSet: true, source: "default", maskedValue: DEFAULTS[key as PlainKey] };
  }
  return { key, isSet: false, source: null, maskedValue: null };
}

/** True when any AI provider is configured. See lib/ai/provider.ts for which. */
export function isAIAvailable(): boolean {
  return !!getConfigValue("ANTHROPIC_API_KEY") || !!getConfigValue("GEMINI_API_KEY");
}
