// Converts Hershey SVG fonts (from the `hersheytext` package, see NOTICE.md)
// into compact stroke JSON used by lib/render/text.ts.
// Usage: node scripts/build-fonts.mjs <path-to-hersheytext/svg_fonts>
import fs from "node:fs";
import path from "node:path";

const src = process.argv[2];
if (!src) throw new Error("pass the svg_fonts directory");

const fonts = { HersheySerifMed: "serif", HersheyScript1: "script" };

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

for (const [file, name] of Object.entries(fonts)) {
  const svg = fs.readFileSync(path.join(src, `${file}.svg`), "utf8");
  const glyphs = {};
  for (const m of svg.matchAll(/<glyph\s+unicode="([^"]*)"[^>]*?horiz-adv-x="([\d.]+)"(?:[^>]*?\sd="([^"]*)")?/g)) {
    const ch = decode(m[1]);
    if (ch.length !== 1 || ch < " " || ch > "~") continue;
    if (/[^ML\d.\s-]/.test(m[3] || "")) continue;
    const strokes = [];
    let cur = null;
    const toks = (m[3] || "").match(/[ML]|-?[\d.]+(?:e-?\d+)?/g) || [];
    for (let i = 0; i < toks.length; ) {
      const cmd = toks[i++];
      const x = Math.round(parseFloat(toks[i++]) * 10) / 10;
      const y = Math.round(parseFloat(toks[i++]) * 10) / 10;
      if (cmd === "M") { cur = [x, y]; strokes.push(cur); }
      else if (cmd === "L") cur.push(x, y);
      else throw new Error(`unexpected ${cmd} in ${file}`);
    }
    glyphs[ch] = { a: parseFloat(m[2]), s: strokes };
  }
  fs.writeFileSync(path.join("lib/render/fonts", `${name}.json`), JSON.stringify(glyphs));
  console.log(name, Object.keys(glyphs).length, "glyphs");
}
