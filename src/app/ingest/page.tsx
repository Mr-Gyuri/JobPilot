import { Link2 } from "lucide-react";
import { requireProfileId } from "@/lib/require-profile";
import { isAIAvailable } from "@/lib/config";
import { IngestForm } from "@/components/ingest/IngestForm";

export const metadata = { title: "Ingest a job" };
export const dynamic = "force-dynamic";

export default async function IngestPage() {
  await requireProfileId();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link2 className="size-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ingest a job posting</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Paste a link and JobPilot will fetch and structure it. Many boards block automated
            fetching — when that happens, paste the description text instead.
          </p>
        </div>
      </div>

      <IngestForm aiAvailable={isAIAvailable()} />
    </div>
  );
}
