// Tiles PNGs side by side (scaled) into one image for quick review.
import fs from "node:fs";
import path from "node:path";
import { launch } from "./browser";

async function main() {
  const [outFile, ...files] = process.argv.slice(2);
  const imgs = files.map((f) => `<img src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}" style="height:900px;margin:4px;border:1px solid #ccc">`).join("");
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 600 * files.length + 40, height: 920 } });
  await page.setContent(`<body style="margin:0;display:flex;background:#eee">${imgs}</body>`);
  await page.screenshot({ path: path.resolve(outFile) });
  await browser.close();
}
main();
