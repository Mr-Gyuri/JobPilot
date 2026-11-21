import { FileText } from "lucide-react";
import { requireProfileId } from "@/lib/require-profile";
import { getStoredResume, listResumes } from "@/lib/repos/resumes";
import { isAIAvailable } from "@/lib/config";
import { ResumeManager } from "@/components/resumes/ResumeManager";
import { emptyParsedResume } from "@/lib/parsing/schema";

export const metadata = { title: "Resume Manager" };
export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const profileId = await requireProfileId();
  const resumes = listResumes(profileId);

  // Ship each version's parsed content so the editor opens instantly.
  const contents = Object.fromEntries(
    resumes.map((r) => {
      const stored = getStoredResume(r.id);
      return [
        r.id,
        {
          resume: stored?.resume ?? emptyParsedResume(),
          warnings: stored?.parseWarnings ?? [],
        },
      ];
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="size-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Resume Manager</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Upload a PDF or DOCX, correct anything the parser got wrong, then mark one version as
            your master resume — that is what tailoring starts from.
          </p>
        </div>
      </div>

      <ResumeManager
        resumes={resumes}
        contents={contents}
        aiAvailable={isAIAvailable()}
      />
    </div>
  );
}
