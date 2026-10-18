// Composes the full 11x17 in. sheet. Units are 0.01 in (viewBox 1100 x 1700).
// The returned SVG string is both the on-screen preview and the plotter file.
import type { Machine } from "../machine/schema";
import { drawCallouts, placeCallouts, routeRects, routeTargets, CalloutItem, PlacedCallout } from "./callouts";
import { placeParts, Placed } from "./layout";
import { Pen, Pt, Rect, inflate, rectsOverlap } from "./pen";
import { beltTangents, routeAll, Route } from "./route";
import { balancedWrap, drawText, fitSize, measure, wrap, TextStyle } from "./text";

export const SHEET = { w: 1100, h: 1700 };
const STROKE = 1.6;
const INNER = { x: 52, y: 52, w: 996, h: 1596 };
const TITLE_BLOCK_H = 84;

export interface RenderReport {
  shrink: number;
  unroutedConnections: number;
  relaxedCallouts: number;
  missingCallouts: number;
  textScale: number;
  pathCount: number;
}

export interface RenderResult {
  svg: string;
  report: RenderReport;
}

function patentNumber(title: string): string {
  let h = 2166136261;
  for (const ch of title) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const n = 1_000_000 + (h % 899_999);
  return n.toLocaleString("en-US");
}

const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
function patentDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Offsets an orthogonal polyline sideways by d (mitered corners). */
function offsetPolyline(pts: Pt[], d: number): Pt[] {
  const normals = pts.slice(1).map((p, i) => {
    const q = pts[i];
    const len = Math.hypot(p.x - q.x, p.y - q.y) || 1;
    return { x: -(p.y - q.y) / len, y: (p.x - q.x) / len };
  });
  return pts.map((p, i) => {
    if (i === 0) return { x: p.x + normals[0].x * d, y: p.y + normals[0].y * d };
    if (i === pts.length - 1) return { x: p.x + normals[i - 1].x * d, y: p.y + normals[i - 1].y * d };
    const a = normals[i - 1];
    const b = normals[i];
    return { x: p.x + (a.x + b.x) * d, y: p.y + (a.y + b.y) * d };
  });
}

function drawRoute(pen: Pen, r: Route) {
  if (r.belt) {
    const { a, ra, b, rb } = r.belt;
    for (const [p, q] of beltTangents(a, ra, b, rb)) pen.line(p.x, p.y, q.x, q.y);
    for (const [p, q] of beltTangents(a, ra + 5, b, rb + 5)) pen.line(p.x, p.y, q.x, q.y);
    return;
  }
  const pts = r.points;
  if (!r.ok) {
    pen.poly(pts);
    return;
  }
  const segs = pts.slice(1).map((p, i) => [pts[i], p] as const);
  switch (r.kind) {
    case "pipe": {
      pen.poly(offsetPolyline(pts, 6)).poly(offsetPolyline(pts, -6));
      // Flanges at both ends.
      const ends: [Pt, Pt, boolean][] = [
        [pts[0], pts[1], !!r.ends?.[0].flanged],
        [pts[pts.length - 1], pts[pts.length - 2], !!r.ends?.[1].flanged],
      ];
      for (const [end, next, flanged] of ends) {
        if (flanged) continue;
        const len = Math.hypot(next.x - end.x, next.y - end.y) || 1;
        const ux = (next.x - end.x) / len;
        const uy = (next.y - end.y) / len;
        const nx = -uy;
        const ny = ux;
        const f = [
          { x: end.x + nx * 11, y: end.y + ny * 11 },
          { x: end.x + nx * 11 + ux * 6, y: end.y + ny * 11 + uy * 6 },
          { x: end.x - nx * 11 + ux * 6, y: end.y - ny * 11 + uy * 6 },
          { x: end.x - nx * 11, y: end.y - ny * 11 },
        ];
        pen.poly(f, true);
      }
      // Unions on long straight runs.
      for (const [a, b] of segs) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 150) continue;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        for (const o of [-4, 4]) pen.line(mx + ux * o - uy * 9, my + uy * o + ux * 9, mx + ux * o + uy * 9, my + uy * o - ux * 9);
      }
      break;
    }
    case "shaft":
      pen.poly(offsetPolyline(pts, 3)).poly(offsetPolyline(pts, -3));
      for (const p of pts.slice(1, -1)) pen.circle(p.x, p.y, 6);
      break;
    case "belt":
      pen.poly(offsetPolyline(pts, 4)).poly(offsetPolyline(pts, -4));
      for (const p of pts.slice(1, -1)) pen.circle(p.x, p.y, 8);
      break;
    case "wire":
      pen.poly(pts);
      pen.circle(pts[0].x, pts[0].y, 3).circle(pts[pts.length - 1].x, pts[pts.length - 1].y, 3);
      break;
    case "chain":
      for (const [a, b] of segs) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(1, Math.round(len / 10));
        const horiz = Math.abs(a.y - b.y) < 0.01;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          if (i % 2 === 0) pen.ellipse(x, y, horiz ? 6 : 3, horiz ? 3 : 6);
          else pen.line(x - (horiz ? 5 : 0), y - (horiz ? 0 : 5), x + (horiz ? 5 : 0), y + (horiz ? 0 : 5));
        }
      }
      break;
  }
}

