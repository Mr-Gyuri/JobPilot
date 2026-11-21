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

// Classic: traditional serif resume. Centered small-caps name, middle-dot
// contact line, uppercase letter-spaced section headers with a bottom rule,
// company-first entry headers with the title italicized underneath.

const CSS = `
${BASE_CSS}
body { font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt; line-height: 1.35; color: #1c1c1c; }
.name { text-align: center; font-size: 22pt; font-weight: normal; font-variant: small-caps; letter-spacing: 1px; }
.contact { text-align: center; font-size: 10pt; margin-top: 4pt; }
/*
  letter-spacing is capped at 1px: past about 1.25px, PDF text extraction splits
  every letter into its own word ("E X P E R I E N C E"), which stops any parser
  recognising the heading and hides the whole resume body from an ATS. This was
  2px and did exactly that.
*/
h2 { font-size: 11pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #444; padding-bottom: 2pt; margin-bottom: 6pt; }
.section { margin-top: 12pt; }
.entry { margin-bottom: 8pt; }
.entry-sub { font-style: italic; }
.entry-dates { font-size: 10pt; }
.skill-line { margin-bottom: 2pt; }
.skill-group { font-weight: bold; }
`;

export function renderClassicHtml(resume: ParsedResume): string {
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
        // Classic leads with the employer and puts the title underneath, so the
        // employer line is kept to the employer alone and the location travels
        // with the title. Anything appended to the employer line is read back as
        // part of the employer name - a trailing ", Manila, Philippines" became
        // part of "Acme Corporation", and an em dash there was worse still,
        // splitting the line as though the employer were a job title.
        primaryHtml: `<strong>${escapeHtml(entry.company)}</strong>`,
        subHtml:
          escapeHtml(entry.title) + (location ? ` &middot; ${escapeHtml(location)}` : ""),
      };
    }) +
    renderEducationSection(resume) +
    renderSkillsSection(resume, ", ") +
    renderCertificationsSection(resume) +
    renderExtraSections(resume);

  return htmlDocument(name, CSS, body);
}
