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

// Compact: one-page maximizer. Small Arial body, tight line-height and
// spacing, thin section rules, everything about an entry on a single header
// line, comma-joined skills.

const CSS = `
${BASE_CSS}
body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; line-height: 1.15; color: #1a1a1a; }
.name { font-size: 14pt; font-weight: bold; }
.contact { font-size: 9pt; margin-top: 2pt; }
h2 { font-size: 10pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 0.5pt solid #999; padding-bottom: 1pt; margin-bottom: 3pt; }
.section { margin-top: 7pt; }
.entry { margin-bottom: 4pt; }
ul.bullets { margin-top: 1pt; }
li { margin: 0 0 2pt; }
p { margin: 0; }
.skill-line { margin-bottom: 1pt; }
.skill-group { font-weight: bold; }
`;

export function renderCompactHtml(resume: ParsedResume): string {
  const name = resume.contact.fullName.trim() || "Resume";
  const contact = contactParts(resume.contact).map(escapeHtml).join(" · ");

  const body =
    `<header>` +
    `<h1 class="name">${escapeHtml(name)}</h1>` +
    (contact ? `<p class="contact">${contact}</p>` : "") +
    `</header>` +
    renderSummarySection(resume) +
    renderExperienceSection(resume, (entry) => {
      const location = entry.location?.trim() ?? "";
      return {
        primaryHtml:
          // Em dash, not a comma: "Analyst II, Software Engineering, Acme Corporation"
          // is unparseable, whereas the dash marks the title/employer boundary.
          // The location follows a middle dot for the same reason - appended
          // after a comma it is read back as part of the employer name.
          `<strong>${escapeHtml(entry.title)}</strong> — ${escapeHtml(entry.company)}` +
          (location ? ` &middot; ${escapeHtml(location)}` : ""),
      };
    }) +
    renderEducationSection(resume) +
    renderSkillsSection(resume, ", ") +
    renderCertificationsSection(resume) +
    renderExtraSections(resume);

  return htmlDocument(name, CSS, body);
}
