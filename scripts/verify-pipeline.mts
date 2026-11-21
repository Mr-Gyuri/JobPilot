/**
 * End-to-end verification of the resume/job pipeline without the UI.
 *   npx tsx scripts/verify-pipeline.mts   (or: node scripts/verify-pipeline.mts)
 *
 * Exercises: PDF + DOCX text extraction, resume parsing, job extraction from
 * pasted text, match analysis, tailoring with anti-fabrication validation,
 * cover letter generation, all three PDF templates, and interview prep.
 */
import fs from "node:fs";
import path from "node:path";

const FIXTURES = process.argv[2];
if (!FIXTURES) {
  console.error("usage: node scripts/verify-pipeline.mts <fixtures-dir>");
  process.exit(1);
}

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
}

const { parseResumeFile } = await import("../src/lib/parsing/index.ts");
const { ingestFromText } = await import("../src/lib/ingest/pipeline.ts");
const { analyzeMatch } = await import("../src/lib/matching/index.ts");
const { tailorResume, generateCoverLetter } = await import("../src/lib/tailoring/index.ts");
const { validateTailoredResume } = await import("../src/lib/tailoring/validate.ts");
const { generateResumePdf, generateCoverLetterPdf } = await import("../src/lib/pdf/index.ts");
const { generateInterviewPrep } = await import("../src/lib/interview/index.ts");
const { isAIAvailable } = await import("../src/lib/config.ts");

console.log(`\nAI key configured: ${isAIAvailable()}\n`);

// ---------- 1. PDF resume ----------
console.log("1. PDF resume parsing");
const pdfBuffer = fs.readFileSync(path.join(FIXTURES, "maria-reyes-resume.pdf"));
const pdfOutcome = await parseResumeFile(pdfBuffer, "maria-reyes-resume.pdf");
const maria = pdfOutcome.resume;
check("extracted raw text", pdfOutcome.rawText.length > 1000, `${pdfOutcome.rawText.length} chars`);
check("found name", /Maria/i.test(maria.contact.fullName), maria.contact.fullName);
check("found email", maria.contact.email === "maria.reyes@example.com", String(maria.contact.email));
check("found phone", (maria.contact.phone ?? "").includes("917"), String(maria.contact.phone));
check("found links", maria.contact.links.length >= 2, `${maria.contact.links.length} links`);
check("found summary", (maria.summary ?? "").length > 50);
check("found >=3 roles", maria.experience.length >= 3, `${maria.experience.length} roles`);
check(
  "first role has company+dates",
  !!maria.experience[0]?.company && !!maria.experience[0]?.startDate,
  `${maria.experience[0]?.title} @ ${maria.experience[0]?.company} (${maria.experience[0]?.startDate})`
);
check("current role endDate is null", maria.experience[0]?.endDate === null);
check("all 5 bullets captured", maria.experience[0]?.bullets.length === 5, `${maria.experience[0]?.bullets.length} bullets`);
check("no bullet leaked into a company field",
  maria.experience.every((e) => e.company.length < 60 && !/[.;]$/.test(e.company)),
  maria.experience.map((e) => e.company).join(" | "));
check("every role has a title and company",
  maria.experience.every((e) => e.title.length > 0 && e.company.length > 0));
check("exactly 1 education entry", maria.education.length === 1, `${maria.education.length}`);
check("education degree + field parsed",
  maria.education[0]?.degree === "BS" && maria.education[0]?.field === "Computer Science",
  `${maria.education[0]?.degree} / ${maria.education[0]?.field}`);
const mariaSkills = maria.skills.flatMap((g) => g.skills);
check("found skills", mariaSkills.length >= 8, `${mariaSkills.length} skills`);
check("skill groups preserved", maria.skills.length >= 4, `${maria.skills.length} groups`);
check("exactly 2 certifications", maria.certifications.length === 2, `${maria.certifications.length}`);
check("cert issuer parsed",
  maria.certifications[0]?.issuer === "Amazon Web Services",
  String(maria.certifications[0]?.issuer));
check("no page-break artifacts",
  !JSON.stringify(maria).includes(" of 2"),
  "pdf page markers stripped");
check("extra section captured", maria.extraSections.some((s) => /project/i.test(s.heading)));
console.log(`  parse method: ${pdfOutcome.method}, warnings: ${pdfOutcome.warnings.length}`);

