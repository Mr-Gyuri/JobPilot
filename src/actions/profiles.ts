"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { PROFILE_COOKIE } from "@/lib/active-profile";
import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  updateProfile,
  type ProfileInput,
} from "@/lib/repos/profiles";
import type { ActionResult, Profile } from "@/lib/types";

export async function saveProfileAction(
  id: number | null,
  input: ProfileInput
): Promise<ActionResult<Profile>> {
  try {
    if (!input.name?.trim()) {
      return { ok: false, message: "Profile name is required." };
    }
    const clean = { ...input, name: input.name.trim() };
    const profile = id == null ? createProfile(clean) : updateProfile(id, clean);
    if (!profile) return { ok: false, message: "Profile not found." };
    if (id == null) {
      // Creating the first profile also makes it active.
      const store = await cookies();
      if (!store.get(PROFILE_COOKIE)) {
        store.set(PROFILE_COOKIE, String(profile.id), profileCookieOptions());
      }
    }
    revalidatePath("/", "layout");
    return { ok: true, data: profile, message: id == null ? "Profile created." : "Profile saved." };
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint/.test(err.message)) {
      return { ok: false, message: "A profile with that name already exists." };
    }
    return { ok: false, message: err instanceof Error ? err.message : "Failed to save profile." };
  }
}

export async function switchProfileAction(id: number): Promise<ActionResult> {
  const profile = getProfile(id);
  if (!profile) return { ok: false, message: "Profile not found." };
  const store = await cookies();
  store.set(PROFILE_COOKIE, String(id), profileCookieOptions());
  revalidatePath("/", "layout");
  return { ok: true, message: `Switched to ${profile.name}.` };
}

export async function deleteProfileAction(id: number): Promise<ActionResult> {
  const remaining = listProfiles().filter((p) => p.id !== id);
  deleteProfile(id);
  const store = await cookies();
  const active = store.get(PROFILE_COOKIE)?.value;
  if (active === String(id)) {
    if (remaining.length > 0) {
      store.set(PROFILE_COOKIE, String(remaining[0].id), profileCookieOptions());
    } else {
      store.delete(PROFILE_COOKIE);
    }
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile deleted." };
}

function profileCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}
