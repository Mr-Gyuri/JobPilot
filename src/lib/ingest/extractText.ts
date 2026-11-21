import * as cheerio from "cheerio";

const MAX_CHARS = 15_000;
const STRIP = "script, style, nav, header, footer, aside, form, noscript, iframe, svg, template";

// Block-level elements whose boundaries must survive as line breaks. cheerio's
// .text() concatenates raw text nodes, so without this every <li> in a job
// posting runs together into a single unusable line.
const BLOCK = "p, li, div, section, article, h1, h2, h3, h4, h5, h6, tr, dt, dd, pre, blockquote";

/** Insert real line breaks at block boundaries, then read the text. */
function blockAwareText($: cheerio.CheerioAPI, root: cheerio.Cheerio<never>): string {
  $("br", root).replaceWith("\n");
  $("li", root).each((_, el) => {
    $(el).prepend("• ");
  });
  $(BLOCK, root).each((_, el) => {
    $(el).append("\n");
  });
  return normalizeText(root.text());
}

/** Strip chrome from a page and return the densest readable text block. */
export function pageToText(html: string): string {
  const $ = cheerio.load(html);
  $(STRIP).remove();

  const candidates = ["main", "article", '[role="main"]', "#content", ".job-description"];
  let bestSelector: string | null = null;
  let bestLength = 0;
  for (const selector of candidates) {
    const node = $(selector).first();
    if (node.length === 0) continue;
    const length = node.text().trim().length;
    if (length > bestLength) {
      bestLength = length;
      bestSelector = selector;
    }
  }

  if (bestSelector && bestLength >= 200) {
    const root = $(bestSelector).first() as unknown as cheerio.Cheerio<never>;
    return blockAwareText($, root).slice(0, MAX_CHARS);
  }

  // No obvious main region — fall back to the densest container, then <body>.
  let densest: cheerio.Cheerio<never> | null = null;
  let densestLength = 0;
  $("div, section").each((_, el) => {
    const node = $(el);
    const length = node.text().length;
    if (length > densestLength && length < 60_000) {
      densestLength = length;
      densest = node as unknown as cheerio.Cheerio<never>;
    }
  });

  const root =
    densest && densestLength >= 200
      ? densest
      : ($("body") as unknown as cheerio.Cheerio<never>);
  return blockAwareText($, root).slice(0, MAX_CHARS);
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Convert an HTML fragment (e.g. a JSON-LD description) to readable text. */
export function htmlFragmentToText(fragment: string): string {
  if (!/[<&]/.test(fragment)) return normalizeText(fragment);
  const $ = cheerio.load(`<div id="jp-root">${fragment}</div>`);
  const root = $("#jp-root") as unknown as cheerio.Cheerio<never>;
  return blockAwareText($, root);
}
