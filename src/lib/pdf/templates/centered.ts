import type { ParsedResume } from "@/lib/parsing/schema";
import {
  BASE_CSS,
  contactParts,
  escapeHtml,
  formatDateRange,
  htmlDocument,
  renderBullets,
  renderCertificationsSection,
  renderEducationSection,
  renderExtraSections,
  renderSectionBlock,
  renderSummarySection,
} from "@/lib/pdf/templates/shared";

// Centered: the layout most Philippine graduates arrive with from Canva and
// similar builders - centered name, one pipe-separated contact line, uppercase
// section headings ruled underneath, and role/employer/dates stacked on three
// lines rather than dates floated right.
//
// Two of those choices are deliberate departures from the other templates:
//
//   Stacked entry headers. Every other template puts dates on the same flex
//   line as the role. Stacking them keeps long "Senior Full-Stack Software
//   Engineer (Childcare SaaS Platform)" titles off a second wrapped line, and
//   it is how the builders lay it out, so the result looks familiar.
//
//   Bulleted skills with a bold lead-in, matching the bullets used everywhere
//   else on the page instead of switching to paragraphs for one section.
//
// Sized to fit a typical 3-role, 3-project resume on one page.

const CSS = `
${BASE_CSS}
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10pt;
  line-height: 1.26;
  color: #111;
}
header { text-align: center; margin-bottom: 9pt; }
/*
  No text-transform on the name. CSS uppercasing changes the glyphs a PDF text
  extractor sees, so "Maria Santos Reyes" would reach an ATS as
  "MARIA SANTOS REYES" - not the name she typed. Section headings are template
  chrome and safe to transform; the name is user data and is rendered as stored.
  A resume already written in capitals still comes out in capitals.
*/
.name { font-size: 18pt; font-weight: bold; letter-spacing: 0.5pt; }
.contact { font-size: 10pt; margin-top: 2.5pt; }
h2 {
  font-size: 11pt;
  font-weight: bold;
  letter-spacing: 0.4pt;
  text-transform: uppercase;
  margin-bottom: 3pt;
  padding-bottom: 2pt;
  border-bottom: 1px solid #222;
}
.section { margin-top: 8pt; }
.entry { margin-bottom: 5pt; }
.entry-role { font-weight: bold; }
.entry-dates { font-weight: normal; }
/* Education keeps the shared right-aligned header; bold the year to match. */
.section-education .entry-dates { font-weight: bold; }
ul.bullets { padding-left: 1.05em; margin-top: 1.5pt; }
li { margin: 0 0 1.5pt; }
.skill-group { font-weight: bold; }
.summary { margin-top: 1pt; }
`;

/**
 * Experience with the header stacked over three lines. The shared renderer
 * floats dates right on the role line, which is the one thing this layout does
 * differently, so it is rebuilt here rather than adding a mode to the helper
 * the other three templates depend on.
 */
function renderStackedExperience(resume: ParsedResume): string {
  if (resume.experience.length === 0) return "";
  const entries = resume.experience.map((entry) => {
    const dates = formatDateRange(entry.startDate, entry.endDate);
    const location = entry.location?.trim() ?? "";
    return (
      `<div class="entry">` +
      `<div class="entry-role">${escapeHtml(entry.title)}</div>` +
      (entry.company.trim()
        ? `<div>${escapeHtml(entry.company)}${location ? ` &middot; ${escapeHtml(location)}` : ""}</div>`
        : location
          ? `<div>${escapeHtml(location)}</div>`
          : "") +
      (dates ? `<div class="entry-dates">${escapeHtml(dates)}</div>` : "") +
      renderBullets(entry.bullets) +
      `</div>`
    );
  });
  return renderSectionBlock("Experience", entries.join(""));
}

/** Skills as bullets with a bold group lead-in, matching the rest of the page. */
function renderBulletedSkills(resume: ParsedResume): string {
  const items = resume.skills
    .map((group) => ({
      name: group.name?.trim() || null,
      skills: group.skills.map((s) => s.trim()).filter(Boolean),
    }))
    .filter((group) => group.skills.length > 0)
    .map(
      (group) =>
        `<li>` +
        (group.name ? `<span class="skill-group">${escapeHtml(group.name)}:</span> ` : "") +
        group.skills.map(escapeHtml).join(", ") +
        `</li>`
    );
  if (items.length === 0) return "";
  return renderSectionBlock("Skills", `<ul class="bullets">${items.join("")}</ul>`);
}

export function renderCenteredHtml(resume: ParsedResume): string {
  const name = resume.contact.fullName.trim() || "Resume";
  // Location stays on the contact line here, unlike modern's subtitle.
  const contact = contactParts(resume.contact, true).map(escapeHtml).join(" | ");

  const body =
    `<header>` +
    `<h1 class="name">${escapeHtml(name)}</h1>` +
    (contact ? `<p class="contact">${contact}</p>` : "") +
    `</header>` +
    renderSummarySection(resume) +
    renderStackedExperience(resume) +
    // Tagged so the year can be bolded without affecting other sections.
    renderEducationSection(resume).replace(
      `<section class="section">`,
      `<section class="section section-education">`
    ) +
    renderBulletedSkills(resume) +
    renderCertificationsSection(resume) +
    renderExtraSections(resume);

  return htmlDocument(name, CSS, body);
}
