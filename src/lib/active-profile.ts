import { cookies } from "next/headers";
import { getDb } from "@/lib/db";

export const PROFILE_COOKIE = "jp_profile";

/**
 * Resolve the active profile id from the jp_profile cookie, validating it
 * against the DB. Falls back to the lowest profile id; returns null when no
 * profiles exist yet (first run -> onboarding).
 */
export async function getActiveProfileId(): Promise<number | null> {
  const db = getDb();
  const store = await cookies();
  const raw = store.get(PROFILE_COOKIE)?.value;
  if (raw) {
    const id = Number(raw);
    if (Number.isInteger(id)) {
      const exists = db.prepare("SELECT id FROM profiles WHERE id = ?").get(id);
      if (exists) return id;
    }
  }
  const first = db.prepare("SELECT id FROM profiles ORDER BY id LIMIT 1").get() as
    | { id: number }
    | undefined;
  return first?.id ?? null;
}
