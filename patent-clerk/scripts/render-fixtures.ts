// Renders every fixture machine to out/<name>.svg and out/<name>.png and prints the
// layout report, so the renderer can be checked without the chat or an API key.
import fs from "node:fs";
import path from "node:path";
import { launch } from "./browser";
import { FIXTURES } from "../fixtures/machines";
import { sanitizeMachine } from "../lib/machine/schema";
import { renderSheet } from "../lib/render/sheet";

async function main() {
  const out = path.resolve("out");
  fs.mkdirSync(out, { recursive: true });
  const only = process.argv.slice(2);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1700 } });
  for (const [name, raw] of Object.entries(FIXTURES)) {
    if (only.length && !only.includes(name)) continue;
    const t0 = Date.now();
    const { svg, report } = renderSheet(sanitizeMachine(raw), new Date(2026, 9, 18));
    const ms = Date.now() - t0;
    fs.writeFileSync(path.join(out, `${name}.svg`), svg);
    await page.setContent(`<body style="margin:0;background:#fff">${svg.replace('width="11in" height="17in"', 'width="1100" height="1700"')}</body>`);
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
    console.log(name, `${ms}ms`, `${(svg.length / 1024).toFixed(0)}KB`, JSON.stringify(report));
  }
  await browser.close();
}
main();