// ---------- 2. DOCX resume ----------
console.log("\n2. DOCX resume parsing");
const docxBuffer = fs.readFileSync(path.join(FIXTURES, "juan-cruz-resume.docx"));
const docxOutcome = await parseResumeFile(docxBuffer, "juan-cruz-resume.docx");
const juan = docxOutcome.resume;
check("extracted raw text", docxOutcome.rawText.length > 500, `${docxOutcome.rawText.length} chars`);
check("found name", /Juan/i.test(juan.contact.fullName), juan.contact.fullName);
check("found email", juan.contact.email === "juan.cruz@example.com", String(juan.contact.email));
check("found roles", juan.experience.length >= 2, `${juan.experience.length} roles`);
check("found skills", juan.skills.flatMap((g) => g.skills).length >= 5);

// ---------- 2b. Header layouts the heuristic parser used to get wrong ----------
// Every assertion here is a bug found on a real resume: an ALL-CAPS name was
// swallowed as a section heading (so the name became the first job title found
// in the body), a middle-dot contact line landed whole in the location field,
// "Institution — Degree" put the school in the degree field and the campus in
// the school field, and a blank line between the company and title lines lost
// the title and left it as a bullet.
console.log("\n2b. Header layout regressions");
{
  const { parseResumeHeuristic } = await import("../src/lib/parsing/heuristic-parser.ts");
  const sample = [
    "JUAN DELA CRUZ",
    "",
    "Software Engineer  |  Backend Systems",
    "",
    "Metro Manila, Philippines   ·   +63 921 000 0000   ·   juan@example.com   ·   github.com/juan",
    "",
    "SUMMARY",
    "",
    "Backend engineer with 5 years of experience.",
    "",
    "EXPERIENCE",
    "",
    "Acme CorporationNov 2022 – Present",
    "",
    "Senior Software Engineer · Taguig City, Philippines",
    "",
    "Built payment services in C# handling 2M requests a day.",
    "Reduced deploy time by automating the release pipeline.",
    "",
    "EDUCATION",
    "",
    "STI College — BS Computer ScienceAug 2020",
    "",
    "Sta. Mesa, Manila · Cumulative GWA 1.25, Cum Laude",
    "",
    "SKILLS",
    "",
    "Languages: C#, TypeScript",
  ].join("\n");

  const { resume: r, warnings: w } = parseResumeHeuristic(sample);

  check("ALL-CAPS name is the name, not a heading", r.contact.fullName === "JUAN DELA CRUZ",
    r.contact.fullName);
  check("name is not a section heading",
    !r.extraSections.some((s) => /JUAN/i.test(s.heading)),
    r.extraSections.map((s) => s.heading).join(",") || "(none)");
  check("location excludes phone, email and links",
    r.contact.location === "Metro Manila, Philippines", String(r.contact.location));
  check("email still found", r.contact.email === "juan@example.com", String(r.contact.email));
  check("phone still found", (r.contact.phone ?? "").includes("921"), String(r.contact.phone));

  const role = r.experience[0];
  check("title taken from across a blank line", role?.title === "Senior Software Engineer",
    String(role?.title));
  check("company parsed off the glued date line", role?.company === "Acme Corporation",
    String(role?.company));
  check("role location split off the title",
    role?.location === "Taguig City, Philippines", String(role?.location));
  check("title line is not left as a bullet",
    !role?.bullets.some((b) => /Senior Software Engineer/.test(b)),
    `${role?.bullets.length} bullets`);
  check("real bullets kept", role?.bullets.length === 2, `${role?.bullets.length}`);

  const edu = r.education[0];
  check("institution from the left of the dash", edu?.institution === "STI College",
    String(edu?.institution));
  check("degree from the right of the dash", edu?.degree === "BS Computer Science",
    String(edu?.degree));
  check("graduation date read through the glue", edu?.graduationDate === "Aug 2020",
    String(edu?.graduationDate));
  check("campus and honours become details",
    (edu?.details ?? []).some((d) => /Cum Laude/.test(d)), JSON.stringify(edu?.details));

  check("a clean layout produces no warnings", w.length === 0, w.join(" | "));

  // A comma inside brackets is part of the skill, not a separator between two.
  const bracketed = parseResumeHeuristic(
    ["A B", "", "SKILLS", "", "AI: LLM integration (Claude, ChatGPT), REST APIs, MCP (Model Context Protocol)"].join("\n")
  ).resume;
  const aiSkills = bracketed.skills.find((g) => /ai/i.test(g.name ?? ""))?.skills ?? [];
  check("comma inside brackets does not split a skill",
    aiSkills.includes("LLM integration (Claude, ChatGPT)"), JSON.stringify(aiSkills));
  check("real separators still split", aiSkills.length === 3, `${aiSkills.length}`);
}

