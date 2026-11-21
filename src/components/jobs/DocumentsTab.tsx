"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Download, Eye, FileStack, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { Modal } from "@/components/ui/Modal";
import { generateDocumentsAction, rerenderDocumentAction } from "@/actions/docs";
import type { GeneratedDocRecord, TemplateId } from "@/lib/types";

// Default first. Every one of these is ATS-safe, but `centered` keeps role,
// employer and dates on separate lines, so a text extractor never has to guess
// where one field ends - which is why it leads.
const TEMPLATES: { id: TemplateId; label: string; blurb: string }[] = [
  {
    id: "centered",
    label: "Centered",
    blurb: "Canva-style layout, read most reliably by job sites. Recommended.",
  },
  { id: "modern", label: "Modern", blurb: "Clean sans-serif with a navy accent." },
  { id: "classic", label: "Classic", blurb: "Traditional serif, centred header. Reads formal." },
  { id: "compact", label: "Compact", blurb: "Tight spacing to fit a long history on one page." },
];

export function DocumentsTab({
  jobId,
  resumes,
  defaultResumeId,
  documents,
  defaultTemplate,
  aiAvailable,
}: {
  jobId: number;
  resumes: { id: number; title: string; isMaster: boolean }[];
  defaultResumeId: number | null;
  documents: GeneratedDocRecord[];
  defaultTemplate: TemplateId;
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const [resumeId, setResumeId] = useState<number | null>(defaultResumeId);
  const [template, setTemplate] = useState<TemplateId>(defaultTemplate);
  const [includeCover, setIncludeCover] = useState(true);
  const [lastRun, setLastRun] = useState<{ changes: string[]; warnings: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const [rerendering, startRerender] = useTransition();
  // Which document the preview pane is showing. Transient by design: a reopened
  // tab should not reopen a modal over the page.
  const [previewing, setPreviewing] = useState<GeneratedDocRecord | null>(null);

  const generate = () => {
    if (resumeId == null) return;
    startTransition(async () => {
      const result = await generateDocumentsAction(jobId, resumeId, template, includeCover);
      if (result.ok) {
        toast.success(result.message ?? "Generated.");
        setLastRun({ changes: result.data.changes, warnings: result.data.warnings });
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  if (resumes.length === 0) {
    return (
      <EmptyState
        icon={FileStack}
        title="No resume to tailor"
        body="Upload a resume in the Resume Manager first — tailoring reorders and rewords your real content, so it needs a master resume to work from."
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <h3 className="text-sm font-semibold">Generate a tailored resume</h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start from">
            <Select value={resumeId ?? ""} onChange={(e) => setResumeId(Number(e.target.value))}>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                  {r.isMaster ? " (master)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Template">
            <Select
              value={template}
              onChange={(e) => setTemplate(e.target.value as TemplateId)}
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — {t.blurb}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeCover}
            onChange={(e) => setIncludeCover(e.target.checked)}
            className="size-4 rounded border-slate-300 accent-indigo-600"
          />
          Also generate a matching cover letter
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={generate} loading={pending} disabled={resumeId == null}>
            <Sparkles className="size-4" /> Generate documents
          </Button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {aiAvailable
              ? "AI rewrites the summary and mirrors the posting's wording — never inventing facts."
              : "No AI key: your content is reordered and trimmed for relevance, never rewritten."}
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Every generated resume is checked against your master: employers, titles, dates,
          certifications and skills that are not already there are rejected.
        </p>
      </section>

      {lastRun && (lastRun.changes.length > 0 || lastRun.warnings.length > 0) && (
        <section className="space-y-3">
          {lastRun.changes.length > 0 && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-500/40 dark:bg-emerald-500/10">
              <p className="mb-1 font-medium text-emerald-900 dark:text-emerald-200">
                What changed
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-emerald-900/90 dark:text-emerald-200/90">
                {lastRun.changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </div>
          )}
          {lastRun.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
              <p className="mb-1 flex items-center gap-1.5 font-medium text-amber-900 dark:text-amber-200">
                <AlertTriangle className="size-4" /> Check before sending
              </p>
              <ul className="list-inside list-disc space-y-0.5 text-amber-900/90 dark:text-amber-200/90">
                {lastRun.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Version history</h3>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No documents generated for this job yet.
          </p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2.5 dark:border-slate-800"
              >
                <Badge tone={doc.docType === "resume" ? "indigo" : "sky"}>
                  {doc.docType === "resume" ? "Resume" : "Cover letter"} v{doc.version}
                </Badge>
                {doc.docType === "resume" && <Badge tone="neutral">{doc.template}</Badge>}
                {doc.method && (
                  <Badge tone={doc.method === "ai" ? "sky" : "neutral"}>
                    {doc.method === "ai" ? "AI" : "keyword"}
                  </Badge>
                )}
                {doc.warnings.length > 0 && (
                  <Badge tone="amber">
                    <AlertTriangle className="size-3" /> {doc.warnings.length}
                  </Badge>
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(doc.createdAt).toLocaleString()}
                </span>
                <div className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPreviewing(doc)}
                    title="Read it here before downloading"
                  >
                    <Eye className="size-3.5" /> Preview
                  </Button>
                  <DownloadLink href={`/api/documents/${doc.id}/download`}>
                    <Download className="size-3.5" /> PDF
                  </DownloadLink>
                  {doc.docType === "resume" && (
                    <Select
                      className="h-8 w-auto py-0 text-xs"
                      value=""
                      disabled={rerendering}
                      onChange={(e) => {
                        const next = e.target.value as TemplateId;
                        if (!next) return;
                        startRerender(async () => {
                          const result = await rerenderDocumentAction(doc.id, next);
                          if (result.ok) {
                            toast.success(result.message ?? "Re-rendered.");
                            router.refresh();
                          } else {
                            toast.error(result.message);
                          }
                        });
                      }}
                    >
                      <option value="">Re-render as…</option>
                      {TEMPLATES.filter((t) => t.id !== doc.template).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {documents.some((d) => d.docType === "resume") && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <RefreshCw className="size-3" /> Re-rendering reuses the already-tailored content, so it
            costs no AI call.
          </p>
        )}
      </section>

      <Modal
        open={previewing != null}
        onClose={() => setPreviewing(null)}
        roomy
        title={
          previewing
            ? `${previewing.docType === "resume" ? "Resume" : "Cover letter"} v${previewing.version}${
                previewing.docType === "resume" ? ` · ${previewing.template}` : ""
              }`
            : ""
        }
      >
        {previewing && (
          <div className="space-y-3">
            {/*
              The browser's own PDF viewer, so this is the same rendering an
              employer opening the attachment gets - scrolling, zoom and text
              selection included. Rendering it from the stored file rather than
              re-generating means the preview cannot differ from what downloads.
            */}
            {/* FitH so the page fills the width it has, rather than opening at
                the ~50% that makes 10pt body text unreadable. */}
            <iframe
              key={previewing.id}
              src={`/api/documents/${previewing.id}/download?inline=1#view=FitH`}
              title="Document preview"
              className="h-[78vh] w-full rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
            />
            {previewing.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
                <p className="flex items-center gap-1.5 font-medium text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="size-3.5" /> Check before sending
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900/90 dark:text-amber-200/90">
                  {previewing.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Read it through — the fabrication check catches invented facts, not a sentence that
                reads badly.
              </p>
              <DownloadLink href={`/api/documents/${previewing.id}/download`}>
                <Download className="size-3.5" /> Download PDF
              </DownloadLink>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
