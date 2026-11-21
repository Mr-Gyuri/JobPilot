import {
  fetchJson,
  mentionsRemote,
  stripHtml,
  toSnippet,
  type SourceAdapter,
} from "@/lib/sources/adapter";
import type { NormalizedJob, SearchParams } from "@/lib/types";

// Jooble — POST API keyed by the URL path. Snippets arrive as HTML fragments.

interface JoobleItem {
  id?: string | number | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  snippet?: string | null;
  salary?: string | null;
  type?: string | null;
  updated?: string | null;
  link?: string | null;
  source?: string | null;
}

interface JoobleResponse {
  jobs?: JoobleItem[] | null;
}

const DAYS_AGO: Partial<Record<SearchParams["datePosted"], number>> = {
  day: 1,
  "3days": 3,
  week: 7,
  month: 30,
};

export const joobleAdapter: SourceAdapter = {
  id: "jooble",
  label: "Jooble",
  keySets: [["JOOBLE_API_KEY"]],

  async search(params: SearchParams, keys: Record<string, string>): Promise<NormalizedJob[]> {
    const body: Record<string, string> = {
      keywords: params.remoteOnly ? `${params.keywords} remote` : params.keywords,
      location: params.location,
      page: String(params.page),
    };
    const daysAgo = DAYS_AGO[params.datePosted];
    if (daysAgo) {
      body.datecreatedfrom = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
    }

    const response = await fetchJson<JoobleResponse>(
      `https://jooble.org/api/${keys.JOOBLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    return (response.jobs ?? []).map((item): NormalizedJob => {
      const title = item.title ?? "";
      const location = item.location ?? "";
      const snippet = item.snippet ? stripHtml(item.snippet) : "";
      return {
        externalId: item.id != null ? String(item.id) : "",
        source: "jooble",
        sourcePublisher: item.source || undefined,
        title,
        company: item.company ?? "",
        location,
        isRemote: mentionsRemote(title, location, snippet),
        employmentType: item.type
          ? item.type.toLowerCase().trim().replace(/\s+/g, "_")
          : undefined,
        salaryText: item.salary || undefined,
        postedAt: item.updated ?? undefined,
        url: item.link ?? "",
        descriptionSnippet: toSnippet(snippet),
      };
    });
  },
};