// ---------- 2c. Word run-boundary seams ----------
// Word puts right-aligned dates in a separate run, and raw text extraction joins
// runs with nothing between them. The seam reached the generated PDF as
// "BS Computer ScienceAug 2022" and "MCP server (.NET 10 / C#)2026".
console.log("\n2c. Run-boundary seams");
{
  const { extractResumeText } = await import("../src/lib/parsing/extract.ts");
  const docx = fs.readFileSync(path.join(FIXTURES, "juan-cruz-resume.docx"));
  const text = await extractResumeText(docx, "juan-cruz-resume.docx");
  check("no month name glued to a word",
    !/[a-z](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/.test(text),
    (text.match(/[a-z](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/) ?? ["clean"])[0]);
  check("no year glued to a closing bracket", !/[)\]](?:19|20)\d{2}\b/.test(text));
  // Version numbers must survive: "Windows 10", ".NET 8", "covid19 2020".
  check("a legitimate number after a space is untouched",
    !/Windows {2,}10|\.NET {2,}\d/.test(text));
}

// ---------- 2d. AI provider selection ----------
// Two providers share one AI_MODEL setting and one isAIAvailable() check, so the
// wiring has to be exact: a stale model name from the other provider would be
// sent to an API that has never heard of it.
console.log("\n2d. AI provider selection");
{
  const { setConfigValue } = await import("../src/lib/config.ts");
  const cfg = await import("../src/lib/config.ts");
  const { resolveProvider, modelFor, defaultModelFor } = await import("../src/lib/ai/provider.ts");
  const { toGeminiSchema } = await import("../src/lib/ai/providers/gemini.ts");

  const reset = () => {
    for (const k of ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "AI_MODEL"] as const) {
      setConfigValue(k, "");
    }
  };

  reset();
  check("no key means no provider", resolveProvider() === null);
  check("no key means AI unavailable", cfg.isAIAvailable() === false);

  setConfigValue("GEMINI_API_KEY", "g-key");
  check("gemini key alone selects gemini", resolveProvider() === "gemini");
  check("a gemini key counts as AI available", cfg.isAIAvailable() === true);
  check("gemini gets a gemini default model", modelFor("gemini").startsWith("gemini"),
    modelFor("gemini"));

  // The exact trap: a model left over from the other provider.
  setConfigValue("AI_MODEL", "claude-sonnet-5");
  check("a claude model name is ignored for gemini",
    modelFor("gemini") === defaultModelFor("gemini"), modelFor("gemini"));
  setConfigValue("AI_MODEL", "gemini-3.5-flash");
  check("a gemini model name is honoured", modelFor("gemini") === "gemini-3.5-flash");
  setConfigValue("AI_MODEL", "");

  setConfigValue("ANTHROPIC_API_KEY", "a-key");
  check("anthropic wins when both are set", resolveProvider() === "anthropic");
  check("anthropic gets a claude default", modelFor("anthropic").startsWith("claude"),
    modelFor("anthropic"));
  setConfigValue("AI_MODEL", "gemini-3.5-flash");
  check("a gemini model name is ignored for anthropic",
    modelFor("anthropic") === defaultModelFor("anthropic"), modelFor("anthropic"));

  setConfigValue("ANTHROPIC_API_KEY", "");
  check("clearing anthropic falls back to gemini", resolveProvider() === "gemini");
  reset();
  check("cleared keys leave no provider", resolveProvider() === null);

  // Gemini's responseJsonSchema accepts a documented subset of JSON Schema.
  const { ParsedResumeSchema } = await import("../src/lib/parsing/schema.ts");
  const { z: zod } = await import("zod");
  const converted = toGeminiSchema(zod.toJSONSchema(ParsedResumeSchema, { io: "output" })) as Record<
    string,
    unknown
  >;
  const serialized = JSON.stringify(converted);
  check("$schema stripped (not a Gemini keyword)", !("$schema" in converted));
  check("no dangling $ref survives", !serialized.includes('"$ref"'));
  check("no $defs survives", !serialized.includes('"$defs"'));
  check("real structure preserved",
    converted.type === "object" && typeof converted.properties === "object");
  check("nested resume fields preserved",
    serialized.includes("experience") && serialized.includes("bullets") &&
      serialized.includes("certifications"));
  check("additionalProperties:false kept (blocks invented fields)",
    serialized.includes('"additionalProperties":false'));

  // A hand-written schema using $defs must still come out usable.
  const withRefs = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: { Item: { type: "object", properties: { name: { type: "string" } } } },
    type: "object",
    properties: { items: { type: "array", items: { $ref: "#/$defs/Item" } } },
  };
  const inlined = JSON.stringify(toGeminiSchema(withRefs));
  check("a $ref is inlined, not dropped",
    !inlined.includes("$ref") && inlined.includes('"name"'), inlined);

  // Anthropic's SDK retries transient failures itself (maxRetries: 2); Gemini's
  // has no such option, so the same policy is hand-rolled in generateGemini.
  // Found by a real 503 from Google: "This model is currently experiencing
  // high demand" killed the whole request on the first attempt.
  const { isRetryableGeminiError } = await import("../src/lib/ai/providers/gemini.ts");
  const statusErr = (status: number, message = "boom") =>
    Object.assign(new Error(message), { status });

  check("503 (observed: high demand) is retried", isRetryableGeminiError(statusErr(503)));
  check("429 (quota/rate limit) is retried", isRetryableGeminiError(statusErr(429)));
  check("500 (generic server fault) is retried", isRetryableGeminiError(statusErr(500)));
  check("status carried only in the message text is still caught",
    isRetryableGeminiError(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}')));
  check("400 (bad request — retrying would not help) is not retried",
    !isRetryableGeminiError(statusErr(400)));
  check("401 (bad key — retrying would not help) is not retried",
    !isRetryableGeminiError(statusErr(401)));
  check("a non-Error value does not crash the check", !isRetryableGeminiError("boom"));
  check("undefined does not crash the check", !isRetryableGeminiError(undefined));

  // A quota error must NOT be retried. The free tier allows a handful of
  // requests per minute per model and document generation makes several calls in
  // a row, so retrying spends the same window and turns one failure into three.
  const { isQuotaError, retryDelayMsFrom } = await import("../src/lib/ai/providers/gemini.ts");
  const realQuotaError = Object.assign(
    new Error(
      '{"error":{"code":429,"message":"You exceeded your current quota... ' +
        'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, ' +
        'limit: 5, model: gemini-3.5-flash\nPlease retry in 31.608147126s.","status":"RESOURCE_EXHAUSTED",' +
        '"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"31s"}]}}'
    ),
    { status: 429 }
  );
  check("the real 429 quota body is recognised as a quota error", isQuotaError(realQuotaError));
  check("a 503 capacity blip is not a quota error", !isQuotaError(statusErr(503)));
  check("Gemini's own retryDelay is read from the body",
    retryDelayMsFrom(realQuotaError) === 31000, String(retryDelayMsFrom(realQuotaError)));
  check("a 503 with no advice returns no delay", retryDelayMsFrom(statusErr(503)) === null);
  check("'retry in Ns' prose is also read",
    retryDelayMsFrom(new Error("Please retry in 12s.")) === 12000);
}

