import type { ContactInfo, ParsedResume } from "@/lib/parsing/schema";
import type { PaperSize, TemplateId } from "@/lib/types";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { renderClassicHtml } from "@/lib/pdf/templates/classic";
import { renderModernHtml } from "@/lib/pdf/templates/modern";
import { renderCompactHtml } from "@/lib/pdf/templates/compact";
import { renderCenteredHtml } from "@/lib/pdf/templates/centered";
import { renderCoverLetterHtml } from "@/lib/pdf/templates/cover-letter";
export { closeBrowser } from "@/lib/pdf/browser";

/**
 * Complete self-contained HTML document for a resume. Rendered to PDF by
 * Puppeteer and also served as-is for the live iframe preview.
 */
export function renderResumeHtml(resume: ParsedResume, template: TemplateId): string {
  switch (template) {
    case "classic":
      return renderClassicHtml(resume);
    case "modern":
      return renderModernHtml(resume);
    case "compact":
      return renderCompactHtml(resume);
    case "centered":
      return renderCenteredHtml(resume);
    default: {
      const exhaustive: never = template;
      throw new Error(`Unknown template: ${String(exhaustive)}`);
    }
  }
}

export async function generateResumePdf(
  resume: ParsedResume,
  template: TemplateId,
  paper: PaperSize
): Promise<{ pdf: Buffer; html: string }> {
  const html = renderResumeHtml(resume, template);
  const pdf = await renderHtmlToPdf(html, paper);
  return { pdf, html };
}

export async function generateCoverLetterPdf(opts: {
  contact: ContactInfo;
  body: string;
  jobTitle: string;
  company: string | null;
  paper: PaperSize;
}): Promise<{ pdf: Buffer; html: string }> {
  const html = renderCoverLetterHtml({
    contact: opts.contact,
    body: opts.body,
    jobTitle: opts.jobTitle,
    company: opts.company,
    date: new Date().toLocaleDateString("en-US", { dateStyle: "long" }),
  });
  const pdf = await renderHtmlToPdf(html, opts.paper);
  return { pdf, html };
}
