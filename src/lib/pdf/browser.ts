import puppeteer, { type Browser } from "puppeteer";

// Cached on globalThis, not at module level: Next dev HMR re-evaluates this
// module on every edit, and a module-level instance would leak a fresh
// chrome.exe process each time.
const g = globalThis as unknown as { __jobpilot_browser?: Promise<Browser> };

function launch(): Promise<Browser> {
  return puppeteer.launch({ headless: true });
}

export async function getBrowser(): Promise<Browser> {
  if (!g.__jobpilot_browser) {
    g.__jobpilot_browser = launch();
  }

  let browser: Browser;
  try {
    browser = await g.__jobpilot_browser;
  } catch (err) {
    // Launch failed (e.g. chrome not downloaded yet); clear so the next call retries.
    g.__jobpilot_browser = undefined;
    throw err;
  }

  if (!browser.connected) {
    // Chrome crashed or was killed externally; relaunch once.
    g.__jobpilot_browser = launch();
    try {
      return await g.__jobpilot_browser;
    } catch (err) {
      g.__jobpilot_browser = undefined;
      throw err;
    }
  }

  return browser;
}

/**
 * Shut the cached Chrome down and forget it.
 *
 * The long-running server deliberately keeps the browser alive for reuse, but a
 * one-shot script has no way to release it: Chrome's handles keep the event loop
 * open, so the process hangs after its work is finished and gets killed with a
 * non-zero status that looks like a failure. On Windows the lingering process
 * also holds file locks. Safe to call when nothing was ever launched.
 */
export async function closeBrowser(): Promise<void> {
  const pending = g.__jobpilot_browser;
  if (!pending) return;
  g.__jobpilot_browser = undefined;
  try {
    const browser = await pending;
    if (browser.connected) await browser.close();
  } catch {
    // Already gone, or never launched successfully — nothing to release.
  }
}