// ---------- 2e. Search suggestions from a resume ----------
// The heuristic path is what runs when there is no AI key or the free-tier quota
// is spent, so it has to produce queries a job board will actually match. Every
// case here is a resume title that needed cleaning up first.
console.log("\n2e. Search suggestions (heuristic)");
{
  const { suggestSearchesHeuristic } = await import("../src/lib/suggest/heuristic-suggest.ts");
  const { emptyParsedResume } = await import("../src/lib/parsing/schema.ts");

  const build = (titles: string[], skills: string[] = []) => ({
    ...emptyParsedResume(),
    experience: titles.map((title) => ({
      company: "Acme",
      title,
      location: null,
      startDate: "Jan 2023",
      endDate: null,
      bullets: ["Did the work."],
    })),
    skills: skills.length > 0 ? [{ name: "Tech", skills }] : [],
  });

  const kw = (r: ReturnType<typeof build>, opts = {}) =>
    suggestSearchesHeuristic(r, opts).map((s) => s.keywords);

  // A grade before the comma is internal; the discipline after it is what is
  // advertised. "Analyst II" as a query finds nothing.
  const graded = kw(build(["Analyst II, Software Engineering"]));
  check("a graded title yields the discipline",
    graded.includes("Software Engineering") && !graded.includes("Analyst II"),
    graded.join(" | "));

  // A trainee title is not what someone hunting a real job wants indexed.
  const intern = kw(build(["IT Support Intern"]));
  check("trainee wording dropped", intern.includes("IT Support"), intern.join(" | "));

  // Seniority is dropped as an extra, broader query - not instead of the title.
  const senior = kw(build(["Senior Backend Engineer"]));
  check("keeps the held title", senior.includes("Senior Backend Engineer"), senior.join(" | "));
  check("adds a version without the seniority word",
    senior.includes("Backend Engineer"), senior.join(" | "));

  // Bracketed qualifiers make a query too narrow to match anything.
  const bracketed = kw(build(["Software Engineer (Childcare SaaS Platform)"]));
  check("bracketed qualifier stripped",
    bracketed.includes("Software Engineer"), bracketed.join(" | "));

  // Stated intent outranks inference.
  const targeted = kw(build(["IT Support Intern"]), { targetTitles: ["Frontend Developer"] });
  check("profile target titles come first", targeted[0] === "Frontend Developer",
    targeted.join(" | "));

  // Technologies pair with the role noun, title-cased, but only ones that are
  // actually advertised that way: no board posts an "HTML Developer" vacancy.
  const paired = kw(build(["Frontend Developer"], ["React", "HTML", "CSS", "Git"]));
  check("a real technology pairs with the role",
    paired.includes("React Developer"), paired.join(" | "));
  check("web basics are not paired into fake titles",
    !paired.some((k) => /^(HTML|CSS|Git) /.test(k)), paired.join(" | "));

  // An -ing discipline still yields a searchable noun.
  const ing = kw(build(["Software Engineering"]), {});
  check("engineering yields an Engineer pairing or the title itself",
    ing.length > 0 && ing.every((k) => k.trim().length > 0), ing.join(" | "));

  // Nothing to work from must not invent anything.
  check("an empty resume yields nothing", kw(build([])).length === 0);
  check("no duplicates", (() => {
    const list = kw(build(["Software Engineer", "Software Engineer"]));
    return new Set(list).size === list.length;
  })());
  check("queries stay short enough to match a posting",
    kw(build(["Senior Full-Stack Software Engineer (Childcare SaaS Platform)"]))
      .every((k) => k.split(/\s+/).length <= 6));

  // The AI path drops leading punctuation from technology names - ".NET
  // Developer" came back as "NET Developer", a materially worse query - so it is
  // put back. Whole-word only, or "Networking" and "Internet" would be mangled.
  const { repairTechNameForTest } = await import("../src/lib/suggest/ai-suggest.ts");
  const repairs: [string, string][] = [
    ["NET Developer", ".NET Developer"],
    ["ASP Developer", "ASP.NET Developer"],
    ["C sharp Engineer", "C# Engineer"],
    ["NodeJS Developer", "Node.js Developer"],
    [".NET Developer", ".NET Developer"],
    ["Networking Engineer", "Networking Engineer"],
    ["Internet Analyst", "Internet Analyst"],
    ["Backend Developer", "Backend Developer"],
  ];
  for (const [input, want] of repairs) {
    check(`repairs "${input}"`, repairTechNameForTest(input) === want,
      repairTechNameForTest(input));
  }
}

