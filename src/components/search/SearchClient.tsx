"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  KeyRound,
  Search as SearchIcon,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  importSearchResultAction,
  searchJobsAction,
  suggestSearchesAction,
} from "@/actions/search";
import { buildSmartLinks } from "@/lib/sources/smartLinks";
import { usePersistedList, useSessionValue } from "@/lib/use-external-state";
import type { SuggestResult } from "@/lib/suggest";
import type {
  ApiSourceId,
  WorkSetup,
  MergedJob,
  SearchParams,
  SearchResponse,
  SourceStatus,
} from "@/lib/types";

const TOGGLE_STORAGE_KEY = "jp_enabled_sources";

function relativeDate(iso?: string): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Whether a posting's published pay is below what the profile asked for.
 *
 * Only compares like with like. Most postings publish no salary at all, and the
 * ones that do use different currencies and periods - flagging a "PHP 40,000 a
 * month" expectation against "USD 90K a year" would be worse than staying quiet.
 * So this returns false unless the currency matches and the period is monthly,
 * which is how Philippine salaries are quoted and how the expectation is entered.
 */
function isBelowExpectation(
  job: MergedJob,
  expectedMin: number | null,
  currency: string
): boolean {
  if (expectedMin == null || expectedMin <= 0) return false;
  const top = job.salaryMax ?? job.salaryMin;
  if (top == null) return false;
  if ((job.salaryCurrency ?? "").toUpperCase() !== currency.toUpperCase()) return false;
  const period = (job.salaryPeriod ?? "").toLowerCase();
  if (period && !period.startsWith("month")) return false;
  return top < expectedMin;
}

function salaryLabel(job: MergedJob): string | null {
  if (job.salaryText) return job.salaryText;
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const currency = job.salaryCurrency ?? "";
  const min = job.salaryMin?.toLocaleString();
  const max = job.salaryMax?.toLocaleString();
  const range = min && max ? `${min} – ${max}` : (min ?? max ?? "");
  return `${currency} ${range}${job.salaryPeriod ? ` / ${job.salaryPeriod}` : ""}`.trim();
}

