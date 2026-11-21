import { generateStructured } from "@/lib/ai/structured";
import { ParsedResumeSchema, type ParsedResume } from "@/lib/parsing/schema";

const SYSTEM = `You are a resume parsing engine. You convert raw resume text (extracted from a PDF or Word document) into structured JSON.

Rules:
- Extract ONLY information that is present in the text. Never invent, infer, or embellish values. If a field is not present, use null (or an empty array).
- Preserve the original wording of bullet points exactly, minus bullet characters, and fix only obvious extraction artifacts such as broken hyphenation across line breaks or duplicated whitespace.
- Dates: copy them as written in the resume (e.g. "Jun 2021", "06/2021", "2021"). If a role is current ("Present", "Current", "Now"), set endDate to null.
- Contact links: classify URLs as "LinkedIn", "GitHub", "Portfolio", or "Other".
- Skills: preserve the resume's own grouping (e.g. "Languages:", "Tools:") as skill groups. If the resume lists skills flat, return one group with name null.
- Each entry in a group's skills array must be ONE skill, not a sentence. When a resume writes a group as prose ("Experienced in HTML, CSS, and React for building responsive apps"), extract the individual skills: ["HTML", "CSS", "React"]. Drop the connecting words - never return a whole sentence as a single skill. Keep a qualifier only when it is part of the name, like "React Native" or "LLM integration (Claude, ChatGPT)".
- Sections that do not fit contact/summary/experience/education/skills/certifications (e.g. Projects, Publications, Awards, Volunteering) go into extraSections with their original heading.
- Text extracted from PDFs may have jumbled ordering from multi-column layouts. Use your judgment to reassemble entries, but never fabricate content to fill gaps.`;

export async function parseResumeWithAI(rawText: string): Promise<ParsedResume> {
  return generateStructured({
    schema: ParsedResumeSchema,
    schemaName: "parsed_resume",
    system: SYSTEM,
    maxTokens: 8192,
    user: `Parse this resume:\n\n<resume_text>\n${rawText}\n</resume_text>`,
  });
}