// ---------- 3. Unsupported / scanned guards ----------
console.log("\n3. Error guards");
try {
  await parseResumeFile(Buffer.from("hello"), "notes.txt");
  check("rejects unsupported type", false);
} catch (err) {
  check("rejects unsupported type", (err as Error).name === "UnsupportedFileError", (err as Error).name);
}

// ---------- 4. Job ingestion from pasted text ----------
console.log("\n4. Job extraction from pasted text");
const jobText = fs.readFileSync(path.join(FIXTURES, "job-description.txt"), "utf8");
const ingested = await ingestFromText(jobText);
if (!ingested.ok) {
  check("ingest succeeded", false, ingested.message);
  process.exit(1);
}
const job = ingested.job;
check("found title", /backend engineer/i.test(job.title), job.title);
check("found company", (job.company ?? "").length > 0, String(job.company));
check("detected remote", job.workMode === "remote", String(job.workMode));
check("found salary", job.salaryMin != null, `${job.salaryCurrency} ${job.salaryMin}-${job.salaryMax} /${job.salaryPeriod}`);
check("found responsibilities", job.responsibilities.length >= 3, `${job.responsibilities.length}`);
check("found requirements", job.requirements.length >= 4, `${job.requirements.length}`);
console.log(`  extraction method: ${job.extractionMethod}`);

