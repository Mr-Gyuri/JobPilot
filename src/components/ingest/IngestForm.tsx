"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ClipboardPaste, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { ingestTextAction, ingestUrlAction } from "@/actions/ingest";
import { useSessionValue } from "@/lib/use-external-state";

export function IngestForm({
  aiAvailable,
  initialUrl = "",
}: {
  aiAvailable: boolean;
  initialUrl?: string;
}) {
  const router = useRouter();
  // Kept for this sitting: pasting a whole posting back in after a glance at
  // another tab means finding the original again, and the paste path is the
  // only one that works for LinkedIn and Facebook.
  const [url, setUrl] = useSessionValue("jp_ingest_url", initialUrl);
  const [text, setText] = useSessionValue("jp_ingest_text", "");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [pendingUrl, startUrl] = useTransition();
  const [pendingText, startText] = useTransition();

  const fetchUrl = () => {
    setBlocked(null);
    startUrl(async () => {
      const result = await ingestUrlAction(url);
      if (result.ok) {
        toast.success(result.message ?? "Job ingested.");
        // Done with these — leaving them would greet her with a posting she has
        // already imported the next time she opens this tab.
        setUrl("");
        setText("");
        router.push(`/jobs/${result.data.jobId}`);
        return;
      }
      // Blocked or disallowed: keep the URL and surface the paste fallback.
      if ("code" in result && (result.code === "ROBOTS_DISALLOWED" || result.code === "FETCH_BLOCKED")) {
        setBlocked(result.message);
      } else {
        toast.error(result.message);
      }
    });
  };

  const submitText = () => {
    startText(async () => {
      const result = await ingestTextAction(text, url || undefined);
      if (result.ok) {
        toast.success(result.message ?? "Job ingested.");
        setUrl("");
        setText("");
        router.push(`/jobs/${result.data.jobId}`);
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="From a link"
          description="Works well with Greenhouse, Lever, Workable, JobStreet, Kalibrr, Jora and most boards that publish structured data."
        />
        <CardBody className="space-y-3">
          <Field label="Job posting URL">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim()) fetchUrl();
              }}
            />
          </Field>
          <Button onClick={fetchUrl} loading={pendingUrl} disabled={!url.trim()}>
            <Search className="size-4" /> Fetch and extract
          </Button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            JobPilot checks each site&apos;s robots.txt first and never bypasses logins or CAPTCHAs.
          </p>
        </CardBody>
      </Card>

      {blocked && (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Could not fetch that page</p>
            <p className="mt-0.5">{blocked}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader
          title="Or paste the description"
          description="Always works — LinkedIn, Facebook and most large boards block automated fetching by design."
        />
        <CardBody className="space-y-3">
          <Field
            label="Job description text"
            hint={
              aiAvailable
                ? "Structured with AI, then reviewed by you on the next screen."
                : "Structured with built-in heuristics (no AI key) — you can correct everything on the next screen."
            }
          >
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              placeholder="Paste the full job posting — title, company, responsibilities and requirements."
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button onClick={submitText} loading={pendingText} disabled={text.trim().length < 40}>
              <ClipboardPaste className="size-4" /> Extract from text
            </Button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {text.trim().length} characters
            </span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
