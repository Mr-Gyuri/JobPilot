import type { ContactInfo, ExperienceEntry, ParsedResume } from "@/lib/parsing/schema";

// Shared building blocks for the ATS-safe resume templates. Every template is
// a single column of real text: no tables, no images, no icon fonts. Section
// markup uses fixed class names (.section, .entry, .entry-header, .entry-dates,
// .entry-sub, .bullets, .skill-line, ...) as CSS hooks that each template's
// stylesheet targets differently.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Dates render exactly as written in the source resume; a null end date means
 * the role is current. Returns plain text — callers escape before interpolating.
 */
export function formatDateRange(start: string | null, end: string | null): string {
  const s = start?.trim() ?? "";
  const e = end?.trim() ?? "";
  if (!s && !e) return "";
  if (!s) return e;
  return `${s} – ${e || "Present"}`;
}

/** Plain-text contact parts in display order; caller escapes and joins. */
export function contactParts(contact: ContactInfo, includeLocation = true): string[] {
  const parts: string[] = [];
  if (includeLocation && contact.location?.trim()) parts.push(contact.location.trim());
  if (contact.email?.trim()) parts.push(contact.email.trim());
  if (contact.phone?.trim()) parts.push(contact.phone.trim());
  for (const link of contact.links) {
    if (link.url.trim()) parts.push(link.url.trim());
  }
  return parts;
}

/** Complete HTML document wrapper. CSS is trusted template-authored text. */
export function htmlDocument(title: string, css: string, bodyHtml: string): string {
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(title)}</title><style>${css}</style></head>` +
    `<body>${bodyHtml}</body></html>`
  );
}

/** A section with its heading; returns "" when there is no content. */
export function renderSectionBlock(heading: string, innerHtml: string): string {
  if (!innerHtml) return "";
  return `<section class="section"><h2>${escapeHtml(heading)}</h2>${innerHtml}</section>`;
}

export function renderBullets(items: string[]): string {
  const clean = items.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  return `<ul class="bullets">${clean.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;
}

export interface EntryHeaderParts {
  /** HTML for the left side of the flex header line. Values must be pre-escaped. */
  primaryHtml: string;
  /** Optional HTML line under the header (e.g. italic job title). Pre-escaped. */
  subHtml?: string | null;
}

export type ExperienceHeaderRenderer = (entry: ExperienceEntry) => EntryHeaderParts;

/**
 * Experience section. Templates differ only in how the entry header line is
 * composed (classic leads with the company, modern with the title), so that
 * part is injected; dates always sit right-aligned on the same flex line.
 */
export function renderExperienceSection(
  resume: ParsedResume,
  renderHeader: ExperienceHeaderRenderer
): string {
  if (resume.experience.length === 0) return "";
  const entries = resume.experience.map((entry) => {
    const { primaryHtml, subHtml } = renderHeader(entry);
    const dates = escapeHtml(formatDateRange(entry.startDate, entry.endDate));
    return (
      `<div class="entry">` +
      `<div class="entry-header"><span class="entry-primary">${primaryHtml}</span>` +
      `<span class="entry-dates">${dates}</span></div>` +
      (subHtml ? `<div class="entry-sub">${subHtml}</div>` : "") +
      renderBullets(entry.bullets) +
      `</div>`
    );
  });
  return renderSectionBlock("Experience", entries.join(""));
}

export function renderEducationSection(resume: ParsedResume): string {
  if (resume.education.length === 0) return "";
  const entries = resume.education.map((edu) => {
    const degreeLine = [edu.degree, edu.field]
      .map((v) => v?.trim() ?? "")
      .filter(Boolean)
      .join(", ");
    const dates = edu.graduationDate?.trim() ?? "";
    return (
      `<div class="entry">` +
      `<div class="entry-header"><span class="entry-primary"><strong>${escapeHtml(edu.institution)}</strong></span>` +
      `<span class="entry-dates">${escapeHtml(dates)}</span></div>` +
      (degreeLine ? `<div class="entry-sub">${escapeHtml(degreeLine)}</div>` : "") +
      renderBullets(edu.details) +
      `</div>`
    );
  });
  return renderSectionBlock("Education", entries.join(""));
}

/**
 * Skills as one line per group: "Group: a<sep>b<sep>c". Separator is plain
 * text (e.g. ", " or " – "). Ungrouped (null-name) groups render skills only.
 */
export function renderSkillsSection(resume: ParsedResume, separator: string): string {
  const lines = resume.skills
    .map((group) => ({
      name: group.name?.trim() || null,
      skills: group.skills.map((s) => s.trim()).filter(Boolean),
    }))
    .filter((group) => group.skills.length > 0)
    .map(
      (group) =>
        `<p class="skill-line">` +
        (group.name ? `<span class="skill-group">${escapeHtml(group.name)}:</span> ` : "") +
        group.skills.map(escapeHtml).join(escapeHtml(separator)) +
        `</p>`
    );
  return renderSectionBlock("Skills", lines.join(""));
}

export function renderCertificationsSection(resume: ParsedResume): string {
  if (resume.certifications.length === 0) return "";
  const entries = resume.certifications.map((cert) => {
    const issuer = cert.issuer?.trim() ?? "";
    const primary = escapeHtml(cert.name) + (issuer ? ` — ${escapeHtml(issuer)}` : "");
    const date = cert.date?.trim() ?? "";
    return (
      `<div class="entry">` +
      `<div class="entry-header"><span class="entry-primary">${primary}</span>` +
      `<span class="entry-dates">${escapeHtml(date)}</span></div>` +
      `</div>`
    );
  });
  return renderSectionBlock("Certifications", entries.join(""));
}

/** Each extra section keeps its heading exactly as written in the resume. */
export function renderExtraSections(resume: ParsedResume): string {
  return resume.extraSections
    .filter((section) => section.heading.trim() && section.items.some((i) => i.trim()))
    .map((section) => renderSectionBlock(section.heading.trim(), renderBullets(section.items)))
    .join("");
}

export function renderSummarySection(resume: ParsedResume): string {
  const text = resume.summary?.trim();
  if (!text) return "";
  return renderSectionBlock("Professional Summary", `<p class="summary">${escapeHtml(text)}</p>`);
}

// Print-safe defaults shared by every template: single column, keep entries
// intact across page breaks, never orphan a section heading at a page bottom.
export const BASE_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #111; }
h1, h2, h3, p, ul, ol { margin: 0; padding: 0; }
ul.bullets { padding-left: 1.15em; margin-top: 2pt; list-style: disc; }
li { margin: 0 0 3pt; }
h2 { break-after: avoid; page-break-after: avoid; }
.entry { break-inside: avoid; page-break-inside: avoid; }
.entry-header { display: flex; justify-content: space-between; align-items: baseline; gap: 10pt; }
.entry-primary { min-width: 0; }
.entry-dates { white-space: nowrap; flex: none; }
.section { margin-top: 10pt; }
`;