const jobInput = {
  title: job.title,
  company: job.company,
  text: [job.rawText, ...job.responsibilities, ...job.requirements].join("\n"),
};

// ---------- 5. Match analysis ----------
console.log("\n5. Match analysis");
const strongMatch = await analyzeMatch(maria, jobInput);
check("score in range", strongMatch.score >= 0 && strongMatch.score <= 100, `${strongMatch.score}%`);
check("strong candidate scores well", strongMatch.score >= 50, `${strongMatch.score}%`);
check("matched keywords found", strongMatch.matchedKeywords.length >= 5, `${strongMatch.matchedKeywords.length}`);
check("suggestions produced", strongMatch.suggestions.length >= 3, `${strongMatch.suggestions.length}`);
console.log(`  method: ${strongMatch.method}`);
console.log(`  matched: ${strongMatch.matchedKeywords.slice(0, 10).join(", ")}`);
console.log(`  missing: ${strongMatch.missingKeywords.slice(0, 8).join(", ")}`);

const weakMatch = await analyzeMatch(juan, jobInput);
check(
  "unrelated resume scores lower",
  weakMatch.score < strongMatch.score,
  `support lead ${weakMatch.score}% < backend eng ${strongMatch.score}%`
);

// ---------- 6. Tailoring + anti-fabrication ----------
console.log("\n6. Resume tailoring");
const tailored = await tailorResume(maria, jobInput, {
  matched: strongMatch.matchedKeywords,
  missing: strongMatch.missingKeywords,
});
check("produced a resume", tailored.resume.experience.length > 0);
check("kept every job", tailored.resume.experience.length === maria.experience.length,
  `${tailored.resume.experience.length} of ${maria.experience.length}`);
check("changes described", tailored.changes.length > 0, `${tailored.changes.length} changes`);
const report = validateTailoredResume(maria, tailored.resume);
check("passes anti-fabrication validation", report.ok, report.errors.slice(0, 3).join(" | "));
console.log(`  method: ${tailored.method}`);
console.log(`  summary: ${(tailored.resume.summary ?? "").slice(0, 160)}`);
tailored.changes.slice(0, 4).forEach((c) => console.log(`   · ${c}`));

// The validator must actually reject fabrication — prove it.
const fabricated = structuredClone(tailored.resume);
fabricated.experience.unshift({
  company: "Google",
  title: "Staff Engineer",
  location: null,
  startDate: "Jan 2015",
  endDate: "Feb 2016",
  bullets: ["Led a team of 50 engineers"],
});
const fabReport = validateTailoredResume(maria, fabricated);
check("validator rejects invented employer", !fabReport.ok, `${fabReport.errors.length} errors`);

const fakeSkill = structuredClone(tailored.resume);
fakeSkill.skills.push({ name: "Invented", skills: ["Rust", "Elixir", "Haskell"] });
check("validator rejects invented skills", !validateTailoredResume(maria, fakeSkill).ok);

const changedContact = structuredClone(tailored.resume);
changedContact.contact.email = "attacker@example.com";
check("validator rejects changed contact", !validateTailoredResume(maria, changedContact).ok);

// ---------- 7. Cover letter ----------
console.log("\n7. Cover letter");
const letter = await generateCoverLetter(tailored.resume, jobInput);
check("body generated", letter.body.length > 200, `${letter.body.length} chars`);
check("has paragraphs", letter.body.split("\n\n").length >= 3);
check("no banned cliche", !/i am writing to express/i.test(letter.body));
console.log(`  method: ${letter.method}`);
console.log(`  opening: ${letter.body.slice(0, 140)}…`);

