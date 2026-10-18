// Orthogonal connection routing. Builds a sparse grid from every port coordinate,
// obstacle edge and a regular lattice, then runs Dijkstra over (node, heading)
// states so routes avoid parts, prefer few bends, and steer clear of earlier runs.
// Belts between two wheels are drawn as tangent lines when nothing is in the way.
import type { Connection, ConnectionKind } from "../machine/schema";
import type { Placed } from "./layout";
import type { Dir, Port } from "./parts";
import { Pt, Rect, inflate, segmentHitsRect } from "./pen";

export interface Route {
  conn: Connection;
  kind: ConnectionKind;
  points: Pt[]; // polyline from the "from" port to the "to" port
  ends?: [Port, Port];
  /** Set for belts drawn around two wheels instead of along a polyline. */
  belt?: { a: Pt; ra: number; b: Pt; rb: number };
  ok: boolean;
}

const CLEAR = 26; // keep-out around parts: pipe half-width plus flange plus air
const STUB = CLEAR + 10;
const LATTICE = 20;
const BEND = 45;

const DV: Record<Dir, Pt> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

interface Seg {
  a: Pt;
  b: Pt;
}

function uniqSorted(vals: number[]): number[] {
  const s = [...new Set(vals.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
  return s;
}

/** Penalty for running a new edge near existing routes: overlap is very costly, crossing mildly. */
function edgePenalty(a: Pt, b: Pt, segs: Seg[]): number {
  let pen = 0;
  const horiz = a.y === b.y;
  const lo = horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
  const hi = horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  for (const s of segs) {
    const sh = s.a.y === s.b.y;
    if (sh === horiz) {
      const off = horiz ? Math.abs(s.a.y - a.y) : Math.abs(s.a.x - a.x);
      if (off < 26) {
        const slo = horiz ? Math.min(s.a.x, s.b.x) : Math.min(s.a.y, s.b.y);
        const shi = horiz ? Math.max(s.a.x, s.b.x) : Math.max(s.a.y, s.b.y);
        const overlap = Math.min(hi, shi) - Math.max(lo, slo);
        if (overlap > 0) pen += overlap * 30;
      }
    } else {
      const x = horiz ? s.a.x : a.x;
      const y = horiz ? a.y : s.a.y;
      const sx0 = Math.min(s.a.x, s.b.x);
      const sx1 = Math.max(s.a.x, s.b.x);
      const sy0 = Math.min(s.a.y, s.b.y);
      const sy1 = Math.max(s.a.y, s.b.y);
      const ex0 = Math.min(a.x, b.x);
      const ex1 = Math.max(a.x, b.x);
      const ey0 = Math.min(a.y, b.y);
      const ey1 = Math.max(a.y, b.y);
      if (x >= sx0 - 14 && x <= sx1 + 14 && y >= sy0 - 14 && y <= sy1 + 14 && x >= ex0 && x <= ex1 && y >= ey0 && y <= ey1) pen += 700;
    }
  }
  return pen;
}

class Heap<T> {
  private a: { k: number; v: T }[] = [];
  push(k: number, v: T) {
    const a = this.a;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): { k: number; v: T } | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i > 0; i--) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    if ((Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01)) out.splice(i, 1);
  }
  return out;
}

const DIRS: Dir[] = ["up", "down", "left", "right"];

function beltTangents(a: Pt, ra: number, b: Pt, rb: number): [Pt, Pt][] {
  // External tangents of two circles (open belt).
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  const phi = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / d)));
  return [1, -1].map((sgn) => {
    const ang = base + sgn * phi;
    return [
      { x: a.x + ra * Math.cos(ang), y: a.y + ra * Math.sin(ang) },
      { x: b.x + rb * Math.cos(ang), y: b.y + rb * Math.sin(ang) },
    ] as [Pt, Pt];
  });
}

