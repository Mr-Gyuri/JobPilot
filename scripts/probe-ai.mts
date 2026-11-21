/**
 * Sends one tiny structured request through whichever AI provider is configured
 * and reports exactly what happened.
 *
 * Model names and free-tier quotas change, and a wrong one only shows up as a
 * silent fall back to keyword logic. This turns that into a direct answer, for
 * a few hundred tokens.
 *
 *   npm run verify:ai
 */
import { z } from "zod";

const { isAIAvailable } = await import("../src/lib/config.ts");
const { resolveProvider, modelFor } = await import("../src/lib/ai/provider.ts");
const { generateStructured } = await import("../src/lib/ai/structured.ts");

const provider = resolveProvider();

if (!isAIAvailable() || !provider) {
  console.log(
    "\nNo AI provider configured — every feature is using its keyword fallback.\n" +
      "Add an Anthropic or Gemini key on the Settings page to enable the AI paths.\n"
  );
  process.exit(0);
}

console.log(`\nprovider: ${provider}`);
console.log(`model:    ${modelFor(provider)}`);

// Deliberately exercises the shapes the real features rely on: nested objects,
// arrays of objects, and a nullable field.
const Probe = z.object({
  greeting: z.string(),
  count: z.number(),
  items: z.array(z.object({ name: z.string(), optional: z.string().nullable() })),
});

const started = Date.now();
try {
  const result = await generateStructured({
    schema: Probe,
    schemaName: "probe",
    system: "You return JSON matching the schema. Be terse.",
    user: 'Return greeting "ok", count 2, and two items named "a" and "b" with optional set to null.',
    maxTokens: 512,
  });
  const elapsed = Date.now() - started;
  console.log(`\n[OK] structured output works — ${elapsed}ms`);
  console.log(`     ${JSON.stringify(result)}`);
  console.log("\nAI features are live: resume parsing, match analysis, tailoring, cover letters, interview prep.\n");
  // exitCode rather than exit(): the SDK's keep-alive sockets are still open,
  // and forcing exit through them makes libuv assert on Windows.
  process.exitCode = 0;
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.log(`\n[FAILED] after ${Date.now() - started}ms`);
  console.log(`  ${message}`);

  // The three failures worth naming, because each has a different fix.
  if (/credit balance|billing/i.test(message)) {
    console.log("\n  -> The key is valid but the account has no funds. Add credits, or use a Gemini key instead.");
  } else if (/quota|rate limit|RESOURCE_EXHAUSTED|429/i.test(message)) {
    console.log("\n  -> Rate limit or daily quota reached. It resets; JobPilot uses keyword logic until then.");
  } else if (/not found|NOT_FOUND|unsupported|does not exist/i.test(message)) {
    console.log(
      `\n  -> The model "${modelFor(provider)}" was rejected. Set a different one under Settings -> Model.`
    );
  } else if (/api key|API_KEY_INVALID|unauthor|permission/i.test(message)) {
    console.log("\n  -> The key was rejected. Check it was pasted whole and is still active.");
  }
  console.log("\n  Every feature still works — each one falls back to keyword logic on this error.\n");
  process.exitCode = 1;
}
