import { getConfigValue } from "@/lib/config";
import { cacheKey, getCached, setCached } from "@/lib/repos/search-cache";
import {
  BotProtectionError,
  missingKeysFor,
  resolveKeySet,
  type SourceAdapter,
} from "@/lib/sources/adapter";
import { adzunaAdapter } from "@/lib/sources/adzuna";
import { careerjetAdapter } from "@/lib/sources/careerjet";
import { jobicyAdapter } from "@/lib/sources/jobicy";
import { joobleAdapter } from "@/lib/sources/jooble";
import { jsearchAdapter } from "@/lib/sources/jsearch";
import { remotiveAdapter } from "@/lib/sources/remotive";
import type {
  ApiSourceId,
  NormalizedJob,
  SearchParams,
  SourceError,
  SourceStatus,
} from "@/lib/types";

// Jobicy and Remotive are keyless (empty key set) and therefore always enabled.
const ADAPTERS: SourceAdapter[] = [
  jsearchAdapter,
  adzunaAdapter,
  joobleAdapter,
  careerjetAdapter,
  jobicyAdapter,
  remotiveAdapter,
];

export function getSourceStatuses(): SourceStatus[] {
  return ADAPTERS.map((adapter) => {
    const configured = resolveKeySet(adapter, getConfigValue) !== null;
    return {
      id: adapter.id,
      label: adapter.label,
      keyStatus: configured ? ("ok" as const) : ("missing" as const),
      missingKeys: configured ? [] : missingKeysFor(adapter, getConfigValue),
    };
  });
}

interface PendingSearch {
  adapter: SourceAdapter;
  keys: Record<string, string>;
  cacheKey: string;
}

/**
 * Fan a search out to every enabled, fully-keyed adapter. Cache hits skip the
 * network entirely (free-tier quotas are tiny); live calls run in parallel and
 * one source failing never takes down the rest.
 */
export async function searchAllSources(
  params: SearchParams,
  enabled: ApiSourceId[]
): Promise<{
  results: NormalizedJob[];
  errors: SourceError[];
  fromCache: string[];
}> {
  const results: NormalizedJob[] = [];
  const errors: SourceError[] = [];
  const fromCache: string[] = [];
  const pending: PendingSearch[] = [];

  for (const adapter of ADAPTERS) {
    if (!enabled.includes(adapter.id)) continue;

    const keys = resolveKeySet(adapter, getConfigValue);
    if (!keys) continue; // unconfigured — surfaced to the UI via getSourceStatuses

    const key = cacheKey(adapter.id, params);
    const cached = getCached<NormalizedJob[]>(key);
    if (cached) {
      results.push(...cached);
      fromCache.push(adapter.id);
      continue;
    }
    pending.push({ adapter, keys, cacheKey: key });
  }

  const settled = await Promise.allSettled(
    pending.map((p) => p.adapter.search(params, p.keys))
  );

  settled.forEach((outcome, i) => {
    const { adapter, cacheKey: key } = pending[i];
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value);
      setCached(key, adapter.id, outcome.value);
    } else {
      const reason = outcome.reason;
      errors.push({
        source: adapter.id,
        message: reason instanceof Error ? reason.message : String(reason),
        kind: reason instanceof BotProtectionError ? "blocked" : "error",
      });
    }
  });

  return { results, errors, fromCache };
}
