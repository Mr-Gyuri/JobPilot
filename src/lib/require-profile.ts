import { redirect } from "next/navigation";
import { getActiveProfileId } from "@/lib/active-profile";

/**
 * Pages that need a profile call this at the top; first run (no profiles yet)
 * redirects to the onboarding flow.
 */
export async function requireProfileId(): Promise<number> {
  const id = await getActiveProfileId();
  if (id == null) redirect("/profiles?onboarding=1");
  return id;
}
