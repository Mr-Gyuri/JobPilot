import {
  expandAliases,
  extractKeywords,
  keywordInText,
  type WeightedKeyword,
} from "@/lib/matching/keywords";
import { resumeHaystack, type ParsedResume } from "@/lib/parsing/schema";
import type { InterviewPrepContent, InterviewQuestion, JobKeywordInput } from "@/lib/types";

const STAR_SCAFFOLD = [
  "Situation: name a specific project and the constraint you were under.",
  "Action: describe what you personally did, not what the team did.",
  "Result: quantify the outcome, or state the concrete change it produced.",
];

/** Template-driven interview prep — the no-AI-key path. */
export function generatePrepHeuristic(
  resume: ParsedResume,
  job: JobKeywordInput
): InterviewPrepContent {
  // Without excluding these, the generator asks the candidate to talk about
  // their experience with "Mandaluyong City".
  const keywords = extractKeywords(`${job.title}\n${job.text}`, [
    job.company ?? "",
    job.location ?? "",
  ]);
  const base = resumeHaystack(resume);
  const haystack = `${base}\n${expandAliases(base).join("\n")}`;

  const matched: WeightedKeyword[] = [];
  const missing: WeightedKeyword[] = [];
  for (const kw of keywords) {
    (keywordInText(kw, haystack) ? matched : missing).push(kw);
  }

  const allBullets = resume.experience.flatMap((exp) =>
    exp.bullets.map((bullet) => ({ bullet, company: exp.company }))
  );
  const latest = resume.experience[0];
  const company = job.company ?? "this company";
  const questions: InterviewQuestion[] = [];

  // Technical questions from skills the resume can actually back up.
  for (const kw of matched.slice(0, 5)) {
    const evidence = allBullets
      .filter((item) => keywordInText(kw, item.bullet.toLowerCase()))
      .slice(0, 3)
      .map((item) =>
        item.company ? `Reference: at ${item.company}, ${item.bullet}` : `Reference: ${item.bullet}`
      );
    questions.push({
      question: `Tell me about your experience with ${kw.display}.`,
      category: "technical",
      whyLikely: `${kw.display} appears in the job requirements and on your resume, so expect a depth check.`,
      answerOutline: [...evidence, ...STAR_SCAFFOLD].slice(0, 5),
    });
  }

  // Gap questions for the top requirements with no resume evidence.
  for (const kw of missing.filter((k) => k.weight >= 2).slice(0, 3)) {
    const adjacent = matched[0]?.display;
    questions.push({
      question: `This role involves ${kw.display}. How would you get up to speed?`,
      category: "gap_probing",
      whyLikely: `The posting asks for ${kw.display} but your resume does not evidence it — expect this to be probed.`,
      answerOutline: [
        "Be straightforward that this is newer ground for you rather than overstating it.",
        adjacent
          ? `Bridge from the closest thing you have done: ${adjacent}, and explain what transfers.`
          : "Bridge from the most closely related work on your resume and explain what transfers.",
        "Give a concrete ramp-up plan with a timeframe (docs, a small project, a mentor).",
        "Cite a past example of picking up an unfamiliar tool quickly.",
      ],
    });
  }

  // Behavioral staples, seeded with real resume content.
  const seed = latest
    ? `${latest.title}${latest.company ? ` at ${latest.company}` : ""}`
    : "your most recent role";
  const topBullet = allBullets[0]?.bullet;
  const behavioral: { question: string; whyLikely: string; first: string }[] = [
    {
      question: "Tell me about a time you disagreed with a teammate. How did you handle it?",
      whyLikely: "Nearly every interview probes collaboration and conflict handling.",
      first: `Pick a real disagreement from ${seed}.`,
    },
    {
      question: "Describe a time you had to deliver under a tight deadline.",
      whyLikely: "Interviewers use this to test prioritisation and composure under pressure.",
      first: `Use a delivery from ${seed} where the timeline was the binding constraint.`,
    },
    {
      question: "What has been your biggest professional challenge?",
      whyLikely: "This reveals how you frame difficulty and what you learned from it.",
      first: topBullet ? `Consider framing it around: ${topBullet}` : `Draw on ${seed}.`,
    },
    {
      question: "What accomplishment are you most proud of?",
      whyLikely: "Expect this as a closing question — it sets the impression you leave behind.",
      first: topBullet ? `Strong candidate: ${topBullet}` : `Choose the highest-impact item from ${seed}.`,
    },
  ];
  for (const item of behavioral) {
    questions.push({
      question: item.question,
      category: "behavioral",
      whyLikely: item.whyLikely,
      answerOutline: [item.first, ...STAR_SCAFFOLD],
    });
  }

  questions.push({
    question: `Why do you want to work at ${company}?`,
    category: "role_specific",
    whyLikely: "Tests whether you researched the company or are applying indiscriminately.",
    answerOutline: [
      `Name something specific about ${company} — a product, market, or way of working.`,
      `Connect it to why the ${job.title} role fits your trajectory.`,
      "Reference one requirement from the posting that genuinely appeals to you.",
      "Avoid generic praise that would apply to any employer.",
    ],
  });

  questions.push({
    question: "Walk me through your background.",
    category: "role_specific",
    whyLikely: "Almost always the opening question — your framing sets the tone for everything after.",
    answerOutline: [
      resume.summary
        ? `Open from your summary: ${resume.summary.slice(0, 180)}`
        : "Open with a one-sentence framing of what you do.",
      ...resume.experience
        .slice(0, 3)
        .map((exp) =>
          `Cover ${exp.title}${exp.company ? ` at ${exp.company}` : ""} (${exp.startDate ?? "?"} – ${exp.endDate ?? "Present"}) in two sentences.`
        ),
      `End by connecting your path to the ${job.title} role.`,
    ].slice(0, 5),
  });

  return { questions };
}
