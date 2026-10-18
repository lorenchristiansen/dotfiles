// Places parts on the drawing area: greedy, deterministic, graph-aware.
// Parts are visited breadth-first from the first (most important) part; each is put
// at the candidate spot next to its already placed neighbours that keeps connections
// short and the composition compact, never closer than GAP to another part so pipes
// and callouts always have a channel to run in.
import type { Machine, Part } from "../machine/schema";
import { buildPart, PartGeom, Port, PREFERS_ABOVE } from "./parts";
import { Rect, inflate, rectsOverlap } from "./pen";

export interface Placed {
  index: number;
  part: Part;
  geom: PartGeom;
  cx: number;
  cy: number;
  rect: Rect;
  ports: Port[]; // absolute
}

const GAP = 84;
const SNAP = 10;
// Small machines are drawn larger to fill the sheet; crowded ones step down.
const SHRINKS = [1.3, 1.18, 1.08, 1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.45];

function bfsOrder(n: number, adj: number[][]): number[] {
  const seen = new Array(n).fill(false);
  const order: number[] = [];
  for (let root = 0; root < n; root++) {
    if (seen[root]) continue;
    seen[root] = true;
    const queue = [root];
    while (queue.length) {
      const u = queue.shift()!;
      order.push(u);
      // Most-connected neighbours first, ties by importance (index).
      const next = adj[u].filter((v) => !seen[v]).sort((a, b) => adj[b].length - adj[a].length || a - b);
      for (const v of next) {
        seen[v] = true;
        queue.push(v);
      }
    }
  }
  return order;
}

function rectAt(cx: number, cy: number, g: PartGeom): Rect {
  return { x: cx - g.w / 2, y: cy - g.h / 2, w: g.w, h: g.h };
}

