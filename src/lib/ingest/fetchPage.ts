import { CRAWL_UA } from "@/lib/ingest/robots";

const MAX_BYTES = 2 * 1024 * 1024;

const BLOCK_SIGNALS = [
  "captcha",
  "just a moment",
  "access denied",
  "cf-browser-verification",
  "attention required",
  "enable javascript and cookies",
  "unusual traffic",
  "are you a robot",
];

export type FetchPageResult = { ok: true; html: string } | { ok: false; message: string };

/**
 * Fetch a job posting page with browser-like headers. Many boards block
 * automated requests outright — that's expected, and the caller turns a
 * failure into the paste-the-description fallback.
 */
export async function fetchPage(url: string): Promise<FetchPageResult> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": CRAWL_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `The site returned HTTP ${response.status}. It is likely blocking automated requests.`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { ok: false, message: `That URL returned ${contentType || "an unknown type"}, not a web page.` };
    }

    const raw = await response.text();
    const html = raw.length > MAX_BYTES ? raw.slice(0, MAX_BYTES) : raw;

    const probe = html.slice(0, 4000).toLowerCase();
    if (BLOCK_SIGNALS.some((signal) => probe.includes(signal))) {
      return {
        ok: false,
        message: "The site served an anti-bot challenge page instead of the job posting.",
      };
    }
    if (html.trim().length < 200) {
      return { ok: false, message: "The page returned almost no content." };
    }

    return { ok: true, html };
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "TimeoutError"
        ? "the request timed out"
        : err instanceof Error
          ? err.message
          : "unknown error";
    return { ok: false, message: `Could not fetch that page (${reason}).` };
  }
}
