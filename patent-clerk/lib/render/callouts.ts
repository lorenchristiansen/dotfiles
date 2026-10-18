// Reference numerals with lead lines. Every numeral box is checked against every
// part, every connection run, every other numeral and every other lead line; lead
// lines may not pass over other parts or numerals, or cross each other.
import type { Placed } from "./layout";
import type { Route } from "./route";
import { beltTangents } from "./route";
import { Pen, Pt, Rect, inflate, rectContains, rectsOverlap, segmentHitsRect, segmentsCross } from "./pen";
import { drawText, measure } from "./text";

export interface CalloutItem {
  num: number;
  targets: Pt[];
  partIndex?: number; // the part it labels, whose box the lead line may enter
  routeIndex?: number;
}

export interface PlacedCallout {
  num: number;
  box: Rect;
  from: Pt; // on the numeral box
  to: Pt; // on the part
  relaxed: boolean;
}

export const NUM_SIZE = 15;
const PAD_X = 5;
const PAD_Y = 6;
const ROUTE_HW = 9;

export function routeRects(route: Route): Rect[] {
  const segs: [Pt, Pt][] = [];
  if (route.belt) segs.push(...beltTangents(route.belt.a, route.belt.ra, route.belt.b, route.belt.rb));
  else for (let i = 0; i + 1 < route.points.length; i++) segs.push([route.points[i], route.points[i + 1]]);
  return segs.map(([a, b]) => {
    const x = Math.min(a.x, b.x) - ROUTE_HW;
    const y = Math.min(a.y, b.y) - ROUTE_HW;
    return { x, y, w: Math.abs(a.x - b.x) + 2 * ROUTE_HW, h: Math.abs(a.y - b.y) + 2 * ROUTE_HW };
  });
}

function routeSegments(route: Route): [Pt, Pt][] {
  if (route.belt) return beltTangents(route.belt.a, route.belt.ra, route.belt.b, route.belt.rb);
  const out: [Pt, Pt][] = [];
  for (let i = 0; i + 1 < route.points.length; i++) out.push([route.points[i], route.points[i + 1]]);
  return out;
}

/** Point where the ray from the box center toward t leaves the box. */
function exitPoint(box: Rect, t: Pt): Pt {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = t.x - cx;
  const dy = t.y - cy;
  const sx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/** Sample points along a route for connection numerals, skipping the ends. */
export function routeTargets(route: Route): Pt[] {
  const segs = routeSegments(route);
  const pts: Pt[] = [];
  for (const [a, b] of segs) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 50) continue;
    for (const f of [0.5, 0.3, 0.7]) pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  if (!pts.length && segs.length) {
    const [a, b] = segs[Math.floor(segs.length / 2)];
    pts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return pts;
}

export function placeCallouts(items: CalloutItem[], placed: Placed[], routes: Route[], area: Rect, reserved: Rect[] = []): PlacedCallout[] {
  const partRects = placed.map((p) => p.rect);
  const rRects = routes.map(routeRects);
  const rSegs = routes.flatMap(routeSegments);
  const done: PlacedCallout[] = [];
  const angles = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
  const dists = [34, 48, 64, 84, 108, 136, 170, 210, 260];

  type Cand = { box: Rect; from: Pt; to: Pt; base: number };

  const candidatesFor = (item: CalloutItem, relaxed: boolean): Cand[] => {
    const label = String(item.num);
    const bw = measure(label, { size: NUM_SIZE }) + 2 * PAD_X;
    const bh = NUM_SIZE + 2 * PAD_Y;
    const out: Cand[] = [];
    for (const t of item.targets) {
      for (const d of dists) {
        for (const a of angles) {
          const cx = t.x + Math.cos(a) * d;
          const cy = t.y + Math.sin(a) * d;
          const box = { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
          if (!rectContains(inflate(area, -4), box)) continue;
          if (partRects.some((r) => rectsOverlap(inflate(r, 5), box))) continue;
          if (reserved.some((r) => rectsOverlap(r, box))) continue;
          if (!relaxed && rRects.some((rs) => rs.some((r) => rectsOverlap(r, box)))) continue;
          const from = exitPoint(box, t);
          const to = t;
          // The lead line may enter only its own part.
          if (partRects.some((r, i) => i !== item.partIndex && segmentHitsRect(from, to, inflate(r, 2)))) continue;
          let crossings = 0;
          for (const [p, q] of rSegs) if (segmentsCross(from, to, p, q)) crossings++;
          const len = Math.hypot(to.x - from.x, to.y - from.y);
          // Lead lines read best at a slant, not dead horizontal or vertical.
          const slant = Math.abs(Math.sin(2 * Math.atan2(to.y - from.y, to.x - from.x)));
          out.push({ box, from, to, base: len + crossings * 140 + (1 - slant) * 18 + (relaxed ? 400 : 0) });
        }
      }
    }
    return out;
  };

  const conflicts = (c: Cand) =>
    done.some(
      (o) =>
        rectsOverlap(inflate(o.box, 6), c.box) ||
        segmentHitsRect(o.from, o.to, inflate(c.box, 3)) ||
        segmentHitsRect(c.from, c.to, inflate(o.box, 3)) ||
        segmentsCross(o.from, o.to, c.from, c.to),
    );

  // Most constrained items first.
  const pool = items.map((item) => ({ item, cands: candidatesFor(item, false) }));
  pool.sort((a, b) => a.cands.length - b.cands.length || a.item.num - b.item.num);

  for (const { item, cands } of pool) {
    let pick: Cand | undefined;
    let relaxed = false;
    for (const c of [...cands].sort((a, b) => a.base - b.base)) {
      if (!conflicts(c)) {
        pick = c;
        break;
      }
    }
    if (!pick) {
      relaxed = true;
      for (const c of candidatesFor(item, true).sort((a, b) => a.base - b.base)) {
        if (!conflicts(c)) {
          pick = c;
          break;
        }
      }
    }
    if (pick) done.push({ num: item.num, box: pick.box, from: pick.from, to: pick.to, relaxed });
  }
  return done.sort((a, b) => a.num - b.num);
}

export function drawCallouts(pen: Pen, callouts: PlacedCallout[]) {
  for (const c of callouts) {
    drawText(pen, String(c.num), c.box.x + c.box.w / 2, c.box.y + PAD_Y + NUM_SIZE, { size: NUM_SIZE, anchor: "middle" });
    // Slightly bowed lead line, in the hand-inked manner.
    const dx = c.to.x - c.from.x;
    const dy = c.to.y - c.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(7, len * 0.06);
    const mx = (c.from.x + c.to.x) / 2 + (-dy / len) * bow;
    const my = (c.from.y + c.to.y) / 2 + (dx / len) * bow;
    pen.M(c.from.x, c.from.y).Q(mx, my, c.to.x, c.to.y);
  }
}
