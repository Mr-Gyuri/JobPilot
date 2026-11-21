import { z } from "zod";
import { generateStructured } from "@/lib/ai/structured";
import { normalizeText } from "@/lib/ingest/extractText";
import type { ExtractedJob } from "@/lib/types";

const ExtractedJobSchema = z.object({
  title: z.string(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  workMode: z.enum(["remote", "hybrid", "onsite"]).nullable(),
  employmentType: z.string().nullable(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.string().nullable(),
  salaryPeriod: z.string().nullable(),
  responsibilities: z.array(z.string()),
  requirements: z.array(z.string()),
  skills: z.array(z.string()),
});

const SYSTEM = `You extract structured job posting data from raw page text or a pasted job description.

Rules:
- Extract only what is present. Never invent a company, location, or salary that the text does not state. Use null when something is absent.
- salaryMin / salaryMax are plain numbers in the posting's own currency (expand "30k" to 30000). salaryCurrency is a code such as PHP or USD. salaryPeriod is one of hour, day, week, month, year.
- responsibilities and requirements are the posting's own bullet points, verbatim where possible, with bullet characters removed.
- skills: the concrete tools, technologies and competencies the posting asks for.
- workMode: remote, hybrid or onsite — only when the text says so.
- If the text is not a job posting at all, still extract the best title you can and leave the other fields empty.`;

export async function extractJobWithAI(text: string): Promise<ExtractedJob> {
  const clean = normalizeText(text).slice(0, 15_000);
  const result = await generateStructured({
    schema: ExtractedJobSchema,
    schemaName: "extracted_job",
    system: SYSTEM,
    maxTokens: 4096,
    user: `Extract the job posting details from this text:\n\n<page_text>\n${clean}\n</page_text>`,
  });
  return {
    ...result,
    title: result.title.trim() || "Untitled role",
    rawText: clean,
    extractionMethod: "ai",
  };
}
