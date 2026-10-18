// Stroke-only drawing primitives. Everything the renderer emits goes through a Pen,
// which accumulates SVG path data (M/L/A/Q/Z only). No fills anywhere: shading is
// produced by hatch(), which clips parallel lines to polygons analytically.

export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export class Pen {
  private d: string[] = [];
  /** Translation applied to every coordinate, so parts can be drawn in local space. */
  ox = 0;
  oy = 0;

  at(ox: number, oy: number): this {
    this.ox = ox;
    this.oy = oy;
    return this;
  }

  private p(x: number, y: number) {
    return `${r2(x + this.ox)} ${r2(y + this.oy)}`;
  }

  M(x: number, y: number) {
    this.d.push(`M${this.p(x, y)}`);
    return this;
  }
  L(x: number, y: number) {
    this.d.push(`L${this.p(x, y)}`);
    return this;
  }
  Q(cx: number, cy: number, x: number, y: number) {
    this.d.push(`Q${this.p(cx, cy)} ${this.p(x, y)}`);
    return this;
  }
  A(rx: number, ry: number, large: 0 | 1, sweep: 0 | 1, x: number, y: number) {
    this.d.push(`A${r2(rx)} ${r2(ry)} 0 ${large} ${sweep} ${this.p(x, y)}`);
    return this;
  }
  Z() {
    this.d.push("Z");
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number) {
    return this.M(x1, y1).L(x2, y2);
  }

  poly(pts: Pt[] | number[][], close = false) {
    const arr = pts.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p));
    if (arr.length < 2) return this;
    this.M(arr[0].x, arr[0].y);
    for (let i = 1; i < arr.length; i++) this.L(arr[i].x, arr[i].y);
    if (close) this.Z();
    return this;
  }

  rect(x: number, y: number, w: number, h: number) {
    return this.poly(
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      true,
    );
  }

  circle(cx: number, cy: number, r: number) {
    return this.ellipse(cx, cy, r, r);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number) {
    return this.M(cx - rx, cy).A(rx, ry, 0, 1, cx + rx, cy).A(rx, ry, 0, 1, cx - rx, cy);
  }

  /** Elliptical arc from angle a0 to a1 (radians, y down, clockwise positive). */
  arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) {
    const steps = Math.max(2, Math.ceil((Math.abs(a1 - a0) / (Math.PI * 2)) * 48));
    const pts: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }
    return this.poly(pts);
  }

  /**
   * Parallel hatch lines clipped to one or more closed polygons (even-odd rule,
   * so an inner ring makes a hole). angle in degrees, 0 = horizontal.
   */
  hatch(rings: Pt[][], spacing: number, angleDeg: number, inset = 0) {
    const a = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // Rotate into a frame where hatch lines are horizontal.
    const rot = rings.map((ring) => ring.map((p) => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos })));
    let minY = Infinity;
    let maxY = -Infinity;
    for (const ring of rot) for (const p of ring) (minY = Math.min(minY, p.y)), (maxY = Math.max(maxY, p.y));
    const start = Math.ceil((minY + 0.01) / spacing) * spacing;
    for (let y = start; y < maxY; y += spacing) {
      const xs: number[] = [];
      for (const ring of rot) {
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i];
          const q = ring[(i + 1) % ring.length];
          if (p.y <= y !== q.y <= y) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
        }
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = xs[i] + inset;
        const x1 = xs[i + 1] - inset;
        if (x1 - x0 < 1.5) continue;
        // Rotate back.
        this.line(x0 * cos - y * sin, x0 * sin + y * cos, x1 * cos - y * sin, x1 * sin + y * cos);
      }
    }
    return this;
  }

  /**
   * Cylinder shading: vertical lines between x0 and x1 that get denser toward x1,
   * the classic engraving cue for a lit round surface.
   */
  cylinderShade(x0: number, x1: number, yTop: number | ((x: number) => number), yBot: number | ((x: number) => number), count: number) {
    for (let i = 0; i < count; i++) {
      const t = 1 - Math.pow(1 - (i + 0.5) / count, 1.8);
      const x = x0 + (x1 - x0) * t;
      const top = typeof yTop === "function" ? yTop(x) : yTop;
      const bot = typeof yBot === "function" ? yBot(x) : yBot;
      if (bot - top > 2) this.line(x, top, x, bot);
    }
    return this;
  }

  get data(): string {
    return this.d.join("");
  }

  get empty(): boolean {
    return this.d.length === 0;
  }
}

export function circlePts(cx: number, cy: number, r: number, n = 48, ry = r): Pt[] {
  return Array.from({ length: n }, (_, i) => ({
    x: cx + r * Math.cos((i / n) * Math.PI * 2),
    y: cy + ry * Math.sin((i / n) * Math.PI * 2),
  }));
}

export function rectPts(x: number, y: number, w: number, h: number): Pt[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export function inflate(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** True when segment pq passes through the interior of rect r. */
export function segmentHitsRect(p: Pt, q: Pt, r: Rect): boolean {
  // Liang-Barsky clipping.
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const checks: [number, number][] = [
    [-dx, p.x - r.x],
    [dx, r.x + r.w - p.x],
    [-dy, p.y - r.y],
    [dy, r.y + r.h - p.y],
  ];
  for (const [pp, qq] of checks) {
    if (pp === 0) {
      if (qq <= 0) return false;
    } else {
      const t = qq / pp;
      if (pp < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t1 - t0 > 1e-6;
}

export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
