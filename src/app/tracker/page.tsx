import { ClipboardList } from "lucide-react";
import { requireProfileId } from "@/lib/require-profile";
import { listApplications } from "@/lib/repos/applications";
import { getJob } from "@/lib/repos/jobs";
import { listDocumentsForJob } from "@/lib/repos/documents";
import { KanbanBoard, type BoardCard } from "@/components/tracker/KanbanBoard";

export const metadata = { title: "Application Tracker" };
export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const profileId = await requireProfileId();
  const applications = listApplications(profileId);

  const cards: BoardCard[] = applications.flatMap((app) => {
    const job = getJob(app.jobId);
    if (!job) return [];
    const docs = listDocumentsForJob(app.jobId);
    return [
      {
        application: app,
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          sourceUrl: job.sourceUrl,
          source: job.source,
        },
        documents: docs.map((d) => ({
          id: d.id,
          docType: d.docType,
          template: d.template,
          version: d.version,
        })),
      },
    ];
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardList className="size-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Application Tracker</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Drag cards between columns. Moving a card to Applied stamps the date automatically.
          </p>
        </div>
      </div>

      <KanbanBoard cards={cards} />
    </div>
  );
}
