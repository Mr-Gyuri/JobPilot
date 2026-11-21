import { Search } from "lucide-react";
import { requireProfileId } from "@/lib/require-profile";
import { getConfigValue } from "@/lib/config";
import { getSourceStatuses } from "@/lib/sources/registry";
import { getProfile } from "@/lib/repos/profiles";
import { SearchClient } from "@/components/search/SearchClient";

export const metadata = { title: "Job Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const profileId = await requireProfileId();
  const profile = getProfile(profileId);
  const defaultLocation = getConfigValue("DEFAULT_LOCATION") ?? "Philippines";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Search className="size-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Job Search</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            API sources return results here and can be ingested in one click. Sites without a usable
            API get pre-filled search links instead.
          </p>
        </div>
      </div>

      <SearchClient
        sources={getSourceStatuses()}
        defaultKeywords={profile?.targetTitles[0] ?? ""}
        defaultLocation={profile?.preferredLocations[0] ?? defaultLocation}
        profileId={profileId}
        // The profile form asks for these; before this they were stored and
        // never read, so answering it changed nothing.
        workSetup={profile?.workSetup ?? "any"}
        expectedSalaryMin={profile?.salaryMin ?? null}
        salaryCurrency={profile?.salaryCurrency ?? "PHP"}
      />
    </div>
  );
}