// ---------- 8. PDF rendering, all templates ----------
console.log("\n8. PDF generation");
const outDir = path.join(FIXTURES, "generated");
fs.mkdirSync(outDir, { recursive: true });
// Byte size and a %PDF- header do not prove anything rendered: a blank or
// clipped page passes both. Each template is read back and checked for the
// content that must reach an employer.
const { PDFParse } = await import("pdf-parse");
const pageCounts: Record<string, number> = {};
for (const template of ["classic", "modern", "compact", "centered"] as const) {
  const { pdf, html } = await generateResumePdf(tailored.resume, template, "Letter");
  const file = path.join(outDir, `resume-${template}.pdf`);
  fs.writeFileSync(file, pdf);
  check(`${template} PDF`, pdf.length > 8000 && pdf.subarray(0, 5).toString() === "%PDF-",
    `${(pdf.length / 1024).toFixed(0)} KB`);
  check(`${template} escapes HTML`, !html.includes("<script"), "no raw script tags");
  check(`${template} single column (no tables)`, !/<table/i.test(html));

  const parser = new PDFParse({ data: pdf });
  const rendered = await parser.getText();
  await parser.destroy();
  pageCounts[template] = rendered.pages.length;
  const text = rendered.text.replace(/\s+/g, " ");

  check(`${template} renders the candidate's name`,
    text.includes(tailored.resume.contact.fullName), tailored.resume.contact.fullName);
  check(`${template} renders every employer`,
    tailored.resume.experience.every((e) => !e.company || text.includes(e.company)),
    tailored.resume.experience.map((e) => e.company).join(" | "));
  check(`${template} renders the summary`,
    !tailored.resume.summary || text.includes(tailored.resume.summary.slice(0, 40)));
  check(`${template} renders skills`,
    tailored.resume.skills.flatMap((g) => g.skills).every((s) => text.includes(s)),
    `${tailored.resume.skills.flatMap((g) => g.skills).length} skills`);
  check(`${template} fits within 3 pages`, rendered.pages.length <= 3,
    `${rendered.pages.length} pages`);
}
// ---------- 8b. Every template must survive a round trip ----------
// Rendering legibly is not enough: the PDF has to read back correctly, because
// that is all an ATS ever sees. This caught two defects that looked fine on the
// page - `letter-spacing: 1.5px` on section headings made text extraction split
// every letter ("E X P E R I E N C E"), so no heading was recognised and the
// entire body was invisible; and a comma between title and employer is
// ambiguous when the title itself contains one, which cost every template the
// employer name.
console.log("\n8b. Template round-trip (what an ATS actually reads)");
{
  const { extractResumeText } = await import("../src/lib/parsing/extract.ts");
  const { parseResumeHeuristic } = await import("../src/lib/parsing/heuristic-parser.ts");
  const source = tailored.resume;
  const wantRoles = source.experience.length;
  const wantBullets = source.experience.reduce((n, e) => n + e.bullets.length, 0);
  const wantSkills = source.skills.flatMap((g) => g.skills).length;

  for (const template of ["classic", "modern", "compact", "centered"] as const) {
    const { pdf } = await generateResumePdf(source, template, "Letter");
    const extracted = await extractResumeText(pdf, "r.pdf");
    const back = parseResumeHeuristic(extracted).resume;

    // Headings must come back as single words, not one letter at a time.
    check(`${template}: headings survive extraction`,
      !/\b[A-Z]( [A-Z]){3,}\b/.test(extracted),
      (extracted.match(/\b[A-Z]( [A-Z]){3,}\b/) ?? ["clean"])[0]);
    check(`${template}: name round-trips`,
      back.contact.fullName === source.contact.fullName, back.contact.fullName);
    check(`${template}: email round-trips`, back.contact.email === source.contact.email);
    check(`${template}: every role found`, back.experience.length === wantRoles,
      `${back.experience.length}/${wantRoles}`);
    check(`${template}: job titles round-trip`,
      source.experience.every((m) => back.experience.some((b) => b.title === m.title)),
      back.experience.map((e) => e.title).join(" | "));
    check(`${template}: employers round-trip`,
      source.experience.every((m) => back.experience.some((b) => b.company === m.company)),
      back.experience.map((e) => e.company).join(" | "));
    check(`${template}: start dates round-trip`,
      source.experience.every((m) => back.experience.some((b) => b.startDate === m.startDate)));
    check(`${template}: every bullet round-trips`,
      back.experience.reduce((n, e) => n + e.bullets.length, 0) === wantBullets,
      `${back.experience.reduce((n, e) => n + e.bullets.length, 0)}/${wantBullets}`);
    check(`${template}: skills split individually`,
      back.skills.flatMap((g) => g.skills).length >= wantSkills,
      `${back.skills.flatMap((g) => g.skills).length}/${wantSkills}`);
    check(`${template}: education round-trips`, back.education.length >= 1);
  }
}

