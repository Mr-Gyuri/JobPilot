"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, Building2, ClipboardPlus, ExternalLink, MapPin, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { JobDetailsTab } from "@/components/jobs/JobDetailsTab";
import { MatchTab } from "@/components/jobs/MatchTab";
import { DocumentsTab } from "@/components/jobs/DocumentsTab";
import { InterviewTab } from "@/components/jobs/InterviewTab";
import { addToTrackerAction } from "@/actions/tracker";
import { deleteJobAction } from "@/actions/jobs";
import { STATUS_LABELS } from "@/lib/types";
import type {
  ApplicationRecord,
  GeneratedDocRecord,
  InterviewPrepRecord,
  JobRecord,
  MatchAnalysisRecord,
  TemplateId,
} from "@/lib/types";

const METHOD_LABELS: Record<string, string> = {
  jsonld: "JSON-LD",
  ai: "AI extracted",
  heuristic: "Heuristic",
  api: "Search API",
  manual: "Manual",
};

function formatSalary(job: JobRecord): string | null {
  // The board's own wording carries the currency; JSearch v5 sends numbers
  // without one, so composing from parts can yield a bare "133,000 – 185,000".
  if (job.salaryText) return job.salaryText;
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const currency = job.salaryCurrency ?? "";
  const min = job.salaryMin?.toLocaleString();
  const max = job.salaryMax?.toLocaleString();
  const range = min && max ? `${min} – ${max}` : (min ?? max ?? "");
  return `${currency} ${range}${job.salaryPeriod ? ` / ${job.salaryPeriod}` : ""}`.trim();
}

export function JobDetailClient({
  job,
  resumes,
  defaultResumeId,
  match,
  documents,
  prep,
  application,
  defaultTemplate,
  aiAvailable,
}: {
  job: JobRecord;
  resumes: { id: number; title: string; isMaster: boolean }[];
  defaultResumeId: number | null;
  match: MatchAnalysisRecord | null;
  documents: GeneratedDocRecord[];
  prep: InterviewPrepRecord | null;
  application: ApplicationRecord | null;
  defaultTemplate: TemplateId;
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const salary = formatSalary(job);

  const addToTracker = () => {
    startTransition(async () => {
      const result = await addToTrackerAction(job.id);
      if (result.ok) {
        toast.success(result.message ?? "Added.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const remove = () => {
    if (!window.confirm(`Delete "${job.title}" and everything generated for it?`)) return;
    startTransition(async () => {
      const result = await deleteJobAction(job.id);
      if (result.ok) {
        toast.success(result.message ?? "Deleted.");
        router.push("/tracker");
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">{job.title}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                {job.company && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="size-3.5" aria-hidden /> {job.company}
                  </span>
                )}
                {job.location && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5" aria-hidden /> {job.location}
                  </span>
                )}
                {salary && (
                  <span className="flex items-center gap-1.5">
                    <Banknote className="size-3.5" aria-hidden /> {salary}
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {job.sourceUrl && (
                <ButtonLink href={job.sourceUrl} external size="sm" variant="secondary">
                  <ExternalLink className="size-3.5" /> Open posting
                </ButtonLink>
              )}
              {application ? (
                <ButtonLink href="/tracker" size="sm" variant="secondary">
                  On tracker · {STATUS_LABELS[application.status]}
                </ButtonLink>
              ) : (
                <Button size="sm" onClick={addToTracker} loading={pending}>
                  <ClipboardPlus className="size-3.5" /> Add to tracker
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={remove} aria-label="Delete job">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {job.workMode && <Badge tone="sky">{job.workMode}</Badge>}
            {job.employmentType && <Badge tone="neutral">{job.employmentType}</Badge>}
            <Badge tone="neutral">
              {METHOD_LABELS[job.extractionMethod] ?? job.extractionMethod}
            </Badge>
            <Badge tone="neutral">via {job.source}</Badge>
            {match && (
              <Badge tone={match.score >= 70 ? "green" : match.score >= 40 ? "amber" : "red"}>
                {match.score}% match
              </Badge>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <Tabs
            rememberAs={`job-${job.id}`}
            initial={match ? "match" : "details"}
            tabs={[
              { id: "details", label: "Details", content: <JobDetailsTab job={job} /> },
              {
                id: "match",
                label: match ? `Match · ${match.score}%` : "Match",
                content: (
                  <MatchTab
                    jobId={job.id}
                    resumes={resumes}
                    defaultResumeId={defaultResumeId}
                    match={match}
                    aiAvailable={aiAvailable}
                  />
                ),
              },
              {
                id: "documents",
                label: documents.length > 0 ? `Documents · ${documents.length}` : "Documents",
                content: (
                  <DocumentsTab
                    jobId={job.id}
                    resumes={resumes}
                    defaultResumeId={defaultResumeId}
                    documents={documents}
                    defaultTemplate={defaultTemplate}
                    aiAvailable={aiAvailable}
                  />
                ),
              },
              {
                id: "interview",
                label: "Interview prep",
                content: (
                  <InterviewTab
                    jobId={job.id}
                    resumes={resumes}
                    defaultResumeId={defaultResumeId}
                    prep={prep}
                    aiAvailable={aiAvailable}
                  />
                ),
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
