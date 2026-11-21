import { Users } from "lucide-react";
import { listProfiles } from "@/lib/repos/profiles";
import { getActiveProfileId } from "@/lib/active-profile";
import { ProfilesClient } from "@/components/profiles/ProfilesClient";

export const metadata = { title: "Profiles" };
export const dynamic = "force-dynamic";

export default async function ProfilesPage(props: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { onboarding } = await props.searchParams;
  const profiles = listProfiles();
  const activeId = await getActiveProfileId();
  const isOnboarding = onboarding === "1" || profiles.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="size-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Profiles</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isOnboarding
              ? "Welcome to JobPilot. Create a profile for each person using this app — everything else is scoped to whoever is active."
              : "Every resume, job and tracker card belongs to a profile. Switch profiles from the header."}
          </p>
        </div>
      </div>

      <ProfilesClient profiles={profiles} activeId={activeId} onboarding={isOnboarding} />
    </div>
  );
}
