import { getDb } from "@/lib/db";
import type { ActivityEntry } from "@/lib/types";

export function logActivity(
  profileId: number,
  kind: string,
  message: string,
  refId?: number
): void {
  getDb()
    .prepare("INSERT INTO activity_log (profile_id, kind, ref_id, message) VALUES (?, ?, ?, ?)")
    .run(profileId, kind, refId ?? null, message);
}

export function recentActivity(profileId: number, limit = 15): ActivityEntry[] {
  const rows = getDb()
    .prepare("SELECT * FROM activity_log WHERE profile_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(profileId, limit) as {
    id: number;
    profile_id: number;
    kind: string;
    ref_id: number | null;
    message: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    kind: r.kind,
    refId: r.ref_id,
    message: r.message,
    createdAt: r.created_at,
  }));
}
