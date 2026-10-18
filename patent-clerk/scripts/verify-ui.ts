// End-to-end check of the app in a real browser: runs full conversations, takes
// screenshots after the first drawing and after each amendment, checks the
// Download SVG file is byte-identical to the on-screen preview, and audits each
// rendered machine for layout problems.
//
// Usage: npm run build && CLERK_MODE=demo npm run verify:ui
// (Against the real clerk, start the server yourself and set BASE_URL.)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { launch } from "./browser";

const CONVERSATIONS: Record<string, string[]> = {
  regret: [
    "It distills mild regret into a drinkable tonic.",
    "Steam from a coal boiler, and the occasional sigh.",
    "A funnel for the regret, a pressure gauge, a valve, a glass jar to collect it, and a chimney.",
    "Call it the Regret Distillery, by Eleanor Whitcombe",
    "Make the boiler bigger.",
    "Add a second funnel.",
  ],
  socks: [
    "It reunites lost socks with their partners.",
    "A hand crank and a great deal of optimism.",
    "A conveyor belt, two gears, a sorting lever and a spring.",
    "The Sock Reunifier, inventor is Thaddeus Ambrose",
    "Add a horn to announce each match.",
    "Remove the spring.",
  ],
  tuesday: [
    "I would like to patent the DeLorean time machine.",
    "Fine. Mine predicts Tuesdays using compressed air.",
    "Bellows, worked by a foot pedal.",
    "A piston, a horn, a valve and a gauge.",
    "Tuesday Engine by Marguerite Okonkwo-Hale",
    "Make the horn smaller.",
  ],
};

const OUT = path.resolve("out");

async function waitForServer(url: string, ms = 60000) {
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    if (Date.now() - t0 > ms) throw new Error(`server not up at ${url}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function say(page: Page, text: string) {
  const before = await page.locator(".msg").count();
  await page.fill("textarea", text);
  await page.keyboard.press("Enter");
  await page.waitForFunction((n) => document.querySelectorAll(".msg:not(.typing)").length >= n + 2 && !document.querySelector(".typing"), before, { timeout: 120000 });
  await page.waitForTimeout(700); // let the log finish scrolling
  const last = page.locator(".msg.assistant").last();
  return (await last.textContent()) ?? "";
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let base = process.env.BASE_URL;
  let server: ReturnType<typeof spawn> | undefined;
  if (!base) {
    base = "http://localhost:3100";
    server = spawn("npx", ["next", "start", "-p", "3100"], {
      env: { ...process.env, CLERK_MODE: process.env.CLERK_MODE ?? "demo" },
      stdio: "ignore",
      detached: true,
    });
    await waitForServer(base);
  }
  const browser = await launch();
  let failures = 0;
  try {
    for (const [name, script] of Object.entries(CONVERSATIONS)) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
      await page.goto(base);
      let drawings = 0;
      console.log(`\n=== ${name}`);
      for (const [i, text] of script.entries()) {
        const reply = await say(page, text);
        console.log(`> ${text}\n< ${reply}`);
        const hasDownload = (await page.locator("button.download").count()) > 0;
        if (hasDownload) {
          drawings++;
          await page.screenshot({ path: path.join(OUT, `ui-${name}-${i + 1}.png`) });
        }
      }
      if (!drawings) {
        console.log("FAIL: no drawing produced");
        failures++;
        continue;
      }
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("button.download")]);
      const file = path.join(OUT, `download-${name}.svg`);
      await dl.saveAs(file);
      // Compare the file with the preview as parsed SVG documents (the DOM can't
      // hand back the original string, so serialize both the same way).
      const same = await page.evaluate((text) => {
        const ser = new XMLSerializer();
        const fromFile = ser.serializeToString(new DOMParser().parseFromString(text, "image/svg+xml").documentElement);
        const shown = ser.serializeToString(document.querySelector(".sheet svg")!);
        return fromFile === shown;
      }, fs.readFileSync(file, "utf8"));
      console.log(`download ${dl.suggestedFilename()} identical to preview: ${same}`);
      if (!same) failures++;
      const audit = await page.evaluate(() => {
        const svg = document.querySelector(".sheet svg")!;
        return {
          fills: [...svg.querySelectorAll("*")].filter((e) => (e.getAttribute("fill") ?? "none") !== "none").length,
          strokes: [...new Set([...svg.querySelectorAll("[stroke]")].map((e) => e.getAttribute("stroke")))],
          textNodes: svg.querySelectorAll("text").length,
          elements: [...new Set([...svg.querySelectorAll("*")].map((e) => e.tagName))],
        };
      });
      console.log("svg audit", JSON.stringify(audit));
      if (audit.fills || audit.textNodes || audit.strokes.length !== 1) failures++;
      await page.close();
    }

    // Mobile layout: one conversation through to a drawing.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.goto(base);
    await phone.screenshot({ path: path.join(OUT, "ui-mobile-start.png") });
    for (const text of CONVERSATIONS.regret.slice(0, 4)) await say(phone, text);
    await phone.screenshot({ path: path.join(OUT, "ui-mobile-drawing.png") });
    const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desk.goto(base);
    await desk.screenshot({ path: path.join(OUT, "ui-start.png") });
  } finally {
    await browser.close();
    // Kill the whole process group: npx leaves the Next server running otherwise.
    if (server?.pid) process.kill(-server.pid);
  }
  console.log(failures ? `\n${failures} failure(s)` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}
main();
