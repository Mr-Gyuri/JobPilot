// Teaches plain `node` the same "@/*" -> "src/*" alias that tsconfig and the
// Next bundler use, and appends the TS extension that bundler-style imports
// omit, so scripts/ can import the app's modules directly.
//
// Scoped strictly to files under src/ — node_modules must keep Node's own
// resolution (several packages rely on CJS require semantics).
import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const SRC = pathToFileURL(path.join(process.cwd(), "src") + path.sep).href;

function withExtension(href) {
  if (/\.[a-z]+$/i.test(new URL(href).pathname)) return href;
  const filePath = fileURLToPath(href);
  for (const candidate of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (fs.existsSync(filePath + candidate)) return href + candidate;
  }
  return href;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(withExtension(new URL(specifier.slice(2), SRC).href), context);
    }
    const parent = context.parentURL;
    const isAppSource = parent?.startsWith(SRC);
    if (isAppSource && (specifier.startsWith("./") || specifier.startsWith("../"))) {
      return nextResolve(withExtension(new URL(specifier, parent).href), context);
    }
    return nextResolve(specifier, context);
  },
});