export function SearchClient({
  sources,
  defaultKeywords,
  defaultLocation,
  profileId,
  workSetup,
  expectedSalaryMin,
  salaryCurrency,
}: {
  sources: SourceStatus[];
  defaultKeywords: string;
  defaultLocation: string;
  /** Scopes the remembered search: results carry per-profile "already saved" badges. */
  profileId: number;
  /** From the profile. "remote" pre-ticks Remote only. */
  workSetup: WorkSetup;
  /** From the profile. Used to flag published pay below what she asked for. */
  expectedSalaryMin: number | null;
  salaryCurrency: string;
}) {
  const router = useRouter();
  // Remembered for this sitting, so looking at another tab and coming back does
  // not throw away results that cost search credits to fetch. Keyed by profile:
  // the "already saved" badges on results are per-profile, so showing one
  // person's last search to the other would be wrong, not just untidy.
  const [params, setParams] = useSessionValue<SearchParams>(`jp_search_params_${profileId}`, {
    keywords: defaultKeywords,
    location: defaultLocation,
    // Honour the stated preference instead of asking for it twice.
    remoteOnly: workSetup === "remote",
    datePosted: "any",
    jobType: "",
    page: 1,
  });
  const keyedSources = sources.filter((s) => s.keyStatus === "ok").map((s) => s.id);
  // Remembered between visits; a source whose key was removed drops out.
  const [persisted, setPersisted] = usePersistedList<ApiSourceId>(
    TOGGLE_STORAGE_KEY,
    keyedSources
  );
  const enabled = persisted.filter((id) => keyedSources.includes(id));

  const [phFocus, setPhFocus] = useSessionValue(`jp_search_phfocus_${profileId}`, true);
  const [suggestions, setSuggestions] = useSessionValue<SuggestResult | null>(
    `jp_search_suggestions_${profileId}`,
    null
  );
  const [suggesting, startSuggest] = useTransition();
  const [response, setResponse] = useSessionValue<SearchResponse | null>(
    `jp_search_results_${profileId}`,
    null
  );
  const [searching, startSearch] = useTransition();
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importing, startImport] = useTransition();

  const toggleSource = (id: ApiSourceId) => {
    setPersisted(
      enabled.includes(id) ? enabled.filter((s) => s !== id) : [...enabled, id]
    );
  };

  const smartLinks = buildSmartLinks(params);
  const liveSources = sources.filter((s) => s.keyStatus === "ok");

  const suggest = () => {
    startSuggest(async () => {
      const result = await suggestSearchesAction();
      if (result.ok) setSuggestions(result.data);
      else toast.error(result.message);
    });
  };

  const runSearch = () => {
    startSearch(async () => {
      const result = await searchJobsAction(params, enabled, phFocus);
      if (result.ok) {
        setResponse(result.data);
        if (result.data.results.length === 0 && result.data.errors.length === 0) {
          toast.info("No API results — try the smart links below.");
        }
      } else {
        toast.error(result.message);
      }
    });
  };

  const ingest = (job: MergedJob) => {
    setImportingId(job.externalId);
    startImport(async () => {
      const result = await importSearchResultAction(job);
      setImportingId(null);
      if (result.ok) {
        toast.success(result.message ?? "Imported.");
        // The badges were computed when the search ran, so the remembered copy
        // would still offer to import this one after she navigates back.
        const jobId = result.data.jobId;
        if (response) {
          setResponse({
            ...response,
            results: response.results.map((r) =>
              r.externalId === job.externalId ? { ...r, alreadySavedJobId: jobId } : r
            ),
          });
        }
        router.push(`/jobs/${jobId}`);
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <Card>
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Keywords">
                <Input
                  value={params.keywords}
                  onChange={(e) => setParams({ ...params, keywords: e.target.value })}
                  placeholder="Backend developer"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && params.keywords.trim()) runSearch();
                  }}
                />
              </Field>
              <Field label="Location">
                <Input
                  value={params.location}
                  onChange={(e) => setParams({ ...params, location: e.target.value })}
                  placeholder="Philippines"
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <Field label="Date posted" className="w-36">
                <Select
                  value={params.datePosted}
                  onChange={(e) =>
                    setParams({ ...params, datePosted: e.target.value as SearchParams["datePosted"] })
                  }
                >
                  <option value="any">Any time</option>
                  <option value="day">Past 24 hours</option>
                  <option value="3days">Past 3 days</option>
                  <option value="week">Past week</option>
                  <option value="month">Past month</option>
                </Select>
              </Field>
              <Field label="Job type" className="w-40">
                <Select
                  value={params.jobType}
                  onChange={(e) =>
                    setParams({ ...params, jobType: e.target.value as SearchParams["jobType"] })
                  }
                >
                  <option value="">Any type</option>
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="contract">Contract</option>
                  <option value="temporary">Temporary</option>
                  <option value="internship">Internship</option>
                </Select>
              </Field>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={params.remoteOnly}
                  onChange={(e) => setParams({ ...params, remoteOnly: e.target.checked })}
                  className="size-4 rounded border-slate-300 accent-indigo-600"
                />
                Remote only
              </label>
              <label
                className="flex h-9 items-center gap-2 text-sm"
                title="Hides jobs that only accept candidates in other regions, drops roles outside your search field, and shows Jobstreet / LinkedIn / Foundit postings first."
              >
                <input
                  type="checkbox"
                  checked={phFocus}
                  onChange={(e) => setPhFocus(e.target.checked)}
                  className="size-4 rounded border-slate-300 accent-indigo-600"
                />
                PH-focused
              </label>
              <Button
                variant="secondary"
                className="ml-auto"
                onClick={suggest}
                loading={suggesting}
                title="Reads your master resume and proposes job titles to search for"
              >
                <Wand2 className="size-4" /> Suggest from my resume
              </Button>
              <Button
                onClick={runSearch}
                loading={searching}
                disabled={!params.keywords.trim()}
              >
                <SearchIcon className="size-4" /> Search
              </Button>
            </div>

            {/*
              Suggestions are offered, never auto-searched: JSearch's free tier
              is about 200 requests a month and running all six would spend six
              of them per click.
            */}
            {suggestions && (
              <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  From your resume{" "}
                  <Badge tone={suggestions.method === "ai" ? "indigo" : "neutral"}>
                    {suggestions.method === "ai" ? `AI · ${suggestions.model}` : "resume titles"}
                  </Badge>{" "}
                  — pick one to fill Keywords, then press Search.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.suggestions.map((s) => (
                    <button
                      key={s.keywords}
                      type="button"
                      title={s.rationale}
                      onClick={() => setParams({ ...params, keywords: s.keywords })}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        params.keywords === s.keywords
                          ? "border-indigo-500 bg-indigo-600 text-white"
                          : "border-indigo-300 bg-white text-indigo-800 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-slate-900 dark:text-indigo-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      {s.keywords}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                API sources
              </span>
              <div className="flex flex-wrap gap-2">
                {sources.map((source) => {
                  const isOn = enabled.includes(source.id);
                  const usable = source.keyStatus === "ok";
                  return usable ? (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => toggleSource(source.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        isOn
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                      }`}
                    >
                      {isOn && <Check className="size-3" />}
                      {source.label}
                    </button>
                  ) : (
                    <Link
                      key={source.id}
                      href="/settings"
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                      title={`Missing: ${source.missingKeys.join(", ")}`}
                    >
                      <KeyRound className="size-3" /> {source.label} · key missing
                    </Link>
                  );
                })}
              </div>
              {liveSources.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No API keys configured yet — use the smart links on the right, or add a free key in{" "}
                  <Link href="/settings" className="text-indigo-600 hover:underline dark:text-indigo-400">
                    Settings
                  </Link>
                  .
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        {searching && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardBody className="space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-3 w-3/4" />
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {!searching && response && (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {response.results.length} result{response.results.length === 1 ? "" : "s"}
              {response.duplicatesMerged > 0 && ` · ${response.duplicatesMerged} duplicate(s) merged`}
              {response.fromCache.length > 0 && ` · cached: ${response.fromCache.join(", ")}`}
              {response.hidden.notOpenToPh > 0 &&
                ` · ${response.hidden.notOpenToPh} hidden (not open to PH)`}
              {response.hidden.offTopic > 0 &&
                ` · ${response.hidden.offTopic} hidden (off-topic role)`}
              {response.errors
                .map((e) => ` · ${e.source} ${e.kind === "blocked" ? "blocked" : "failed"}`)
                .join("")}
            </p>
            {phFocus && response.hidden.notOpenToPh + response.hidden.offTopic > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                PH-focused is on — untick it to see everything the sources returned.
              </p>
            )}

            {response.errors.length > 0 && (
              <div className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-500/40 dark:bg-amber-500/10">
                {response.errors.map((error) => (
                  <p key={error.source} className="flex items-start gap-1.5 text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    <span>
                      <strong>{error.source}</strong>: {error.message}
                    </span>
                  </p>
                ))}
              </div>
            )}

            {response.results.length === 0 ? (
              <EmptyState
                icon={liveSources.length === 0 ? KeyRound : SearchIcon}
                title={
                  liveSources.length === 0
                    ? "No job source connected yet"
                    : "No matches from the connected sources"
                }
                body={
                  liveSources.length === 0
                    ? "API sources need a free key before they can return results here. Start with JSearch — it aggregates LinkedIn, Indeed and Glassdoor in one key. Meanwhile the smart links on the right work right now, with no setup."
                    : "Nothing matched those filters. Try broader keywords, clear the date filter, or use the smart links to search the same terms on sites that block automated access."
                }
                action={
                  liveSources.length === 0 ? (
                    <Link
                      href="/settings"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      <KeyRound className="size-4" /> Connect a source in Settings
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <div className="space-y-2">
                {response.results.map((job) => {
                  const posted = relativeDate(job.postedAt);
                  const salary = salaryLabel(job);
                  const belowExpectation = isBelowExpectation(
                    job,
                    expectedSalaryMin,
                    salaryCurrency
                  );
                  return (
                    <Card key={`${job.source}-${job.externalId}`} data-testid="search-result">
                      <CardBody className="space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-medium">{job.title}</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              {job.company}
                              {job.location ? ` · ${job.location}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-1.5">
                            {job.alreadySavedJobId != null ? (
                              <ButtonLink
                                href={`/jobs/${job.alreadySavedJobId}`}
                                size="sm"
                                variant="secondary"
                              >
                                Already saved
                              </ButtonLink>
                            ) : (
                              <Button
                                size="sm"
                                loading={importing && importingId === job.externalId}
                                disabled={importing}
                                onClick={() => ingest(job)}
                              >
                                <Sparkles className="size-3.5" /> Ingest &amp; analyse
                              </Button>
                            )}
                            {job.url && (
                              <ButtonLink
                                href={job.url}
                                external
                                size="sm"
                                variant="ghost"
                                aria-label="Open original posting"
                              >
                                <ExternalLink className="size-3.5" />
                              </ButtonLink>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {job.isRemote && <Badge tone="sky">remote</Badge>}
                          {job.employmentType && <Badge tone="neutral">{job.employmentType}</Badge>}
                          {salary && (
                            <Badge tone={belowExpectation ? "amber" : "green"}>
                              {salary}
                              {job.salaryIsEstimate ? " (est.)" : ""}
                            </Badge>
                          )}
                          {belowExpectation && (
                            <Badge tone="amber">below your minimum</Badge>
                          )}
                          {posted && <Badge tone="neutral">{posted}</Badge>}
                          {job.sources.map((ref) => (
                            <Badge key={`${ref.source}-${ref.url}`} tone="indigo">
                              {ref.publisher ?? ref.source}
                            </Badge>
                          ))}
                          {job.duplicateCount > 0 && (
                            <Badge tone="amber">+{job.duplicateCount} duplicate</Badge>
                          )}
                        </div>

                        {job.descriptionSnippet && (
                          <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                            {job.descriptionSnippet}
                          </p>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!searching && !response && (
          <EmptyState
            icon={SearchIcon}
            title="Search across every source at once"
            body={
              liveSources.length === 0
                ? "No API source is connected yet, so a search here will come back empty. The smart links on the right work with no setup — or connect a free key in Settings to get results in this page."
                : `Enter keywords to query ${liveSources.map((s) => s.label).join(", ")}. Results are merged and deduplicated, and the smart links on the right cover the sites that block automated access.`
            }
            action={
              liveSources.length === 0 ? (
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <KeyRound className="size-4" /> Connect a source
                </Link>
              ) : undefined
            }
          />
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Smart search links"
            description="For sites that block automated access. These open a pre-filled search in a new tab."
          />
          <CardBody className="space-y-2">
            {smartLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
              >
                <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{link.label}</span>
                  {link.note && (
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {link.note}
                    </span>
                  )}
                </span>
              </a>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
