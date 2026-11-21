import crypto from "node:crypto";
import { getDb } from "@/lib/db";

const TTL_MS = 6 * 60 * 60 * 1000; // 6h — protects tiny free-tier quotas (JSearch ~200 req/month)

export function cacheKey(source: string, params: unknown): string {
  return crypto
    .createHash("sha1")
    .update(`${source}:${JSON.stringify(params)}`)
    .digest("hex");
}

export function getCached<T>(key: string): T | null {
  const row = getDb()
    .prepare("SELECT payload, fetched_at FROM search_cache WHERE cache_key = ?")
    .get(key) as { payload: string; fetched_at: string } | undefined;
  if (!row) return null;
  if (Date.now() - new Date(row.fetched_at).getTime() > TTL_MS) {
    getDb().prepare("DELETE FROM search_cache WHERE cache_key = ?").run(key);
    return null;
  }
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return null;
  }
}

export function setCached(key: string, source: string, payload: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO search_cache (cache_key, source, payload, fetched_at)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
    )
    .run(key, source, JSON.stringify(payload));
}
