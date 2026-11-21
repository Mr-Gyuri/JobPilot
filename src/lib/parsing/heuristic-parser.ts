import {
  emptyParsedResume,
  type Certification,
  type EducationEntry,
  type ExperienceEntry,
  type ExtraSection,
  type ParsedResume,
  type SkillGroup,
} from "@/lib/parsing/schema";

// Deterministic resume parser. Used when no AI key is configured, and as the
// fallback whenever an AI parse fails. It never throws — a partially wrong
// parse is fine because the user reviews and corrects it in the editor.

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*";
const DATE = `(?:${MONTH}\\.?\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
const RANGE = new RegExp(`(${DATE})\\s*(?:[-–—]|to)\\s*(${DATE}|Present|Current|Now|Today)`, "i");
const DATE_ONLY = new RegExp(DATE, "i");
const BULLET_PREFIX = /^[\s]*[-•*–▪○·⁃∙>]+\s*/;
const DEGREE_RE = /\b(B\.?S\.?c?\.?|B\.?A\.?|A\.?B\.?|M\.?S\.?c?\.?|M\.?A\.?|M\.?B\.?A\.?|Ph\.?D\.?|Bachelor|Master|Associate|Doctor|Diploma|Certificate)\b/i;

// Words that mark a line as a job title rather than an employer name.
const TITLE_HINT =
  /\b(engineer|developer|programmer|architect|analyst|scientist|manager|lead|leader|director|head|officer|supervisor|coordinator|specialist|consultant|designer|administrator|administrator|associate|assistant|executive|technician|intern|trainee|agent|representative|accountant|bookkeeper|auditor|nurse|teacher|instructor|tutor|writer|editor|marketer|recruiter|strategist|planner|operator|clerk|cashier|chef|driver|paralegal|architect|founder|owner|partner|principal|president|vp|cto|ceo|coo|cfo)\b/i;

const PH_LOCATIONS = [
  "manila", "makati", "taguig", "bgc", "bonifacio global city", "quezon city", "pasig",
  "mandaluyong", "ortigas", "cebu", "davao", "iloilo", "bacolod", "baguio", "clark",
  "pampanga", "cavite", "laguna", "alabang", "muntinlupa", "paranaque", "pasay",
  "caloocan", "marikina", "antipolo", "cagayan de oro", "general santos", "zamboanga",
  "philippines", "metro manila", "ncr",
];

type SectionKind =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "certifications"
  | "extra";

interface Section {
  kind: SectionKind;
  heading: string;
  lines: string[];
}

const HEADER_PATTERNS: { kind: SectionKind; re: RegExp }[] = [
  { kind: "summary", re: /^(professional\s+summary|summary(?:\s+of\s+qualifications)?|objective|career\s+objective|profile|professional\s+profile|about(?:\s+me)?|overview)$/i },
  { kind: "experience", re: /^(work\s+experience|professional\s+experience|experience|employment(?:\s+history)?|work\s+history|career\s+history|relevant\s+experience)$/i },
  { kind: "education", re: /^(education(?:\s+and\s+training)?|educational\s+background|academic\s+background|academics)$/i },
  { kind: "skills", re: /^(technical\s+skills|core\s+competencies|skills(?:\s+(?:and|&)\s+(?:abilities|expertise))?|competencies|technologies|technical\s+expertise|tools(?:\s+(?:and|&)\s+technologies)?|key\s+skills)$/i },
  { kind: "certifications", re: /^(certifications?|licenses?(?:\s+(?:and|&)\s+certifications?)?|credentials|professional\s+certifications?|trainings?(?:\s+(?:and|&)\s+certifications?)?)$/i },
];

const EXTRA_HEADERS = /^(projects?|key\s+projects?|publications?|awards?|honors?|achievements?|volunteer(?:ing|\s+experience)?|languages?|interests?|activities|affiliations?|memberships?|references|seminars?|extra[- ]curricular.*)$/i;

/**
 * `isFirstContentLine` suppresses the ALL-CAPS fallback. Resumes very often
 * open with the person's name in capitals, and treating that as a section
 * heading loses the name entirely — the contact parser then falls through to
 * the first job title it finds in the body.
 */
function looksLikeHeader(
  line: string,
  isFirstContentLine = false
): { kind: SectionKind; heading: string } | null {
  const cleaned = line.replace(/[:–—-]+\s*$/, "").trim();
  if (!cleaned || cleaned.length > 45) return null;
  if (cleaned.split(/\s+/).length > 5) return null;
  for (const { kind, re } of HEADER_PATTERNS) {
    if (re.test(cleaned)) return { kind, heading: cleaned };
  }
  if (EXTRA_HEADERS.test(cleaned)) return { kind: "extra", heading: cleaned };
  if (isFirstContentLine) return null;
  // ALL-CAPS short lines are conventionally headings even when unrecognised.
  const isAllCaps = cleaned === cleaned.toUpperCase() && /[A-Z]{3,}/.test(cleaned);
  if (isAllCaps && !/\d{4}/.test(cleaned) && !cleaned.includes("@")) {
    return { kind: "extra", heading: cleaned };
  }
  return null;
}

/**
 * Separators used between fields on one header line — "Title · Location",
 * "City · phone · email". The middle dot in particular is very common and was
 * previously absent, so an entire contact line landed in the location field.
 */
const FIELD_SEPARATOR = /\s*[|•·∙‧]\s*|\s{3,}/;

/** True when a segment is contact data rather than a place or a job title. */
function isContactNoise(segment: string): boolean {
  if (segment.includes("@")) return true;
  if (/https?:\/\/|www\.|\.com|\.ph\b|\.io\b|\.dev\b|linkedin|github/i.test(segment)) return true;
  const digits = segment.replace(/\D/g, "");
  return digits.length >= 7; // a phone number
}

function stripBullet(line: string): string {
  return line.replace(BULLET_PREFIX, "").trim();
}

function isBulletLine(line: string): boolean {
  return BULLET_PREFIX.test(line) || /^\d+[.)]\s/.test(line);
}

/**
 * Bullet lines plus their wrapped continuations, merged back together. Only a
 * line that clearly starts mid-sentence is treated as a continuation —
 * anything starting with a capital begins a new item, otherwise every bullet
 * in a section collapses into one.
 */
function collectBullets(lines: string[]): string[] {
  const bullets: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isBulletLine(line)) {
      bullets.push(stripBullet(line));
      continue;
    }
    const startsMidSentence = /^[a-z(,;&]/.test(line);
    const previousIsOpen =
      bullets.length > 0 && /[,;&(]$|\b(?:and|or|the|a|an|of|to|with|for|in|on)$/i.test(bullets[bullets.length - 1]);
    if (bullets.length > 0 && (startsMidSentence || previousIsOpen)) {
      bullets[bullets.length - 1] = `${bullets[bullets.length - 1]} ${line}`.replace(/\s+/g, " ");
    } else {
      bullets.push(line);
    }
  }
  return bullets.map((b) => b.trim()).filter(Boolean);
}

function parseContact(lines: string[], warnings: string[]) {
  const head = lines.slice(0, 18).join("\n");
  const whole = lines.join("\n");

  const email = whole.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;

  let phone: string | null = null;
  const phoneCandidates =
    whole.match(/(?:\+?\d[\d\s().-]{7,18}\d)/g) ?? [];
  for (const candidate of phoneCandidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15 && !/^(19|20)\d{2}$/.test(digits)) {
      phone = candidate.trim();
      break;
    }
  }

  const links: { label: string; url: string }[] = [];
  const urlMatches =
    whole.match(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in\/|github\.com\/)[^\s|,;)]+/gi) ?? [];
  const otherUrls =
    whole.match(/https?:\/\/[^\s|,;)]+/gi) ?? [];
  for (const url of [...urlMatches, ...otherUrls]) {
    const lower = url.toLowerCase();
    const label = lower.includes("linkedin.com")
      ? "LinkedIn"
      : lower.includes("github.com")
        ? "GitHub"
        : "Portfolio";
    const normalized = url.replace(/[.,;]+$/, "");
    if (!links.some((l) => l.url.toLowerCase() === normalized.toLowerCase())) {
      links.push({ label, url: normalized });
    }
  }

  let fullName = "";
  // The first line with content is the name on almost every resume, so it is
  // judged as such rather than as a possible heading.
  const firstContentIndex = lines.findIndex((l) => l.trim() !== "");
  for (const [i, line] of lines.slice(0, 8).entries()) {
    const candidate = line.trim();
    if (!candidate || candidate.includes("@") || /\d/.test(candidate)) continue;
    if (looksLikeHeader(candidate, i === firstContentIndex)) continue;
    if (candidate.split(/\s+/).length > 6) continue;
    if (/^(curriculum vitae|resume|cv)$/i.test(candidate)) continue;
    // A separator means several fields share the line — a name never does.
    if (FIELD_SEPARATOR.test(candidate) && i !== firstContentIndex) continue;
    fullName = candidate.replace(/\s{2,}/g, " ");
    break;
  }
  if (!fullName) warnings.push("Could not detect a name — please fill it in.");

  let location: string | null = null;
  for (const line of lines.slice(0, 18)) {
    const lower = line.toLowerCase();
    const hit = PH_LOCATIONS.find((city) => lower.includes(city));
    if (hit) {
      // Keep only the segment naming the place; the same line usually also
      // carries the phone, email and profile links.
      const segment = line
        .split(FIELD_SEPARATOR)
        .map((s) => s.trim())
        .filter((s) => s && !isContactNoise(s))
        .find((s) => s.toLowerCase().includes(hit));
      location = (segment ?? line).replace(/^[^A-Za-z0-9]+/, "").trim();
      break;
    }
  }
  if (!location) {
    const generic = head.match(/([A-Z][a-zA-Z.\- ]+),\s*([A-Z][a-zA-Z.\- ]+|[A-Z]{2})\b/);
    if (generic) location = generic[0].trim();
  }

  return { fullName, email, phone, location, links };
}

/**
 * A short, unbulleted, non-sentence line — the shape of a company name or job
 * title, as opposed to an accomplishment bullet.
 */
function looksLikeEntryLabel(raw: string | undefined): boolean {
  const line = (raw ?? "").trim();
  if (!line) return false;
  if (isBulletLine(line)) return false;
  if (line.length > 70) return false;
  if (line.split(/\s+/).length > 9) return false;
  if (/[.!?;]$/.test(line)) return false;
  // Accomplishment bullets typically open with a past-tense verb.
  if (/^(led|designed|built|created|managed|developed|implemented|improved|reduced|increased|owned|migrated|automated|introduced|mentored|supported|delivered|launched|wrote|added|handled|ran|cut|drove|coordinated|maintained|tested|deployed|analysed|analyzed|collaborated|partnered|achieved|exceeded|trained|recognised|recognized)\b/i.test(line)) {
    return false;
  }
  return true;
}

function parseExperience(lines: string[], warnings: string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  // Each date range starts a new entry; the range line plus up to two lines
  // above it form the header (title / company / location).
  const rangeIndexes: number[] = [];
  lines.forEach((line, i) => {
    if (RANGE.test(line)) rangeIndexes.push(i);
  });

  if (rangeIndexes.length === 0) {
    const bullets = collectBullets(lines);
    if (bullets.length > 0) {
      warnings.push("No dates found in the experience section — entries may need manual fixing.");
      entries.push({
        company: "",
        title: bullets[0] ?? "",
        location: null,
        startDate: null,
        endDate: null,
        bullets: bullets.slice(1),
      });
    }
    return entries;
  }

  // How many lines immediately above each date range read like header material
  // rather than bullet prose. Computed up front so an entry's body never eats
  // into the next entry's header — and, just as importantly, so real trailing
  // bullets are not mistaken for one.
  const headerLinesBefore = rangeIndexes.map((rangeAt, r) => {
    const floor = r === 0 ? 0 : rangeIndexes[r - 1] + 1;
    let count = 0;
    for (let i = rangeAt - 1; i >= floor && count < 2; i--) {
      if (!looksLikeEntryLabel(lines[i])) break;
      count++;
    }
    return count;
  });

  for (let r = 0; r < rangeIndexes.length; r++) {
    const rangeAt = rangeIndexes[r];
    const nextRangeAt = r + 1 < rangeIndexes.length ? rangeIndexes[r + 1] : lines.length;

    const rangeLine = lines[rangeAt];
    const match = rangeLine.match(RANGE)!;
    const startDate = match[1].trim();
    const rawEnd = match[2].trim();
    const endDate = /present|current|now|today/i.test(rawEnd) ? null : rawEnd;

    // Header parts can sit before the date line ("Title\nCompany — dates") or
    // after it ("Company .... dates\nTitle"), depending on the layout.
    const before = lines
      .slice(rangeAt - headerLinesBefore[r], rangeAt)
      .map((l) => l.trim())
      .filter(Boolean);

    const onRangeLine = rangeLine.replace(RANGE, "").replace(/[|•,;\s–—-]+$/, "").trim();

    // One following line counts as a header when it reads like a label. Blank
    // lines are stepped over: the common two-line layout ("Company + dates",
    // blank, "Title · Location") would otherwise lose the title entirely.
    let bodyStart = rangeAt + 1;
    const after: string[] = [];
    let probe = rangeAt + 1;
    while (probe < nextRangeAt && lines[probe].trim() === "") probe++;
    if (probe < nextRangeAt && looksLikeEntryLabel(lines[probe])) {
      after.push(lines[probe].trim());
      bodyStart = probe + 1;
    }

    const headerText = [...before, onRangeLine, ...after]
      .map((l) => l.replace(RANGE, "").replace(/[|•,;\s]+$/, "").trim())
      .filter(Boolean);

    let title = "";
    let company = "";
    let location: string | null = null;

    const splitLine = headerText.find((l) => /\s+(?:at|@)\s+|\s+[|–—]\s+/.test(l));
    if (splitLine) {
      const parts = splitLine.split(/\s+(?:at|@)\s+|\s+[|–—]\s+/).map((p) => p.trim());
      title = parts[0] ?? "";
      company = parts[1] ?? "";
      if (parts[2]) location = parts[2];
    } else if (headerText.length >= 2) {
      // Whichever part reads like a job title is the title; the other is the
      // employer. Falls back to first=title, second=company.
      const titleIndex = headerText.findIndex((l) => TITLE_HINT.test(l));
      if (titleIndex >= 0) {
        title = headerText[titleIndex];
        company = headerText.find((_, i) => i !== titleIndex) ?? "";
        location = headerText.filter((_, i) => i !== titleIndex && headerText[i] !== company)[0] ?? null;
      } else {
        title = headerText[0];
        company = headerText[1];
        if (headerText[2]) location = headerText[2];
      }
    } else if (headerText.length === 1) {
      const commaParts = headerText[0].split(",").map((p) => p.trim());
      // "Title, Company" and a job title that simply contains a comma look
      // identical here. When the text after the comma reads like part of a role
      // rather than an employer, keep the whole line as the title: splitting
      // "Analyst II, Software Engineering" gave title "Analyst II" at employer
      // "Software Engineering".
      const remainderIsRoleWords =
        commaParts.length >= 2 && commaParts.slice(1).every((p) => TITLE_HINT.test(p));
      if (commaParts.length >= 2 && !remainderIsRoleWords) {
        title = commaParts[0];
        company = commaParts[1];
        if (commaParts[2]) location = commaParts.slice(2).join(", ");
      } else if (TITLE_HINT.test(headerText[0])) {
        title = headerText[0];
      } else {
        company = headerText[0];
      }
    }

    // "Software Engineer · Manila, Philippines (Hybrid)" is one line holding two
    // fields; without splitting it the location ends up inside the job title,
    // and the title is copied verbatim onto every tailored resume.
    if (!location && FIELD_SEPARATOR.test(title)) {
      const parts = title.split(FIELD_SEPARATOR).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        title = parts[0];
        location = parts.slice(1).join(", ");
      }
    }
    if (location === null && FIELD_SEPARATOR.test(company)) {
      const parts = company.split(FIELD_SEPARATOR).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        company = parts[0];
        location = parts.slice(1).join(", ");
      }
    }

    if (!company || !title) {
      warnings.push(
        `Could not fully separate company and title for "${title || company || "an entry"}" — check it below.`
      );
    }

    const reservedForNext = r + 1 < rangeIndexes.length ? headerLinesBefore[r + 1] : 0;
    const bodyEnd = Math.max(bodyStart, nextRangeAt - reservedForNext);
    const bullets = collectBullets(lines.slice(bodyStart, bodyEnd));

    entries.push({ company, title, location, startDate, endDate, bullets });
  }

  return entries;
}

function parseEducation(lines: string[]): EducationEntry[] {
  const entries: EducationEntry[] = [];
  const blocks: string[][] = [];
  let current: string[] = [];

  // A new entry starts when the line repeats something the current block
  // already has — a second degree, or a second graduation date. Splitting on
  // every degree line would separate a degree from its own institution.
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const hasDegree = DEGREE_RE.test(line);
    const hasDate = DATE_ONLY.test(line);
    const blockHasDegree = current.some((l) => DEGREE_RE.test(l));
    const blockHasDate = current.some((l) => DATE_ONLY.test(l));
    const startsNew =
      current.length > 0 && ((hasDegree && blockHasDegree) || (hasDate && blockHasDate));
    if (startsNew) {
      blocks.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  for (const block of blocks) {
    const degreeLine = block.find((l) => DEGREE_RE.test(l)) ?? "";
    // The institution is conventionally the first non-degree line, even when it
    // carries the graduation year on the same line.
    let institutionLine = block.find((l) => l !== degreeLine) ?? "";

    // "STI College — BS Computer Science" puts both on the degree line. Without
    // splitting it, the institution is taken from the NEXT line, which is
    // usually the campus and honours — so the degree line kept the school name
    // and the school field held "Sta. Mesa, Manila · Magna Cum Laude".
    let degreeOnly = degreeLine;
    if (degreeLine) {
      const withoutDate = degreeLine.replace(DATE_ONLY, "").trim();
      const split = withoutDate.split(/\s+[–—]\s+|\s+[-]\s+/);
      if (split.length >= 2) {
        const degreeSide = split.findIndex((p) => DEGREE_RE.test(p));
        if (degreeSide > 0) {
          institutionLine = split.slice(0, degreeSide).join(" - ").trim();
          degreeOnly = split.slice(degreeSide).join(" - ").trim();
        }
      }
    }

    const dateLine = block.find((l) => DATE_ONLY.test(l));
    const graduationDate = dateLine?.match(DATE_ONLY)?.[0]?.trim() ?? null;

    let degree: string | null = null;
    let field: string | null = null;
    if (degreeOnly) {
      const cleaned = degreeOnly.replace(DATE_ONLY, "").replace(/[,|•]+\s*$/, "").trim();
      const inMatch = cleaned.match(/^(.*?)\s+(?:in|of)\s+(.*)$/i);
      if (inMatch) {
        degree = inMatch[1].trim();
        field = inMatch[2].trim();
      } else {
        const commaParts = cleaned.split(",").map((p) => p.trim());
        degree = commaParts[0] || null;
        field = commaParts[1] ?? null;
      }
    }

    const details = block
      .filter((l) => l !== degreeLine && l !== institutionLine)
      .map((l) => stripBullet(l))
      .filter(Boolean);

    const institution = institutionLine
      .replace(DATE_ONLY, "")
      .replace(/[,|\t]+\s*$/, "")
      .trim();

    if (degree || institution) {
      entries.push({ institution, degree, field, graduationDate, details });
    }
  }

  return entries;
}

/**
 * Split a skills line on its separators while ignoring any inside brackets, so
 * "LLM integration (Claude, ChatGPT)" stays one skill instead of becoming
 * "LLM integration (Claude" and "ChatGPT)".
 */
function splitSkillList(line: string, separators: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of line) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
    if (depth === 0 && separators.includes(ch)) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function parseSkills(lines: string[]): SkillGroup[] {
  const groups: SkillGroup[] = [];
  const flat: string[] = [];
  const seen = new Set<string>();

  const push = (target: string[], value: string) => {
    const skill = stripBullet(value).replace(/[.;]+$/, "").trim();
    if (!skill || skill.length > 60) return;
    const key = skill.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    target.push(skill);
  };

  for (const raw of lines) {
    const line = stripBullet(raw.trim());
    if (!line) continue;
    // "Languages: JavaScript, Python" -> a named group.
    const labelled = line.match(/^([A-Za-z][A-Za-z0-9 /&+.#-]{1,32}?)\s*:\s*(.+)$/);
    if (labelled) {
      const items: string[] = [];
      for (const part of splitSkillList(labelled[2], ",;•|/·–—")) push(items, part);
      if (items.length > 0) groups.push({ name: labelled[1].trim(), skills: items });
      continue;
    }
    for (const part of splitSkillList(line, ",;•|·–—")) push(flat, part);
  }

  if (flat.length > 0) groups.push({ name: null, skills: flat });
  return groups;
}

function parseCertifications(lines: string[]): Certification[] {
  const certs: Certification[] = [];
  for (const raw of lines) {
    const line = stripBullet(raw.trim());
    if (!line) continue;
    // Take the trailing date (with its separating comma) off first so the
    // "Name (Issuer)" parentheses stay balanced.
    const trailingDate = line.match(new RegExp(`,?\\s*(${DATE})\\s*$`, "i"));
    const date = trailingDate ? trailingDate[1].trim() : null;
    const withoutDate = (trailingDate ? line.slice(0, trailingDate.index) : line)
      .replace(/[,;|]\s*$/, "")
      .trim();

    const parenIssuer = withoutDate.match(/^(.*?)\s*\((.+)\)\s*$/);
    let name = withoutDate;
    let issuer: string | null = null;
    if (parenIssuer) {
      name = parenIssuer[1].trim();
      issuer = parenIssuer[2].trim();
    } else {
      const dashed = withoutDate.split(/\s+[-–—]\s+/);
      if (dashed.length >= 2) {
        name = dashed[0].trim();
        issuer = dashed.slice(1).join(" - ").trim() || null;
      }
    }
    if (name) certs.push({ name, issuer, date });
  }
  return certs;
}

export function parseResumeHeuristic(rawText: string): {
  resume: ParsedResume;
  warnings: string[];
} {
  const warnings: string[] = [];
  const resume = emptyParsedResume();

  try {
    const lines = rawText.split("\n").map((l) => l.replace(/\s+$/, ""));
    const nonEmpty = lines.filter((l) => l.trim());
    if (nonEmpty.length === 0) {
      warnings.push("The document appears to be empty.");
      return { resume, warnings };
    }

    resume.contact = parseContact(nonEmpty, warnings);

    // Split the document into sections at heading lines.
    const sections: Section[] = [];
    let preamble: string[] = [];
    let currentSection: Section | null = null;

    const firstContentLine = lines.findIndex((l) => l.trim() !== "");
    for (const [index, line] of lines.entries()) {
      const trimmed = line.trim();
      // The opening line is the name, not a heading — see looksLikeHeader.
      const header = trimmed ? looksLikeHeader(trimmed, index === firstContentLine) : null;
      if (header) {
        if (currentSection) sections.push(currentSection);
        currentSection = { kind: header.kind, heading: header.heading, lines: [] };
        continue;
      }
      if (currentSection) {
        currentSection.lines.push(line);
      } else {
        preamble.push(line);
      }
    }
    if (currentSection) sections.push(currentSection);

    // Anything before the first heading that isn't contact info is summary-ish.
    const contactValues = [
      resume.contact.fullName,
      resume.contact.email ?? "",
      resume.contact.phone ?? "",
      resume.contact.location ?? "",
      ...resume.contact.links.map((l) => l.url),
    ].filter(Boolean);
    preamble = preamble.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return !contactValues.some((v) => trimmed.includes(v));
    });

    for (const section of sections) {
      const body = section.lines;
      switch (section.kind) {
        case "summary":
          resume.summary = collectBullets(body).join(" ").trim() || null;
          break;
        case "experience":
          resume.experience.push(...parseExperience(body, warnings));
          break;
        case "education":
          resume.education.push(...parseEducation(body));
          break;
        case "skills":
          resume.skills.push(...parseSkills(body));
          break;
        case "certifications":
          resume.certifications.push(...parseCertifications(body));
          break;
        default: {
          const items = collectBullets(body);
          if (items.length > 0) {
            const extra: ExtraSection = { heading: section.heading, items };
            resume.extraSections.push(extra);
          }
        }
      }
    }

    if (!resume.summary && preamble.length > 0) {
      resume.summary = preamble.join(" ").replace(/\s+/g, " ").trim() || null;
    }
    if (resume.experience.length === 0) {
      warnings.push("No work experience detected — add entries manually below.");
    }
    if (resume.skills.length === 0) {
      warnings.push("No skills section detected — add your skills below.");
    }
  } catch (err) {
    // Never fail the upload: the editor is the safety net.
    warnings.push(
      `Automatic parsing hit a problem (${err instanceof Error ? err.message : "unknown error"}). Please fill in the fields below.`
    );
    if (!resume.summary) resume.summary = rawText.slice(0, 2000);
  }

  return { resume, warnings };
}
