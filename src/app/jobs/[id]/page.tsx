import { notFound } from "next/navigation";
import { requireProfileId } from "@/lib/require-profile";
import { getJob } from "@/lib/repos/jobs";
import { listResumes } from "@/lib/repos/resumes";
import { latestMatchForJob } from "@/lib/repos/matches";
import { listDocumentsForJob } from "@/lib/repos/documents";
import { latestPrepForJob } from "@/lib/repos/preps";
import { getApplicationByJob } from "@/lib/repos/applications";
import { getConfigValue, isAIAvailable } from "@/lib/config";
import { JobDetailClient } from "@/components/jobs/JobDetailClient";
import type { TemplateId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const job = getJob(Number(id));
  return { title: job ? `${job.title}${job.company ? ` · ${job.company}` : ""}` : "Job" };
}

export default async function JobDetailPage(props: { params: Promise<{ id: string }> }) {
  const profileId = await requireProfileId();
  const { id } = await props.params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();

  const job = getJob(jobId);
  if (!job || job.profileId !== profileId) notFound();

  const resumes = listResumes(profileId);
  const master = resumes.find((r) => r.isMaster) ?? resumes[0] ?? null;

  return (
    <JobDetailClient
      job={job}
      resumes={resumes.map((r) => ({ id: r.id, title: r.title, isMaster: r.isMaster }))}
      defaultResumeId={master?.id ?? null}
      match={latestMatchForJob(jobId)}
      documents={listDocumentsForJob(jobId)}
      prep={latestPrepForJob(jobId)}
      application={getApplicationByJob(jobId)}
      defaultTemplate={(getConfigValue("DEFAULT_TEMPLATE") as TemplateId) ?? "centered"}
      aiAvailable={isAIAvailable()}
    />
  );
}
