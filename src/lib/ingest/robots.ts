import robotsParser from "robots-parser";

export const CRAWL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Respect robots.txt before fetching any job posting. A missing or unreachable
 * robots.txt is treated as permission granted (standard crawler behaviour);
 * an explicit Disallow is honoured and surfaced to the UI so the user can paste
 * the description instead.
 */
export async function isAllowedByRobots(
  url: string
): Promise<{ allowed: boolean; reason?: string }> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return { allowed: false, reason: "Invalid URL" };
  }

  const robotsUrl = `${origin}/robots.txt`;
  try {
    const response = await fetch(robotsUrl, {
      headers: { "User-Agent": CRAWL_UA },
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });
    if (!response.ok) return { allowed: true };
    const body = await response.text();
    if (!body.trim()) return { allowed: true };

    const robots = robotsParser(robotsUrl, body);
    const allowed = robots.isAllowed(url, CRAWL_UA);
    if (allowed === false) {
      return { allowed: false, reason: "robots.txt disallows this path" };
    }
    return { allowed: true };
  } catch (err) {
    console.warn(`robots.txt check failed for ${origin}, proceeding:`, err);
    return { allowed: true };
  }
}
