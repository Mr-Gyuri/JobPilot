"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Download, ExternalLink, HelpCircle, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/Field";
import { saveSettingAction } from "@/actions/settings";
import type { KeyStatus, SettingKey } from "@/lib/config";

interface KeyMeta {
  key: SettingKey;
  label: string;
  help: string;
  steps: string[];
  url?: string;
  urlLabel?: string;
}

const AI_KEYS: KeyMeta[] = [
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic API key",
    help: "Powers resume parsing, match analysis, resume tailoring, cover letters and interview prep. Better results than Gemini, but the Anthropic API is prepaid — there is no free tier. Used in preference to a Gemini key when both are set.",
    url: "https://platform.claude.com/settings/keys",
    urlLabel: "platform.claude.com → API keys",
    steps: [
      "Sign in and open API keys.",
      "Create key, then copy it (it is shown only once).",
      "Add credits under Plans & Billing — a key alone will not work.",
      "Paste the key below and press Save.",
    ],
  },
  {
    key: "GEMINI_API_KEY",
    label: "Google Gemini API key — free tier",
    help: "The free alternative: same five features, no card required. Read the privacy note below before using it for resumes.",
    url: "https://aistudio.google.com/apikey",
    urlLabel: "aistudio.google.com → API keys",
    steps: [
      "Sign in with a Google account and open Get API key.",
      "Create API key — no billing details are asked for.",
      "Paste it below and press Save.",
      "Rate limits for your key are shown in AI Studio; JobPilot falls back to keyword logic if you hit them.",
    ],
  },
];

const JOB_KEYS: KeyMeta[] = [
  {
    key: "RAPIDAPI_KEY",
    label: "JSearch key — via RapidAPI",
    help: "The highest-value source: it aggregates LinkedIn, Indeed, Glassdoor and Google for Jobs, and each result is badged with the board it came from. Free plan is roughly 200 requests/month, so responses are cached for 6 hours. Fill in either this or the direct key below — not both.",
    url: "https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch",
    urlLabel: "JSearch on RapidAPI",
    steps: [
      "Sign up for RapidAPI (free) and open the JSearch listing.",
      "Click Subscribe to Test and choose the free Basic plan.",
      "Open the Endpoints tab — your key is the X-RapidAPI-Key header value.",
    ],
  },
  {
    key: "OPENWEBNINJA_API_KEY",
    label: "JSearch key — direct from OpenWeb Ninja",
    help: "The same JSearch data bought straight from its publisher instead of through the RapidAPI marketplace. Use this if you signed up at openwebninja.com. Only one JSearch key is needed; whichever you save is the one JobPilot uses.",
    url: "https://app.openwebninja.com/api/jsearch",
    urlLabel: "app.openwebninja.com → JSearch",
    steps: [
      "Sign up and subscribe to JSearch (free tier available).",
      "Copy the API key from your dashboard.",
      "Paste it here — JobPilot switches to the direct endpoint automatically.",
    ],
  },
  {
    key: "ADZUNA_APP_ID",
    label: "Adzuna App ID",
    help: "Adzuna has no Philippines endpoint, so treat it as your remote and overseas feed. Pick the nearest market under Search defaults (default Singapore).",
    url: "https://developer.adzuna.com/",
    urlLabel: "developer.adzuna.com",
    steps: [
      "Register for a free developer account.",
      "Your dashboard shows Application ID and Application Key.",
      "Paste the Application ID here and the key in the next field — both are required.",
    ],
  },
  {
    key: "ADZUNA_APP_KEY",
    label: "Adzuna App Key",
    help: "The second half of the Adzuna credential pair. Adzuna stays disabled until both this and the App ID are set.",
    url: "https://developer.adzuna.com/",
    urlLabel: "developer.adzuna.com",
    steps: ["Same dashboard as the App ID — copy the Application Key."],
  },
  {
    key: "JOOBLE_API_KEY",
    label: "Jooble API key",
    help: "Heads up: Jooble currently answers automated requests from this network with a Cloudflare challenge, so the API may fail even with a valid key. JobPilot will tell you when that happens, and the Jooble search link under Job Search works regardless. Save a key if you have one — it starts working the moment Jooble stops challenging.",
    url: "https://jooble.org/api/about",
    urlLabel: "jooble.org/api/about",
    steps: [
      "Open the API page and fill in the request form.",
      "The key is emailed to you, usually within a day.",
      "Paste the key itself — Jooble puts it in the URL, so no extra setup.",
    ],
  },
  {
    key: "CAREERJET_API_KEY",
    label: "Careerjet API key",
    help: "Searches Careerjet with the en_PH locale via their Search API v4. Note this is the v4 API key from a Publisher account, not the old affiliate ID — the legacy affid endpoint is closed to new accounts.",
    url: "https://www.careerjet.com/partners/api",
    urlLabel: "careerjet.com/partners/api",
    steps: [
      "Sign up for a free Careerjet Publisher account.",
      "Open the API section and copy your v4 API key.",
      "Paste it here — JobPilot sends it as HTTP Basic auth.",
    ],
  },
];

