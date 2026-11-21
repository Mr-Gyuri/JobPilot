"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquareQuote } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { generatePrepAction } from "@/actions/interview";
import type { InterviewPrepRecord } from "@/lib/types";

const CATEGORY_TONES = {
  technical: "indigo",
  behavioral: "sky",
  role_specific: "green",
  gap_probing: "amber",
} as const;

const CATEGORY_LABELS = {
  technical: "Technical",
  behavioral: "Behavioral",
  role_specific: "Role specific",
  gap_probing: "Gap probing",
} as const;

export function InterviewTab({
  jobId,
  resumes,
  defaultResumeId,
  prep,
  aiAvailable,
}: {
  jobId: number;
  resumes: { id: number; title: string; isMaster: boolean }[];
  defaultResumeId: number | null;
  prep: InterviewPrepRecord | null;
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [resumeId, setResumeId] = useState<number | null>(prep?.resumeId ?? defaultResumeId);
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (resumeId == null) return;
    startTransition(async () => {
      const result = await generatePrepAction(jobId, resumeId);
      if (result.ok) {
        toast.success(result.message ?? "Interview prep ready.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  if (resumes.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareQuote}
        title="No resume available"
        body="Interview prep grounds every answer outline in your real experience, so upload a resume first."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Ground answers in" className="min-w-56">
          <Select value={resumeId ?? ""} onChange={(e) => setResumeId(Number(e.target.value))}>
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
                {r.isMaster ? " (master)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={run} loading={pending} disabled={resumeId == null}>
          <MessageSquareQuote className="size-4" />{" "}
          {prep ? "Regenerate questions" : "Generate likely questions"}
        </Button>
        {!aiAvailable && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Template-based without an AI key.
          </span>
        )}
      </div>

      {!prep ? (
        <EmptyState
          icon={MessageSquareQuote}
          title="No interview prep yet"
          body="Generate likely questions for this role, each with an answer outline built from your own resume."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge tone={prep.method === "ai" ? "sky" : "neutral"}>
              {prep.method === "ai" ? `AI · ${prep.model ?? "model"}` : "Templates"}
            </Badge>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {prep.content.questions.length} questions ·{" "}
              {new Date(prep.createdAt).toLocaleString()}
            </span>
          </div>

          {prep.content.questions.map((question, index) => (
            <details
              key={index}
              className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
              open={index < 3}
            >
              <summary className="cursor-pointer text-sm font-medium">
                <span className="mr-2 inline-flex">
                  <Badge tone={CATEGORY_TONES[question.category]}>
                    {CATEGORY_LABELS[question.category]}
                  </Badge>
                </span>
                {question.question}
              </summary>
              <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <p className="text-xs italic text-slate-500 dark:text-slate-400">
                  {question.whyLikely}
                </p>
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-700 dark:text-slate-300">
                  {question.answerOutline.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
