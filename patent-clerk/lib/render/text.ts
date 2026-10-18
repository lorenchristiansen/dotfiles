// Single-stroke Hershey text, emitted as path geometry (never <text>), so the plotter
// draws each letter as one pass of the pen.
import serif from "./fonts/serif.json";
import script from "./fonts/script.json";
import { Pen } from "./pen";

type Glyph = { a: number; s: number[][] };
const FONTS: Record<FontName, Record<string, Glyph>> = {
  serif: serif as Record<string, Glyph>,
  script: script as Record<string, Glyph>,
};
export type FontName = "serif" | "script";

/** Glyph units per unit of cap height (capital A in Hershey Serif is 662 tall). */
const CAP = 662;

export interface TextStyle {
  size: number; // cap height in sheet units (0.01 in)
  font?: FontName;
  tracking?: number; // extra space between letters, in sheet units
  anchor?: "start" | "middle" | "end";
}

function glyph(font: FontName, ch: string): Glyph {
  return FONTS[font][ch] ?? FONTS[font]["?"];
}

export function measure(text: string, style: TextStyle): number {
  const font = style.font ?? "serif";
  const k = style.size / CAP;
  let w = 0;
  for (const ch of text) w += glyph(font, ch).a * k + (style.tracking ?? 0);
  return Math.max(0, w - (style.tracking ?? 0));
}

/** Draws text with its baseline at y. Returns the drawn width. */
export function drawText(pen: Pen, text: string, x: number, y: number, style: TextStyle): number {
  const font = style.font ?? "serif";
  const k = style.size / CAP;
  const width = measure(text, style);
  let cx = style.anchor === "middle" ? x - width / 2 : style.anchor === "end" ? x - width : x;
  for (const ch of text) {
    const g = glyph(font, ch);
    for (const s of g.s) {
      if (s.length < 4) continue;
      pen.M(cx + s[0] * k, y - s[1] * k);
      for (let i = 2; i < s.length; i += 2) pen.L(cx + s[i] * k, y - s[i + 1] * k);
    }
    cx += g.a * k + (style.tracking ?? 0);
  }
  return width;
}

/** Greedy word wrap by measured width. */
export function wrap(text: string, maxWidth: number, style: TextStyle): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (measure(next, style) <= maxWidth || !cur) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Wraps into at most maxLines lines of near-equal width (no orphaned last word). */
export function balancedWrap(text: string, maxWidth: number, style: TextStyle, maxLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  const greedy = wrap(text, maxWidth, style);
  if (greedy.length > maxLines || greedy.some((l) => measure(l, style) > maxWidth)) return null;
  if (greedy.length <= 1) return greedy;
  // Shrink the target width while the line count holds, to even out the lines.
  let lo = 0;
  let hi = maxWidth;
  let best = greedy;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const lines = wrap(words.join(" "), mid, style);
    if (lines.length <= greedy.length && lines.every((l) => measure(l, style) <= mid + 0.01)) {
      best = lines;
      hi = mid;
    } else lo = mid;
  }
  return best;
}

/** Largest size (down to minSize) at which text fits within maxWidth. */
export function fitSize(text: string, maxWidth: number, style: TextStyle, minSize: number): number {
  let size = style.size;
  while (size > minSize && measure(text, { ...style, size }) > maxWidth) size -= 0.5;
  return size;
}
