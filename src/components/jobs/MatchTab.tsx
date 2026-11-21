"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Gauge, Lightbulb, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Select } from "@/components/ui/Field";
import { ScoreGauge } from "@/components/ui/ScoreGauge";
import { EmptyState } from "@/components/ui/EmptyState";
import { runMatchAction } from "@/actions/match";
import type { MatchAnalysisRecord } from "@/lib/types";

export function MatchTab({
  jobId,
  resumes,
  defaultResumeId,
  match,
  aiAvailable,
}: {
  jobId: number;
  resumes: { id: number; title: string; isMaster: boolean }[];
  defaultResumeId: number | null;
  match: MatchAnalysisRecord | null;
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [resumeId, setResumeId] = useState<number | null>(match?.resumeId ?? defaultResumeId);
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (resumeId == null) return;
    startTransition(async () => {
      const result = await runMatchAction(jobId, resumeId);
      if (result.ok) {
        toast.success(result.message ?? "Analysis complete.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`Copied "${text}"`);
  };

  if (resumes.length === 0) {
    return (
      <EmptyState
        icon={Gauge}
        title="No resume to compare against"
        body="Upload a resume in the Resume Manager first, then come back to see how it stacks up against this job."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Compare against" className="min-w-56">
          <Select
            value={resumeId ?? ""}
            onChange={(e) => setResumeId(Number(e.target.value))}
          >
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
                {r.isMaster ? " (master)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={run} loading={pending} disabled={resumeId == null}>
          <Gauge className="size-4" /> {match ? "Re-run analysis" : "Run match analysis"}
        </Button>
        {!aiAvailable && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Using keyword analysis — add an Anthropic or Gemini key in Settings for a deeper read.
          </span>
        )}
      </div>

      {!match ? (
        <EmptyState
          icon={Gauge}
          title="No analysis yet"
          body="Run the analysis to see your match score, which keywords you already hit, and what's missing."
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-6 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <ScoreGauge score={match.score} />
            <div className="min-w-56 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={match.method === "ai" ? "sky" : "neutral"}>
                  {match.method === "ai" ? `AI analysis · ${match.model ?? "model"}` : "Keyword analysis"}
                </Badge>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(match.createdAt).toLocaleString()}
                </span>
              </div>
              {match.summary && <p className="text-sm">{match.summary}</p>}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {match.matchedKeywords.length} matched · {match.missingKeywords.length} missing
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <Check className="size-4 text-emerald-600" /> Matched keywords
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {match.matchedKeywords.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">None found.</p>
                ) : (
                  match.matchedKeywords.map((kw) => (
                    <Badge key={kw} tone="green">
                      {kw}
                    </Badge>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <TriangleAlert className="size-4 text-rose-600" /> Missing keywords
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  (click to copy)
                </span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {match.missingKeywords.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nothing missing — strong overlap.
                  </p>
                ) : (
                  match.missingKeywords.map((kw) => (
                    <button key={kw} type="button" onClick={() => copy(kw)}>
                      <Badge tone="red" className="cursor-pointer hover:opacity-80">
                        {kw} <Copy className="size-2.5" />
                      </Badge>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {match.strengths.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold">Strengths</h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-700 dark:text-slate-300">
                {match.strengths.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {match.gaps.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold">Gaps</h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-700 dark:text-slate-300">
                {match.gaps.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {match.suggestions.length > 0 && (
            <section className="space-y-1.5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <Lightbulb className="size-4 text-indigo-600 dark:text-indigo-400" /> How to close
                the gaps
              </h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-700 dark:text-slate-300">
                {match.suggestions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