// compact exists to squeeze a long history onto fewer pages.
check("compact is never longer than classic",
  pageCounts.compact <= pageCounts.classic,
  `compact ${pageCounts.compact} vs classic ${pageCounts.classic}`);
console.log(
  `  pages — classic ${pageCounts.classic}, modern ${pageCounts.modern}, compact ${pageCounts.compact}, centered ${pageCounts.centered}`
);
const coverPdf = await generateCoverLetterPdf({
  contact: tailored.resume.contact,
  body: letter.body,
  jobTitle: job.title,
  company: job.company,
  paper: "Letter",
});
fs.writeFileSync(path.join(outDir, "cover-letter.pdf"), coverPdf.pdf);
check("cover letter PDF", coverPdf.pdf.subarray(0, 5).toString() === "%PDF-",
  `${(coverPdf.pdf.length / 1024).toFixed(0)} KB`);

// ---------- 9. Interview prep ----------
console.log("\n9. Interview prep");
const prep = await generateInterviewPrep(maria, jobInput);
check("questions generated", prep.content.questions.length >= 8, `${prep.content.questions.length} questions`);
check("every question has an outline",
  prep.content.questions.every((q) => q.answerOutline.length >= 2));
const categories = new Set(prep.content.questions.map((q) => q.category));
check("multiple categories", categories.size >= 3, [...categories].join(", "));
console.log(`  method: ${prep.method}`);
console.log(`  first: ${prep.content.questions[0]?.question}`);

// ---------- 10. Dedup ----------
console.log("\n10. Cross-source dedup");
const { dedupeJobs } = await import("../src/lib/dedup.ts");
const deduped = dedupeJobs([
  { externalId: "a", source: "jsearch", title: "Senior React Developer", company: "Acme Inc.",
    location: "Makati, Philippines", isRemote: false, url: "https://a", descriptionSnippet: "short" },
  { externalId: "b", source: "jooble", title: "Sr. React Developer (URGENT!)", company: "Acme",
    location: "Makati", isRemote: false, url: "https://b", descriptionSnippet: "a much longer description here" },
  { externalId: "c", source: "adzuna", title: "Data Analyst", company: "Globe",
    location: "Taguig", isRemote: true, url: "https://c" },
]);
check("merged near-duplicates", deduped.merged.length === 2, `${deduped.merged.length} unique of 3`);
check("duplicate counted", deduped.duplicatesMerged === 1, `${deduped.duplicatesMerged}`);
const reactJob = deduped.merged.find((j) => /react/i.test(j.title));
check("kept both source refs", (reactJob?.sources.length ?? 0) === 2, `${reactJob?.sources.length} sources`);

// ---------- 11. Smart links ----------
console.log("\n11. Smart links");
const { buildSmartLinks } = await import("../src/lib/sources/smartLinks.ts");
const links = buildSmartLinks({
  keywords: "backend engineer", location: "Philippines", remoteOnly: true,
  datePosted: "week", jobType: "full_time", page: 1,
});
check("all 11 links built", links.length >= 11, `${links.length} links`);
for (const link of links) {
  check(`${link.id} is a valid URL`, /^https:\/\/[^\s]+$/.test(link.url), link.url.slice(0, 78));
}
check("jobstreet slugified", links.some((l) => l.id === "jobstreet" && l.url.includes("backend-engineer-jobs")));
check("linkedin has PH geoId", links.some((l) => l.url.includes("geoId=103121230")));
check("facebook uses hiring query", links.some((l) => l.id.startsWith("facebook") && /hiring/i.test(l.url)));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
// Release Chrome explicitly: process.exit does not reliably reap Puppeteer's
// child process on Windows, which leaves chrome.exe holding file locks.
const { closeBrowser } = await import("../src/lib/pdf/browser.ts");
await closeBrowser();

process.exit(failures === 0 ? 0 : 1);