/** Lays out a block of wrapped paragraphs; returns the height used, drawing only if pen given. */
function paragraphs(pen: Pen | null, blocks: { text: string; style: TextStyle; gapAfter: number; indent?: number }[], x: number, y: number, width: number): number {
  let cy = y;
  for (const b of blocks) {
    const lh = b.style.size * 1.95;
    const lines = wrap(b.text, width - (b.indent ?? 0), b.style);
    for (const [i, line] of lines.entries()) {
      cy += lh;
      if (pen) drawText(pen, line, x + (i > 0 ? (b.indent ?? 0) : 0), cy, b.style);
    }
    cy += b.gapAfter;
  }
  return cy - y;
}

function figLabelSpot(placed: Placed[], routes: Route[], area: Rect): Rect {
  const style = { size: 30, font: "script" as const };
  const w = measure("Fig. 1.", style) + 10;
  const h = 46;
  const minX = Math.min(...placed.map((p) => p.rect.x));
  const maxX = Math.max(...placed.map((p) => p.rect.x + p.rect.w));
  const maxY = Math.max(...placed.map((p) => p.rect.y + p.rect.h));
  const minY = Math.min(...placed.map((p) => p.rect.y));
  const cx = (minX + maxX) / 2;
  const blockers = [...placed.map((p) => inflate(p.rect, 20)), ...routes.flatMap(routeRects)];
  const cands: Rect[] = [
    { x: cx - w / 2, y: maxY + 46, w, h },
    { x: cx - w / 2, y: area.y + area.h - h, w, h },
    { x: area.x + area.w - w, y: area.y + area.h - h, w, h },
    { x: area.x, y: area.y + area.h - h, w, h },
    { x: area.x + area.w - w, y: area.y, w, h },
    { x: area.x, y: area.y, w, h },
    { x: cx - w / 2, y: minY - h - 40, w, h },
  ];
  return (
    cands.find((c) => c.y >= area.y && c.y + c.h <= area.y + area.h && !blockers.some((b) => rectsOverlap(b, c))) ?? cands[1]
  );
}

function svgDoc(title: string, layers: Record<string, string>): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = Object.entries(layers)
    .filter(([, d]) => d)
    .map(([id, d]) => `<path id="${id}" d="${d}"/>`)
    .join("\n");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="11in" height="17in" viewBox="0 0 ${SHEET.w} ${SHEET.h}">\n` +
    `<title>${esc(title)}</title>\n` +
    `<g fill="none" stroke="#000" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">\n${body}\n</g>\n</svg>\n`
  );
}

