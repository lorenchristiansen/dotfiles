import fs from "node:fs";
import { chromium } from "playwright";

/** Launches Chromium, preferring a preinstalled build when Playwright's own is absent. */
export function launch() {
  const candidates = [process.env.CHROMIUM_PATH, "/opt/pw-browsers/chromium"].filter(Boolean) as string[];
  const executablePath = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  return chromium.launch(executablePath ? { executablePath } : {});
}