function tryPlace(machine: Machine, area: Rect, shrink: number): Placed[] | null {
  const parts = machine.parts;
  const n = parts.length;
  const idx = new Map(parts.map((p, i) => [p.id, i]));
  const adj: number[][] = parts.map(() => []);
  for (const c of machine.connections) {
    const a = idx.get(c.from)!;
    const b = idx.get(c.to)!;
    adj[a].push(b);
    adj[b].push(a);
  }
  const geoms = parts.map((p) => buildPart(p.type, p.size, shrink));
  const order = bfsOrder(n, adj);
  // Keep a margin inside the area for callout numerals around the outside.
  const maxW = area.w - 120;
  const maxH = area.h - 110;

  const pos: ({ cx: number; cy: number; rect: Rect } | null)[] = new Array(n).fill(null);
  let bbox: Rect | null = null;

  for (const i of order) {
    const g = geoms[i];
    if (!bbox) {
      pos[i] = { cx: 0, cy: 0, rect: rectAt(0, 0, g) };
      bbox = pos[i]!.rect;
      continue;
    }
    const placedNeighbours = adj[i].filter((j) => pos[j]);
    const anchors = placedNeighbours.length ? placedNeighbours : pos.map((p, j) => (p ? j : -1)).filter((j) => j >= 0);
    let best: { cx: number; cy: number; score: number } | null = null;

    const candidates: [number, number][] = [];
    for (const a of anchors) {
      const pa = pos[a]!;
      const ga = geoms[a];
      for (const gap of [GAP, GAP + 40, GAP + 110, GAP + 220]) {
        const dx = ga.w / 2 + gap + g.w / 2;
        const dy = ga.h / 2 + gap + g.h / 2;
        const xs = [pa.cx - dx, pa.cx, pa.cx + dx, pa.cx - ga.w / 2 + g.w / 2, pa.cx + ga.w / 2 - g.w / 2];
        const ys = [pa.cy - dy, pa.cy, pa.cy + dy, pa.cy - ga.h / 2 + g.h / 2, pa.cy + ga.h / 2 - g.h / 2];
        for (const x of xs) for (const y of ys) candidates.push([x, y]);
      }
    }
    // Anywhere else the composition could still grow into.
    for (let x = bbox.x + bbox.w - maxW + g.w / 2; x <= bbox.x + maxW - g.w / 2; x += 30) {
      for (let y = bbox.y + bbox.h - maxH + g.h / 2; y <= bbox.y + maxH - g.h / 2; y += 30) candidates.push([x, y]);
    }
    for (const [x, y] of candidates) {
      const cx = Math.round(x / SNAP) * SNAP;
      const cy = Math.round(y / SNAP) * SNAP;
      const r = rectAt(cx, cy, g);
      let ok = true;
      for (let j = 0; j < n && ok; j++) {
        if (pos[j] && rectsOverlap(inflate(r, GAP / 2 - 1), inflate(pos[j]!.rect, GAP / 2 - 1))) ok = false;
      }
      if (!ok) continue;
      const minX = Math.min(bbox.x, r.x);
      const minY = Math.min(bbox.y, r.y);
      const bw = Math.max(bbox.x + bbox.w, r.x + r.w) - minX;
      const bh = Math.max(bbox.y + bbox.h, r.y + r.h) - minY;
      if (bw > maxW || bh > maxH) continue;

      let score = 0;
      for (const j of placedNeighbours) {
        const pj = pos[j]!;
        score += Math.abs(pj.cx - cx) + Math.abs(pj.cy - cy);
        // Stacks, funnels, gauges and horns belong on top of what they serve.
        const iAbove = PREFERS_ABOVE.has(parts[i].type) && !PREFERS_ABOVE.has(parts[j].type);
        const jAbove = PREFERS_ABOVE.has(parts[j].type) && !PREFERS_ABOVE.has(parts[i].type);
        if (iAbove && cy + g.h / 2 > pj.cy - geoms[j].h / 2 + 10) score += 420;
        if (jAbove && pj.cy + geoms[j].h / 2 > cy - g.h / 2 + 10) score += 420;
      }
      // Fill the sheet's proportions rather than a long strip.
      score += 0.9 * Math.max(bw / maxW, bh / maxH) * 600;
      score += 0.15 * (Math.abs(cx) + Math.abs(cy));
      if (!best || score < best.score) best = { cx, cy, score };
    }
    if (!best) return null;
    pos[i] = { cx: best.cx, cy: best.cy, rect: rectAt(best.cx, best.cy, g) };
    const r = pos[i]!.rect;
    const minX = Math.min(bbox.x, r.x);
    const minY = Math.min(bbox.y, r.y);
    bbox = {
      x: minX,
      y: minY,
      w: Math.max(bbox.x + bbox.w, r.x + r.w) - minX,
      h: Math.max(bbox.y + bbox.h, r.y + r.h) - minY,
    };
  }

  // Center the composition in the area.
  const ox = Math.round(area.x + area.w / 2 - (bbox!.x + bbox!.w / 2));
  const oy = Math.round(area.y + area.h / 2 - (bbox!.y + bbox!.h / 2));
  return parts.map((part, i) => {
    const p = pos[i]!;
    const cx = p.cx + ox;
    const cy = p.cy + oy;
    const g = geoms[i];
    return {
      index: i,
      part,
      geom: g,
      cx,
      cy,
      rect: rectAt(cx, cy, g),
      ports: g.ports.map((q) => ({ x: q.x + cx, y: q.y + cy, dir: q.dir })),
    };
  });
}

export function placeParts(machine: Machine, area: Rect): { placed: Placed[]; shrink: number } {
  for (const shrink of SHRINKS) {
    const placed = tryPlace(machine, area, shrink);
    if (placed) return { placed, shrink };
  }
  // Unreachable in practice given the part cap; fall back to a plain grid.
  const shrink = SHRINKS[SHRINKS.length - 1];
  const cols = Math.ceil(Math.sqrt(machine.parts.length));
  const rows = Math.ceil(machine.parts.length / cols);
  const placed = machine.parts.map((part, i) => {
    const g = buildPart(part.type, part.size, shrink);
    const cx = area.x + ((i % cols) + 0.5) * (area.w / cols);
    const cy = area.y + (Math.floor(i / cols) + 0.5) * (area.h / rows);
    return { index: i, part, geom: g, cx, cy, rect: rectAt(cx, cy, g), ports: g.ports.map((q) => ({ x: q.x + cx, y: q.y + cy, dir: q.dir })) };
  });
  return { placed, shrink };
}
