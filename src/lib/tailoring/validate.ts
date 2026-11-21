import { normalizeDate, resumeHaystack, type ParsedResume } from "@/lib/parsing/schema";
import { expandAliases } from "@/lib/matching/keywords";

// The safety net for AI-tailored resumes. Tailoring is an editorial operation:
// reorder, trim, rephrase-where-truthful. Anything that would put a fact on the
// resume that isn't in the master is a hard error and the output is rejected.

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function norm(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .trim();
}

const NUMBER_RE = /\d[\d,.]*\s*(?:%|k|K|M|\+)?|[$₱]\s?\d[\d,.]*/g;

function numericTokens(text: string): string[] {
  return (text.match(NUMBER_RE) ?? [])
    .map((t) => t.replace(/\s+/g, "").toLowerCase())
    // Trailing separators are sentence punctuation, not part of the figure.
    // Without this, ".NET 10, ASP.NET" yields "10," while ".NET 10 /" yields
    // "10" — the same number failing to match itself across two phrasings.
    .map((t) => t.replace(/[.,]+$/, ""))
    .filter(Boolean)
    // Bare years are almost always dates, which are validated separately.
    .filter((t) => !/^(19|20)\d{2}$/.test(t.replace(/[^0-9]/g, "")));
}

export function validateTailoredResume(
  master: ParsedResume,
  tailored: ParsedResume
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- 1. Experience identity must be a subset of the master ---
  const masterExpKeys = new Set(
    master.experience.map(
      (e) =>
        `${norm(e.company)}|${norm(e.title)}|${normalizeDate(e.startDate)}|${normalizeDate(e.endDate)}`
    )
  );
  for (const entry of tailored.experience) {
    const key = `${norm(entry.company)}|${norm(entry.title)}|${normalizeDate(entry.startDate)}|${normalizeDate(entry.endDate)}`;
    if (!masterExpKeys.has(key)) {
      errors.push(
        `Experience entry "${entry.title} at ${entry.company}" (${entry.startDate ?? "?"} – ${entry.endDate ?? "Present"}) does not match any entry in the master resume. Company, title and dates must be copied exactly.`
      );
    }
  }

  // --- 2. Education and certifications must be a subset ---
  const masterEduKeys = new Set(
    master.education.map((e) => `${norm(e.institution)}|${norm(e.degree)}`)
  );
  for (const edu of tailored.education) {
    const key = `${norm(edu.institution)}|${norm(edu.degree)}`;
    if (!masterEduKeys.has(key)) {
      errors.push(
        `Education entry "${edu.degree ?? ""} — ${edu.institution}" is not in the master resume.`
      );
    }
  }

  const masterCertNames = new Set(master.certifications.map((c) => norm(c.name)));
  for (const cert of tailored.certifications) {
    if (!masterCertNames.has(norm(cert.name))) {
      errors.push(`Certification "${cert.name}" is not in the master resume.`);
    }
  }

  // --- 3. Skills must be evidenced in the master ---
  const masterBase = resumeHaystack(master);
  const masterSkillSet = new Set(
    master.skills.flatMap((g) => g.skills.map((s) => norm(s)))
  );
  const masterAliasSet = new Set(expandAliases(masterBase));
  for (const group of tailored.skills) {
    for (const skill of group.skills) {
      const key = norm(skill);
      if (!key) continue;
      const evidenced =
        masterSkillSet.has(key) ||
        masterBase.includes(key) ||
        masterAliasSet.has(key) ||
        expandAliases(skill).some((canonical) => masterAliasSet.has(canonical));
      if (!evidenced) {
        errors.push(`Skill "${skill}" does not appear anywhere in the master resume.`);
      }
    }
  }

  // --- 4. Contact details must be untouched ---
  const contactKey = (c: ParsedResume["contact"]) =>
    JSON.stringify({
      fullName: norm(c.fullName),
      email: norm(c.email),
      phone: (c.phone ?? "").replace(/\D/g, ""),
      location: norm(c.location),
      links: [...c.links].map((l) => norm(l.url)).sort(),
    });
  if (contactKey(master.contact) !== contactKey(tailored.contact)) {
    errors.push("Contact details were modified — they must be copied from the master resume unchanged.");
  }

  // --- Warnings: figures and bullet inflation (kept, but surfaced) ---

  // The summary is the one field that is genuinely rewritten, so it is the most
  // likely place for an unsupported claim. A years-of-experience figure derived
  // by subtracting calendar years reads a Nov-2022 start as "4+ years" early in
  // 2026 — an overstatement the candidate never wrote. Any figure in the
  // rewritten summary must appear somewhere in the master.
  if (tailored.summary && norm(tailored.summary) !== norm(master.summary)) {
    const masterFigures = new Set(
      numericTokens(
        [
          master.summary ?? "",
          ...master.experience.flatMap((e) => [e.title, ...e.bullets]),
          ...master.skills.flatMap((g) => g.skills),
          ...master.certifications.map((c) => c.name),
        ].join(" ")
      )
    );
    for (const token of numericTokens(tailored.summary)) {
      if (!masterFigures.has(token)) {
        warnings.push(
          `The rewritten summary states "${token}", which does not appear anywhere in the master resume — verify before sending.`
        );
      }
    }
  }

  for (const entry of tailored.experience) {
    const masterEntry = master.experience.find(
      (e) => norm(e.company) === norm(entry.company) && norm(e.title) === norm(entry.title)
    );
    if (!masterEntry) continue;

    const masterNumbers = new Set(numericTokens(masterEntry.bullets.join(" ")));
    for (const bullet of entry.bullets) {
      for (const token of numericTokens(bullet)) {
        if (!masterNumbers.has(token)) {
          warnings.push(
            `Bullet under ${entry.company} contains a figure ("${token}") not found in the master resume — verify before sending.`
          );
        }
      }
    }
    if (entry.bullets.length > masterEntry.bullets.length) {
      warnings.push(
        `${entry.company} has ${entry.bullets.length} bullets but the master resume has ${masterEntry.bullets.length} — check for invented content.`
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings: [...new Set(warnings)] };
}
