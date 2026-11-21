import type { ContactInfo } from "@/lib/parsing/schema";
import { BASE_CSS, contactParts, escapeHtml, htmlDocument } from "@/lib/pdf/templates/shared";

// Standard business letter: sender block, date, recipient, subject line,
// salutation, body paragraphs, signature block.

const CSS = `
${BASE_CSS}
body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.5; color: #1c1c1c; }
.sender-name { font-size: 14pt; font-weight: bold; }
.sender-contact { font-size: 10pt; margin-top: 2pt; }
.date { margin-top: 20pt; }
.recipient { margin-top: 16pt; }
.re { margin-top: 12pt; font-weight: bold; }
.salutation { margin-top: 12pt; }
.body p { margin-top: 10pt; }
.closing { margin-top: 16pt; }
.signature { margin-top: 24pt; }
`;

export function renderCoverLetterHtml(opts: {
  contact: ContactInfo;
  body: string;
  jobTitle: string;
  company: string | null;
  date: string;
}): string {
  const name = opts.contact.fullName.trim() || "Cover Letter";
  const contactLine = contactParts(opts.contact).map(escapeHtml).join(" · ");

  const paragraphs = opts.body
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, "<br>")}</p>`)
    .join("");

  const company = opts.company?.trim() ?? "";

  const body =
    `<header>` +
    `<p class="sender-name">${escapeHtml(name)}</p>` +
    (contactLine ? `<p class="sender-contact">${contactLine}</p>` : "") +
    `</header>` +
    `<p class="date">${escapeHtml(opts.date)}</p>` +
    `<div class="recipient"><p>Hiring Team</p>` +
    (company ? `<p>${escapeHtml(company)}</p>` : "") +
    `</div>` +
    `<p class="re">Re: ${escapeHtml(opts.jobTitle)}</p>` +
    `<p class="salutation">Dear Hiring Team,</p>` +
    `<div class="body">${paragraphs}</div>` +
    `<p class="closing">Sincerely,</p>` +
    `<p class="signature">${escapeHtml(name)}</p>`;

  return htmlDocument(`Cover Letter — ${name}`, CSS, body);
}
