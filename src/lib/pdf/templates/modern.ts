import type { ParsedResume } from "@/lib/parsing/schema";
import {
  BASE_CSS,
  contactParts,
  escapeHtml,
  htmlDocument,
  renderCertificationsSection,
  renderEducationSection,
  renderExperienceSection,
  renderExtraSections,
  renderSkillsSection,
  renderSummarySection,
} from "@/lib/pdf/templates/shared";

// Modern: clean sans-serif. Left-aligned name block with a location subtitle,
// navy uppercase section headers separated by whitespace instead of rules,
// title-first entry headers, dash-separated skill lines.

const CSS = `
${BASE_CSS}
body { font-family: Calibri, Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.35; color: #222; }
.name { font-size: 20pt; font-weight: 600; }
.subtitle { font-size: 10.5pt; color: #444; margin-top: 2pt; }
.contact { font-size: 9.5pt; color: #444; margin-top: 3pt; }
/*
  letter-spacing is capped at 1px. Above roughly 1.25px at this size, PDF text
  extraction reads each letter as its own word - "EXPERIENCE" comes out as
  "E X P E R I E N C E", no parser recognises it as a heading, and the entire
  resume body becomes invisible to an ATS. This was 1.5px and did exactly that.
*/
h2 { font-size: 10pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #1a3c5e; margin-bottom: 5pt; }
.section { margin-top: 16pt; }
.entry { margin-bottom: 8pt; }
.entry-sub { color: #444; }
.entry-dates { font-size: 9.5pt; color: #444; }
.skill-line { margin-bottom: 2pt; }
.skill-group { font-weight: bold; }
`;

export function renderModernHtml(resume: ParsedResume): string {
  const name = resume.contact.fullName.trim() || "Resume";
  const location = resume.contact.location?.trim() ?? "";
  // Location is the subtitle line, so the contact line carries the rest.
  const contact = contactParts(resume.contact, false).map(escapeHtml).join(" · ");

  const body =
    `<header>` +
    `<h1 class="name">${escapeHtml(name)}</h1>` +
    (location ? `<p class="subtitle">${escapeHtml(location)}</p>` : "") +
    (contact ? `<p class="contact">${contact}</p>` : "") +
    `</header>` +
    renderSummarySection(resume) +
    renderExperienceSection(resume, (entry) => {
      const loc = entry.location?.trim() ?? "";
      return {
        primaryHtml:
          // Em dash rather than a comma: a job title containing a comma makes
          // "Title, Company" impossible to split when read back as text.
          `<strong>${escapeHtml(entry.title)}</strong> — ${escapeHtml(entry.company)}` +
          (loc ? ` · ${escapeHtml(loc)}` : ""),
      };
    }) +
    renderEducationSection(resume) +
    renderSkillsSection(resume, " – ") +
    renderCertificationsSection(resume) +
    renderExtraSections(resume);

  return htmlDocument(name, CSS, body);
}
