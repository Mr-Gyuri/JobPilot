"use server";

import { revalidatePath } from "next/cache";
import {
  PLAIN_KEYS,
  SECRET_KEYS,
  getKeyStatus,
  rejectionReasonFor,
  setConfigValue,
  type KeyStatus,
  type SettingKey,
} from "@/lib/config";
import type { ActionResult } from "@/lib/types";

const ALL_KEYS: SettingKey[] = [...SECRET_KEYS, ...PLAIN_KEYS];

export async function getSettingsAction(): Promise<KeyStatus[]> {
  return ALL_KEYS.map((key) => getKeyStatus(key));
}

export async function saveSettingAction(
  key: SettingKey,
  value: string
): Promise<ActionResult<KeyStatus>> {
  if (!ALL_KEYS.includes(key)) {
    return { ok: false, message: "Unknown setting." };
  }
  const rejection = rejectionReasonFor(key, value);
  if (rejection) return { ok: false, message: rejection };
  try {
    setConfigValue(key, value);
    revalidatePath("/settings");
    revalidatePath("/search");
    return {
      ok: true,
      data: getKeyStatus(key),
      message: value.trim() === "" ? "Cleared — falling back to .env value if set." : "Saved.",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to save setting." };
  }
}
