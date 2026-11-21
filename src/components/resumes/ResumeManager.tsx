"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Crown,
  Download,
  FileText,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { DownloadLink } from "@/components/ui/DownloadLink";
import { ResumeEditor } from "@/components/resumes/ResumeEditor";
import {
  deleteResumeAction,
  reparseResumeAction,
  saveResumeAction,
  setMasterResumeAction,
  uploadResumeAction,
} from "@/actions/resumes";
import type { ParsedResume } from "@/lib/parsing/schema";
import type { ResumeRecord } from "@/lib/types";

interface ResumeContent {
  resume: ParsedResume;
  warnings: string[];
}

export function ResumeManager({
  resumes,
  contents,
  aiAvailable,
}: {
  resumes: ResumeRecord[];
  contents: Record<number, ResumeContent>;
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(
    resumes.find((r) => r.isMaster)?.id ?? resumes[0]?.id ?? null
  );
  const [draft, setDraft] = useState<ParsedResume | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, startUpload] = useTransition();
  const [saving, startSave] = useTransition();
  const [acting, startAction] = useTransition();

  const selected = resumes.find((r) => r.id === selectedId) ?? null;
  const selectedContent = selectedId != null ? contents[selectedId] : undefined;
  const editing = draft ?? selectedContent?.resume ?? null;

  const beginEdit = (id: number) => {
    setSelectedId(id);
    setDraft(null);
    setDraftTitle(resumes.find((r) => r.id === id)?.title ?? "");
  };

  const upload = (file: File) => {
    const form = new FormData();
    form.append("file", file);
    startUpload(async () => {
      const result = await uploadResumeAction(form);
      if (result.ok) {
        toast.success(result.message ?? "Resume uploaded.");
        for (const warning of result.data.warnings) toast.warning(warning);
        setSelectedId(result.data.resumeId);
        setDraft(null);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const save = (mode: "overwrite" | "new_version") => {
    if (selectedId == null || !editing) return;
    startSave(async () => {
      const result = await saveResumeAction(
        selectedId,
        editing,
        draftTitle || selected?.title || "Resume",
        mode
      );
      if (result.ok) {
        toast.success(result.message ?? "Saved.");
        setDraft(null);
        if (mode === "new_version") setSelectedId(result.data.resumeId);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const runAction = (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    startAction(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(result.message ?? "Done.");
        router.refresh();
      } else {
        toast.error(result.message ?? "Something went wrong.");
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Upload a resume" description="PDF or DOCX, up to 15 MB." />
          <CardBody>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) upload(file);
              }}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
                dragging
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                  : "border-slate-300 dark:border-slate-700"
              }`}
            >
              <Upload className="mb-2 size-5 text-slate-400" aria-hidden />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Drop a file here, or
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                loading={uploading}
                onClick={() => fileInput.current?.click()}
              >
                Choose file
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                  e.target.value = "";
                }}
              />
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
                {aiAvailable
                  ? "Parsed with AI, then shown here for review."
                  : "Parsed with built-in heuristics (no AI key) — review carefully."}
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Versions" description={`${resumes.length} saved`} />
          <CardBody className="space-y-2">
            {resumes.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nothing uploaded yet.
              </p>
            ) : (
              resumes.map((resume) => (
                <div
                  key={resume.id}
                  className={`rounded-lg border p-2.5 transition-colors ${
                    resume.id === selectedId
                      ? "border-indigo-400 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-500/10"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => beginEdit(resume.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium">{resume.title}</span>
                      {resume.isMaster && (
                        <Badge tone="indigo">
                          <Crown className="size-3" /> Master
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span>{new Date(resume.createdAt).toLocaleDateString()}</span>
                      {resume.parseMethod && (
                        <Badge tone={resume.parseMethod === "ai" ? "sky" : "neutral"}>
                          {resume.parseMethod === "ai"
                            ? "AI parsed"
                            : resume.parseMethod === "manual"
                              ? "hand-edited"
                              : "heuristic"}
                        </Badge>
                      )}
                    </div>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {!resume.isMaster && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={acting}
                        onClick={() => runAction(() => setMasterResumeAction(resume.id))}
                      >
                        <Crown className="size-3.5" /> Set master
                      </Button>
                    )}
                    {resume.storedPath && (
                      <DownloadLink href={`/api/resumes/${resume.id}/file`} variant="ghost">
                        <Download className="size-3.5" /> Original
                      </DownloadLink>
                    )}
                    {resume.rawText && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={acting}
                        onClick={() => runAction(() => reparseResumeAction(resume.id))}
                      >
                        <RefreshCw className="size-3.5" /> Re-parse
                      </Button>
                    )}
                    {!resume.isMaster && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={acting}
                        onClick={() => {
                          if (window.confirm(`Delete "${resume.title}"?`)) {
                            runAction(() => deleteResumeAction(resume.id));
                          }
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div>
        {selected && editing ? (
          <Card>
            <CardHeader
              title="Review and correct"
              description="Parsing is never perfect. Fix anything wrong here — this is the content tailoring starts from."
              actions={
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={saving}
                    onClick={() => save("new_version")}
                  >
                    Save as new version
                  </Button>
                  <Button size="sm" loading={saving} onClick={() => save("overwrite")}>
                    Save
                  </Button>
                </>
              }
            />
            <CardBody className="space-y-4">
              {(selectedContent?.warnings.length ?? 0) > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="size-4" /> Parser notes
                  </div>
                  <ul className="list-inside list-disc space-y-0.5">
                    {selectedContent!.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              <Field label="Version name">
                <Input
                  value={draftTitle || selected.title}
                  onChange={(e) => setDraftTitle(e.target.value)}
                />
              </Field>

              <ResumeEditor resume={editing} onChange={setDraft} />

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <Button variant="secondary" loading={saving} onClick={() => save("new_version")}>
                  Save as new version
                </Button>
                <Button loading={saving} onClick={() => save("overwrite")}>
                  <Sparkles className="size-4" /> Save changes
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : (
          <EmptyState
            icon={FileText}
            title="No resume selected"
            body="Upload a PDF or DOCX resume to get started. JobPilot extracts the sections, then you correct anything it got wrong."
          />
        )}
      </div>
    </div>
  );
}