export function renderSheet(machine: Machine | null, date: Date = new Date()): RenderResult {
  const frame = new Pen();
  frame.rect(40, 40, 1020, 1620).rect(INNER.x, INNER.y, INNER.w, INNER.h);
  const tbTop = INNER.y + INNER.h - TITLE_BLOCK_H;
  frame.line(INNER.x, tbTop, INNER.x + INNER.w, tbTop);
  frame.line(420, tbTop, 420, INNER.y + INNER.h).line(820, tbTop, 820, INNER.y + INNER.h);

  const report: RenderReport = { shrink: 1, unroutedConnections: 0, relaxedCallouts: 0, missingCallouts: 0, textScale: 1, pathCount: 0 };
  if (!machine) {
    return { svg: svgDoc("Blank sheet", { frame: frame.data }), report };
  }

  const text = new Pen();
  const label = (s: string, x: number, y: number) => drawText(text, s, x, y, { size: 8.5, tracking: 1.2 });
  label("WITNESSES:", 70, tbTop + 22);
  text.line(90, tbTop + 52, 400, tbTop + 52).line(90, tbTop + 74, 400, tbTop + 74);
  label("INVENTOR:", 440, tbTop + 22);
  const sig = { size: 22, font: "script" as const, anchor: "middle" as const };
  drawText(text, machine.inventor, 620, tbTop + 62, { ...sig, size: fitSize(machine.inventor, 360, sig, 9) });
  label("SHEET", 840, tbTop + 22);
  drawText(text, "1 of 1", 934, tbTop + 60, { size: 16, anchor: "middle" });

  // Header.
  const date_ = patentDate(date);
  drawText(text, `No. ${patentNumber(machine.title)}.`, 90, 100, { size: 13 });
  drawText(text, `Patented ${date_}`, 1010, 100, { size: 13, anchor: "end" });
  const inv = { size: 14, tracking: 3, anchor: "middle" as const };
  drawText(text, machine.inventor.toUpperCase(), 550, 140, { ...inv, size: fitSize(machine.inventor.toUpperCase(), 820, inv, 8) });
  const title = machine.title.toUpperCase();
  let titleStyle: TextStyle = { size: 21, tracking: 2.2, anchor: "middle" };
  let titleLines: string[] | null = null;
  for (let size = 21; size >= 12 && !titleLines; size -= 1) {
    titleStyle = { size, tracking: size * 0.1, anchor: "middle" };
    titleLines = balancedWrap(title, 860, titleStyle, size > 16 ? 2 : 3);
  }
  titleLines ??= wrap(title, 860, titleStyle);
  let hy = 184;
  for (const line of titleLines) {
    drawText(text, line, 550, hy, titleStyle);
    hy += titleStyle.size * 1.6;
  }
  drawText(text, `APPLICATION FILED ${date_.toUpperCase()}`, 550, hy - 2, { size: 10, tracking: 1.5, anchor: "middle" });
  drawText(text, "1 SHEET-SHEET 1.", 1010, hy + 24, { size: 10, tracking: 1.2, anchor: "end" });

  // Drawing.
  const area: Rect = { x: 84, y: hy + 40, w: 932, h: 1150 - (hy + 40) };
  const { placed, shrink } = placeParts(machine, area);
  report.shrink = shrink;
  const routes = routeAll(placed, machine.connections, inflate(area, 10));
  report.unroutedConnections = routes.filter((r) => !r.ok).length;

  const parts = new Pen();
  for (const p of placed) {
    parts.at(p.cx, p.cy);
    p.geom.draw(parts);
  }
  parts.at(0, 0);
  const runs = new Pen();
  for (const r of routes) drawRoute(runs, r);

  const fig = figLabelSpot(placed, routes, area);
  drawText(text, "Fig. 1.", fig.x + fig.w / 2, fig.y + 36, { size: 30, font: "script", anchor: "middle" });

  // Reference numerals: parts first, then named runs, in even steps as in the old patents.
  const items: CalloutItem[] = [];
  const key: { num: number; label: string }[] = [];
  let num = 10;
  for (const p of placed) {
    items.push({ num, partIndex: p.index, targets: p.geom.lead.map((q) => ({ x: q.x + p.cx, y: q.y + p.cy })) });
    key.push({ num, label: p.part.label });
    num += 2;
  }
  routes.forEach((r, i) => {
    if (!r.conn.label) return;
    items.push({ num, routeIndex: i, targets: routeTargets(r) });
    key.push({ num, label: r.conn.label });
    num += 2;
  });
  const callouts: PlacedCallout[] = placeCallouts(items, placed, routes, area, [fig]);
  report.relaxedCallouts = callouts.filter((c) => c.relaxed).length;
  report.missingCallouts = items.length - callouts.length;
  const drawn = new Set(callouts.map((c) => c.num));
  const leads = new Pen();
  drawCallouts(leads, callouts);

  // Specification text below the figure.
  text.line(90, 1172, 1010, 1172);
  const colTop = 1180;
  const colBottom = tbTop - 14;
  const claims = machine.claims.map((c, i) => (/^\d+\./.test(c) ? c : `${i + 1}. ${c}`));
  const refs = key.filter((k) => drawn.has(k.num));
  let scale = 1;
  for (; scale > 0.55; scale -= 0.04) {
    const s = 10.5 * scale;
    const head: TextStyle = { size: s * 1.05, tracking: 1.6 };
    const body: TextStyle = { size: s };
    const left = [
      { text: "ABSTRACT", style: head, gapAfter: 2 },
      { text: machine.abstract, style: body, gapAfter: s * 1.6 },
      { text: "REFERENCE NUMERALS", style: head, gapAfter: 2 },
      ...refs.map((k) => ({ text: `${k.num}   ${k.label}`, style: body, gapAfter: 0, indent: s * 3 })),
    ];
    const right = [
      { text: "CLAIMS", style: head, gapAfter: 2 },
      { text: "What is claimed is:", style: body, gapAfter: s * 0.6 },
      ...claims.map((c) => ({ text: c, style: body, gapAfter: s * 0.9, indent: s * 1.6 })),
    ];
    const lh = paragraphs(null, left, 90, colTop, 430);
    const rh = paragraphs(null, right, 570, colTop, 440);
    if (lh <= colBottom - colTop && rh <= colBottom - colTop) {
      paragraphs(text, left, 90, colTop, 430);
      paragraphs(text, right, 570, colTop, 440);
      break;
    }
  }
  report.textScale = Math.round(scale * 100) / 100;

  const layers = { frame: frame.data, parts: parts.data, runs: runs.data, leads: leads.data, text: text.data };
  report.pathCount = Object.values(layers).filter(Boolean).length;
  return { svg: svgDoc(machine.title, layers), report };
}