function SourceRow({
  meta,
  status,
  onSaved,
}: {
  meta: KeyMeta;
  status: KeyStatus;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (next: string) => {
    startTransition(async () => {
      const result = await saveSettingAction(meta.key, next);
      if (result.ok) {
        toast.success(`${meta.label}: ${result.message}`);
        setValue("");
        onSaved();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="border-b border-slate-200 py-3 last:border-0 dark:border-slate-800">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{meta.label}</span>
        {status.isSet ? (
          <Badge tone="green">
            set · {status.source === "db" ? "saved here" : ".env"} · {status.maskedValue}
          </Badge>
        ) : (
          <Badge tone="neutral">not set</Badge>
        )}
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          <HelpCircle className="size-3.5" /> Where do I get this?
        </button>
      </div>

      {showHelp && (
        <div className="mb-2 space-y-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <p>{meta.help}</p>
          {meta.url && (
            <a
              href={meta.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <ExternalLink className="size-3" /> {meta.urlLabel ?? meta.url}
            </a>
          )}
          <ol className="list-inside list-decimal space-y-0.5">
            {meta.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <p className="text-slate-500 dark:text-slate-400">
            Or set <code>{meta.key}</code> in <code>.env.local</code> — a value saved here wins.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status.isSet ? "Enter a new value to replace" : "Paste key…"}
        />
        <Button size="md" onClick={() => submit(value)} loading={pending} disabled={!value.trim()}>
          <Save className="size-4" /> Save
        </Button>
        {status.source === "db" && (
          <Button
            size="md"
            variant="secondary"
            onClick={() => submit("")}
            disabled={pending}
            aria-label={`Clear ${meta.label}`}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function PlainSetting({
  settingKey,
  label,
  hint,
  status,
  options,
  onSaved,
}: {
  settingKey: SettingKey;
  label: string;
  hint?: string;
  status: KeyStatus;
  options?: { value: string; label: string }[];
  onSaved: () => void;
}) {
  const [value, setValue] = useState(status.maskedValue ?? "");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await saveSettingAction(settingKey, value);
      if (result.ok) {
        toast.success(`${label} saved.`);
        onSaved();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="flex items-end gap-2">
      <Field label={label} hint={hint} className="flex-1">
        {options ? (
          <Select value={value} onChange={(e) => setValue(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input value={value} onChange={(e) => setValue(e.target.value)} />
        )}
      </Field>
      <Button onClick={submit} loading={pending} variant="secondary">
        Save
      </Button>
    </div>
  );
}

export function SettingsClient({
  statuses,
  activeProvider,
  activeModel,
}: {
  statuses: KeyStatus[];
  /** Null when no key is set, so every feature is on its keyword fallback. */
  activeProvider: string | null;
  activeModel: string | null;
}) {
  const router = useRouter();
  const byKey = new Map(statuses.map((s) => [s.key, s]));
  const refresh = () => router.refresh();
  const get = (key: SettingKey) =>
    byKey.get(key) ?? { key, isSet: false, source: null, maskedValue: null };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="AI features"
            description="Optional — every AI feature has a keyword-based fallback."
          />
          <CardBody className="py-1">
            {/*
              Which provider is in use is otherwise invisible, and it is not
              obvious: a saved Anthropic key takes precedence, so a stale one
              shadows a working Gemini key and nothing appears to change.
            */}
            <div className="mb-1 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 text-sm dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-400">Currently using</span>
              {activeProvider ? (
                <>
                  <Badge tone="green">{activeProvider}</Badge>
                  <code className="text-xs text-slate-500 dark:text-slate-400">{activeModel}</code>
                  {get("ANTHROPIC_API_KEY").isSet && get("GEMINI_API_KEY").isSet && (
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      Both keys are set — Anthropic wins. Clear it to use Gemini.
                    </span>
                  )}
                </>
              ) : (
                <Badge tone="neutral">keyword fallback — no key set</Badge>
              )}
            </div>
            {AI_KEYS.map((meta) => (
              <SourceRow key={meta.key} meta={meta} status={get(meta.key)} onSaved={refresh} />
            ))}

            {/*
              Stated plainly rather than buried in the help popover: Google's own
              terms tell you not to send personal information to the free tier,
              and a resume is nothing but personal information.
            */}
            <div className="my-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <strong>Before using the Gemini free tier for resumes.</strong> Google&rsquo;s API
                  terms state that content sent to the unpaid tier is used to improve their products
                  and that <em>&ldquo;human reviewers may read, annotate, and process&rdquo;</em> it,
                  and they advise: <em>&ldquo;Do not submit sensitive, confidential, or personal
                  information to the Unpaid Services.&rdquo;</em> A resume is exactly that — name,
                  phone, address and employment history. The paid tiers of both providers do not use
                  your content this way.{" "}
                  <a
                    href="https://ai.google.dev/gemini-api/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline"
                  >
                    Read the terms
                  </a>
                  . Leaving both keys blank keeps every resume on this PC.
                </span>
              </p>
            </div>

            <div className="pt-1">
              <PlainSetting
                settingKey="AI_MODEL"
                label="Model"
                hint={
                  activeModel
                    ? `Leave blank to use ${activeModel}. An override naming the other provider's model is ignored.`
                    : "Leave blank to use each provider's default. Set a key first."
                }
                status={get("AI_MODEL")}
                onSaved={refresh}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Search defaults"
            description="Applied to every new job search."
          />
          <CardBody className="space-y-3">
            <PlainSetting
              settingKey="DEFAULT_LOCATION"
              label="Default search location"
              status={get("DEFAULT_LOCATION")}
              onSaved={refresh}
            />
            <PlainSetting
              settingKey="ADZUNA_COUNTRY"
              label="Adzuna country"
              hint="Adzuna has no Philippines endpoint — pick the nearest market."
              status={get("ADZUNA_COUNTRY")}
              options={[
                { value: "sg", label: "Singapore" },
                { value: "au", label: "Australia" },
                { value: "nz", label: "New Zealand" },
                { value: "gb", label: "United Kingdom" },
                { value: "us", label: "United States" },
                { value: "ca", label: "Canada" },
                { value: "in", label: "India" },
                { value: "za", label: "South Africa" },
              ]}
              onSaved={refresh}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Documents" description="Defaults for generated resumes." />
          <CardBody className="space-y-3">
            <PlainSetting
              settingKey="DEFAULT_TEMPLATE"
              label="Default resume template"
              status={get("DEFAULT_TEMPLATE")}
              options={[
                { value: "classic", label: "Classic — traditional serif" },
                { value: "modern", label: "Modern — clean sans-serif" },
                { value: "compact", label: "Compact — fits one page" },
                { value: "centered", label: "Centered — recommended, best read by job sites" },
              ]}
              onSaved={refresh}
            />
            <PlainSetting
              settingKey="PAPER_SIZE"
              label="Paper size"
              status={get("PAPER_SIZE")}
              options={[
                { value: "Letter", label: "Letter (US)" },
                { value: "A4", label: "A4" },
              ]}
              onSaved={refresh}
            />
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Job search sources"
            description="Each source works independently — a missing key only disables that one."
          />
          <CardBody className="py-1">
            <p className="py-2 text-sm text-slate-600 dark:text-slate-400">
              <strong>Jobicy</strong> and <strong>Remotive</strong> (remote jobs) need no key and
              are always on. The sources below add local Philippines coverage and the big
              aggregators on top.
            </p>
            {JOB_KEYS.map((meta) => (
              <SourceRow key={meta.key} meta={meta} status={get(meta.key)} onSaved={refresh} />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Backup" description="Everything stays on this PC." />
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Downloads a zip containing the SQLite database plus every uploaded resume and
              generated PDF. Keep it somewhere safe — it also contains any API keys you saved above.
            </p>
            <a
              href="/api/backup"
              download
              className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <Download className="size-4" /> Download backup
            </a>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Privacy" />
          <CardBody className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <p>
              The dev server binds to <code>127.0.0.1</code> only, so nothing on your network can
              reach it. Data lives in <code>./data</code> and <code>./storage</code> inside the
              project folder.
            </p>
            <p>
              Outbound requests happen only for: job search APIs you configured, fetching a job URL
              you paste, and Anthropic API calls when a key is set. Resume content is sent to
              Anthropic only when you have configured a key.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