export function routeAll(placed: Placed[], connections: Connection[], bounds: Rect): Route[] {
  const byId = new Map(placed.map((p) => [p.part.id, p]));
  const obstacles = placed.map((p) => inflate(p.rect, CLEAR));
  const usedPorts = new Set<string>();
  const segs: Seg[] = [];
  const routes: Route[] = [];

  // Route short connections first; they have the fewest good options.
  const ordered = [...connections].sort((c1, c2) => {
    const d = (c: Connection) => {
      const a = byId.get(c.from)!;
      const b = byId.get(c.to)!;
      return Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
    };
    return d(c1) - d(c2);
  });

  for (const conn of ordered) {
    const A = byId.get(conn.from)!;
    const B = byId.get(conn.to)!;

    if (conn.kind === "belt" && A.geom.wheel && B.geom.wheel) {
      const ca = { x: A.cx, y: A.cy };
      const cb = { x: B.cx, y: B.cy };
      const tans = beltTangents(ca, A.geom.wheel.r, cb, B.geom.wheel.r);
      const clear = tans.every(([p, q]) => placed.every((o) => o === A || o === B || !segmentHitsRect(p, q, inflate(o.rect, 6))));
      if (clear) {
        routes.push({ conn, kind: "belt", points: [ca, cb], belt: { a: ca, ra: A.geom.wheel.r, b: cb, rb: B.geom.wheel.r }, ok: true });
        for (const [p, q] of tans) segs.push({ a: p, b: q });
        continue;
      }
    }

    const pid = (p: Placed, i: number) => `${p.part.id}#${i}`;
    const stubOf = (q: Port): Pt => ({ x: q.x + DV[q.dir].x * STUB, y: q.y + DV[q.dir].y * STUB });
    const stubFree = (q: Port, self: Placed) => {
      const s = stubOf(q);
      return placed.every((o, j) => o === self || !(s.x > obstacles[j].x && s.x < obstacles[j].x + obstacles[j].w && s.y > obstacles[j].y && s.y < obstacles[j].y + obstacles[j].h));
    };
    const starts = A.ports.map((q, i) => ({ q, i })).filter(({ q }) => stubFree(q, A));
    const goals = B.ports.map((q, i) => ({ q, i })).filter(({ q }) => stubFree(q, B));

    // Every port's approach corridor is reserved for whichever run uses that port.
    const corridors: Rect[] = [];
    for (const o of placed) {
      for (const q of o.ports) {
        const e = stubOf(q);
        const vertical = q.dir === "up" || q.dir === "down";
        // Widen sideways only, so the stub end itself stays reachable.
        corridors.push({
          x: Math.min(q.x, e.x) - (vertical ? 14 : 0),
          y: Math.min(q.y, e.y) - (vertical ? 0 : 14),
          w: Math.abs(q.x - e.x) + (vertical ? 28 : 0),
          h: Math.abs(q.y - e.y) + (vertical ? 0 : 28),
        });
      }
    }
    const corridorPenalty = (a: Pt, b: Pt) => {
      let pen = 0;
      for (const c of corridors) if (segmentHitsRect(a, b, c)) pen += 1500;
      return pen;
    };

    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = bounds.x; x <= bounds.x + bounds.w; x += LATTICE) xs.push(x);
    for (let y = bounds.y; y <= bounds.y + bounds.h; y += LATTICE) ys.push(y);
    for (const o of obstacles) xs.push(o.x, o.x + o.w), ys.push(o.y, o.y + o.h);
    for (const { q } of [...starts, ...goals]) {
      const s = stubOf(q);
      xs.push(s.x);
      ys.push(s.y);
    }
    const X = uniqSorted(xs.filter((x) => x >= bounds.x && x <= bounds.x + bounds.w));
    const Y = uniqSorted(ys.filter((y) => y >= bounds.y && y <= bounds.y + bounds.h));
    const xi = new Map(X.map((v, i) => [v, i]));
    const yi = new Map(Y.map((v, i) => [v, i]));
    const key = (i: number, j: number) => i * Y.length + j;
    const inside = (x: number, y: number) => obstacles.some((o) => x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h);
    const blocked = new Uint8Array(X.length * Y.length);
    for (let i = 0; i < X.length; i++) for (let j = 0; j < Y.length; j++) blocked[key(i, j)] = inside(X[i], Y[j]) ? 1 : 0;

    const nStates = X.length * Y.length * 4;
    const dist = new Float64Array(nStates).fill(Infinity);
    const prev = new Int32Array(nStates).fill(-1);
    const heap = new Heap<number>();
    const r2 = (v: number) => Math.round(v * 100) / 100;

    for (const { q, i } of starts) {
      const s = stubOf(q);
      const ii = xi.get(r2(s.x));
      const jj = yi.get(r2(s.y));
      if (ii === undefined || jj === undefined) continue;
      const st = key(ii, jj) * 4 + DIRS.indexOf(q.dir);
      const c0 = (usedPorts.has(pid(A, i)) ? 400 : 0) + (q.cost ?? 0);
      if (c0 < dist[st]) {
        dist[st] = c0;
        prev[st] = -2 - i; // encodes the start port
        heap.push(c0, st);
      }
    }
    const goalAt = new Map<number, { q: Port; i: number }>();
    for (const g of goals) {
      const s = stubOf(g.q);
      const ii = xi.get(r2(s.x));
      const jj = yi.get(r2(s.y));
      if (ii !== undefined && jj !== undefined) goalAt.set(key(ii, jj), g);
    }

    let found = -1;
    let foundCost = Infinity;
    while (heap.size) {
      const { k, v } = heap.pop()!;
      if (k > dist[v] || k >= foundCost) continue;
      const node = Math.floor(v / 4);
      const dir = DIRS[v % 4];
      const i = Math.floor(node / Y.length);
      const j = node % Y.length;
      const g = goalAt.get(node);
      if (g) {
        // Must arrive heading into the port (opposite of its outward direction).
        const into = DV[g.q.dir];
        const arriving = DV[dir];
        const extra = (arriving.x === -into.x && arriving.y === -into.y ? 0 : BEND * 2) + (usedPorts.has(pid(B, g.i)) ? 400 : 0) + (g.q.cost ?? 0);
        if (k + extra < foundCost) {
          foundCost = k + extra;
          found = v;
        }
      }
      for (const nd of DIRS) {
        const dv = DV[nd];
        if (dv.x === -DV[dir].x && dv.y === -DV[dir].y) continue;
        const ni = i + dv.x;
        const nj = j + dv.y;
        if (ni < 0 || nj < 0 || ni >= X.length || nj >= Y.length) continue;
        if (blocked[key(ni, nj)]) continue;
        const a = { x: X[i], y: Y[j] };
        const b = { x: X[ni], y: Y[nj] };
        if (obstacles.some((o) => segmentHitsRect(a, b, o))) continue;
        const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        const cost = k + len + (nd === dir ? 0 : BEND) + edgePenalty(a, b, segs) + corridorPenalty(a, b);
        const ns = key(ni, nj) * 4 + DIRS.indexOf(nd);
        if (cost < dist[ns]) {
          dist[ns] = cost;
          prev[ns] = v;
          heap.push(cost, ns);
        }
      }
    }

    if (found < 0) {
      // No clear channel: draw straight between centers rather than drop the connection.
      routes.push({ conn, kind: conn.kind, points: [{ x: A.cx, y: A.cy }, { x: B.cx, y: B.cy }], ok: false });
      continue;
    }

    const path: Pt[] = [];
    let cur = found;
    let startIdx = -1;
    for (;;) {
      const node = Math.floor(cur / 4);
      path.push({ x: X[Math.floor(node / Y.length)], y: Y[node % Y.length] });
      const p = prev[cur];
      if (p <= -2) {
        startIdx = -2 - p;
        break;
      }
      cur = p;
    }
    path.reverse();
    const sp = A.ports[startIdx];
    const goal = goalAt.get(Math.floor(found / 4))!;
    const points = simplify([{ x: sp.x, y: sp.y }, ...path, { x: goal.q.x, y: goal.q.y }]);
    usedPorts.add(pid(A, startIdx));
    usedPorts.add(pid(B, goal.i));
    for (let k = 0; k + 1 < points.length; k++) segs.push({ a: points[k], b: points[k + 1] });
    routes.push({ conn, kind: conn.kind, points, ends: [sp, goal.q], ok: true });
  }
  return routes;
}

export { beltTangents };
