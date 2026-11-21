import { z } from "zod";

// Canonical resume structure. This single schema drives:
//  - AI structured output (via zodOutputFormat)
//  - the resume editor form
//  - what gets stored in SQLite (inside a StoredResume envelope)
//  - PDF template rendering
// Structured-output constraints: every field required (use .nullable(), not
// .optional()), additionalProperties false everywhere, no recursion.

export const ContactInfoSchema = z.object({
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  links: z.array(
    z.object({
      label: z.string(),
      url: z.string(),
    })
  ),
});

export const ExperienceEntrySchema = z.object({
  company: z.string(),
  title: z.string(),
  location: z.string().nullable(),
  // Dates are kept exactly as written in the source resume ("Jun 2021",
  // "06/2021", "2021"). endDate null means present/current.
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  bullets: z.array(z.string()),
});

export const EducationEntrySchema = z.object({
  institution: z.string(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  graduationDate: z.string().nullable(),
  details: z.array(z.string()),
});

export const CertificationSchema = z.object({
  name: z.string(),
  issuer: z.string().nullable(),
  date: z.string().nullable(),
});

export const SkillGroupSchema = z.object({
  // null name = ungrouped/flat skill list
  name: z.string().nullable(),
  skills: z.array(z.string()),
});

export const ExtraSectionSchema = z.object({
  heading: z.string(),
  items: z.array(z.string()),
});

export const ParsedResumeSchema = z.object({
  contact: ContactInfoSchema,
  summary: z.string().nullable(),
  experience: z.array(ExperienceEntrySchema),
  education: z.array(EducationEntrySchema),
  skills: z.array(SkillGroupSchema),
  certifications: z.array(CertificationSchema),
  extraSections: z.array(ExtraSectionSchema),
});

export type ContactInfo = z.infer<typeof ContactInfoSchema>;
export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>;
export type EducationEntry = z.infer<typeof EducationEntrySchema>;
export type Certification = z.infer<typeof CertificationSchema>;
export type SkillGroup = z.infer<typeof SkillGroupSchema>;
export type ExtraSection = z.infer<typeof ExtraSectionSchema>;
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;

export function emptyParsedResume(): ParsedResume {
  return {
    contact: { fullName: "", email: null, phone: null, location: null, links: [] },
    summary: null,
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    extraSections: [],
  };
}

export function flattenSkills(resume: ParsedResume): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of resume.skills) {
    for (const skill of group.skills) {
      const key = skill.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(skill.trim());
      }
    }
  }
  return out;
}

/** All prose from the resume as one lowercase haystack (summary, bullets, titles, skills). */
export function resumeHaystack(resume: ParsedResume): string {
  const parts: string[] = [];
  if (resume.summary) parts.push(resume.summary);
  for (const exp of resume.experience) {
    parts.push(exp.title, exp.company, ...exp.bullets);
  }
  for (const edu of resume.education) {
    parts.push(edu.institution, edu.degree ?? "", edu.field ?? "", ...edu.details);
  }
  parts.push(...flattenSkills(resume));
  for (const cert of resume.certifications) parts.push(cert.name);
  for (const section of resume.extraSections) parts.push(section.heading, ...section.items);
  return parts.join("\n").toLowerCase();
}

/**
 * Normalize a free-form date string for comparison only (never for display).
 * "Jun 2021" / "06/2021" / "June 2021" -> "2021-06"; "2021" -> "2021";
 * "present"/"current"/"now"/null -> "".
 */
/**
 * Whole years of experience, floored, counting elapsed months from the earliest
 * start date.
 *
 * Subtracting calendar years overstates: a career beginning Nov 2022 reads as
 * "4 years" in Jan 2026 after only fourteen months. On a generated resume that
 * is a fabricated claim about the candidate, so the count floors and only ever
 * understates.
 */
export function yearsOfExperienceFrom(resume: ParsedResume, now = new Date()): number | null {
  const starts = resume.experience
    .map((entry) => normalizeDate(entry.startDate))
    .filter((value) => /^\d{4}-\d{2}$/.test(value))
    .map((value) => {
      const [year, month] = value.split("-").map(Number);
      return year * 12 + (month - 1);
    })
    .filter((months) => months > 1950 * 12);
  if (starts.length === 0) return null;
  const nowMonths = now.getFullYear() * 12 + now.getMonth();
  const elapsed = nowMonths - Math.min(...starts);
  const years = Math.floor(elapsed / 12);
  return years > 0 ? years : null;
}

export function normalizeDate(value: string | null): string {
  if (!value) return "";
  const v = value.trim().toLowerCase();
  if (["present", "current", "now", "ongoing"].includes(v)) return "";
  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const monthName = v.match(/([a-z]{3,9})\.?,?\s+(\d{4})/);
  if (monthName) {
    const m = MONTHS[monthName[1].slice(0, 3)];
    if (m) return `${monthName[2]}-${m}`;
  }
  const numeric = v.match(/(\d{1,2})\s*[/-]\s*(\d{4})/);
  if (numeric) return `${numeric[2]}-${numeric[1].padStart(2, "0")}`;
  const isoLike = v.match(/(\d{4})\s*[/-]\s*(\d{1,2})/);
  if (isoLike) return `${isoLike[1]}-${isoLike[2].padStart(2, "0")}`;
  const yearOnly = v.match(/(\d{4})/);
  if (yearOnly) return yearOnly[1];
  return v;
}

// Envelope stored in resumes.parsed_json.
export interface StoredResume {
  schemaVersion: 1;
  resume: ParsedResume;
  parseMethod: "ai" | "heuristic" | "manual";
  parseWarnings: string[];
}
