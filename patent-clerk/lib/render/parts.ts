// Parametric part library. Each builder returns geometry in local coordinates
// centered on (0, 0): a bounding box, ports where connections may attach (with the
// outward direction), lead points where a callout's lead line may touch the part,
// and a draw function that strokes the part with a Pen.
import type { PartType, Size } from "../machine/schema";
import { Pen, Pt, circlePts, rectPts } from "./pen";
import { drawText } from "./text";

export type Dir = "up" | "down" | "left" | "right";
export interface Port extends Pt {
  dir: Dir;
  /** Extra routing cost, so a gauge is fed through its stem rather than its dial. */
  cost?: number;
  /** The part already draws a flange here; the pipe should not add its own. */
  flanged?: boolean;
}
export interface PartGeom {
  w: number;
  h: number;
  ports: Port[];
  lead: Pt[];
  /** True for wheel-like parts that a belt can wrap around. */
  wheel?: { r: number };
  draw(pen: Pen): void;
}

export const SIZE_SCALE: Record<Size, number> = { small: 0.75, medium: 1, large: 1.3 };

const port = (x: number, y: number, dir: Dir, extra: Partial<Port> = {}): Port => ({ x, y, dir, ...extra });

function boiler(s: number): PartGeom {
  const W = 150 * s;
  const H = 240 * s;
  const valveH = 16 * s;
  const domeH = 0.22 * W;
  const legH = 26 * s;
  const ry = 10 * s;
  const domeTop = -H / 2 + valveH;
  const yT = domeTop + domeH;
  const yB = H / 2 - legH - ry;
  const half = W / 2;
  const ell = (x: number) => Math.sqrt(Math.max(0, 1 - (x / half) ** 2));
  return {
    w: W,
    h: H,
    ports: [
      port(0, -H / 2, "up"),
      port(-half, yT + (yB - yT) * 0.3, "left"),
      port(-half, yT + (yB - yT) * 0.7, "left"),
      port(half, yT + (yB - yT) * 0.3, "right"),
      port(half, yT + (yB - yT) * 0.7, "right"),
    ],
    lead: [
      { x: -half * 0.55, y: yT + (yB - yT) * 0.45 },
      { x: half * 0.6, y: yT + (yB - yT) * 0.2 },
      { x: 0, y: domeTop + domeH * 0.4 },
      { x: half * 0.55, y: yB - 10 * s },
    ],
    draw(p) {
      // Safety valve on the dome.
      p.rect(-8 * s, -H / 2 + 4 * s, 16 * s, valveH - 4 * s);
      p.rect(-12 * s, -H / 2, 24 * s, 4 * s);
      // Shell: dome, sides, bottom.
      p.M(-half, yT).A(half, domeH, 0, 1, half, yT);
      p.line(-half, yT, -half, yB).line(half, yT, half, yB);
      p.M(-half, yB).A(half, ry, 0, 0, half, yB);
      // Riveted seams.
      for (const f of [0.0, 0.42]) {
        const y = yT + (yB - yT) * f;
        p.M(-half, y).A(half, ry, 0, 0, half, y);
        for (let i = 1; i < 12; i++) {
          const x = -half + (W * i) / 12;
          p.circle(x, y + ry * ell(x) - 4 * s, 1.6 * s);
        }
      }
      // Firebox door with arched head.
      const dw = 0.38 * W;
      const dTop = yB - 0.3 * (yB - yT);
      const dBot = yB - 4 * s;
      p.M(-dw / 2, dBot).L(-dw / 2, dTop + dw / 2).A(dw / 2, dw / 2, 0, 1, dw / 2, dTop + dw / 2).L(dw / 2, dBot).Z();
      p.line(dw / 2 - 8 * s, (dTop + dBot) / 2 + 4 * s, dw / 2 - 8 * s, (dTop + dBot) / 2 + 14 * s);
      for (let i = 1; i <= 3; i++) {
        const x = -dw / 2 + (dw * i) / 4;
        p.line(x, dBot - 6 * s, x, dBot - 16 * s);
      }
      // Cylinder shading on the right flank, following the dome and the base.
      p.cylinderShade(half * 0.42, half - 2, (x) => yT - domeH * ell(x) + 3, (x) => yB + ry * ell(x) - 2, 10);
      // Legs and feet.
      for (const x of [-half * 0.7, half * 0.7]) {
        const top = yB + ry * ell(x);
        p.line(x - 5 * s, top, x - 7 * s, H / 2).line(x + 5 * s, top, x + 7 * s, H / 2);
        p.line(x - 14 * s, H / 2, x + 14 * s, H / 2);
      }
    },
  };
}

function tank(s: number): PartGeom {
  const W = 240 * s;
  const bodyH = 110 * s;
  const H = bodyH + 46 * s;
  const ry = bodyH / 2;
  const rx = 0.2 * ry;
  const cy = -H / 2 + 16 * s + ry;
  const xL = -W / 2 + rx;
  const xR = W / 2 - rx;
  return {
    w: W,
    h: H,
    ports: [
      port(-W / 2, cy, "left"),
      port(W / 2, cy, "right"),
      port(W * 0.22, -H / 2, "up"),
      port(-W * 0.12, cy - ry, "up"),
      port(0, H / 2, "down"),
    ],
    lead: [
      { x: -W * 0.2, y: cy + ry * 0.3 },
      { x: W * 0.32, y: cy - ry * 0.5 },
      { x: 0, y: cy + ry * 0.7 },
      { x: xL - rx * 0.4, y: cy },
    ],
    wheel: undefined,
    draw(p) {
      p.ellipse(xL, cy, rx, ry);
      p.line(xL, cy - ry, xR, cy - ry).line(xL, cy + ry, xR, cy + ry);
      p.M(xR, cy - ry).A(rx, ry, 0, 1, xR, cy + ry);
      // Straps.
      for (const x of [-W * 0.25, W * 0.05]) {
        p.line(x, cy - ry, x, cy + ry).line(x + 6 * s, cy - ry, x + 6 * s, cy + ry);
      }
      // Horizontal shading on the underside, denser toward the bottom.
      for (let i = 0; i < 8; i++) {
        const t = 1 - Math.pow(1 - (i + 0.5) / 8, 1.8);
        const y = cy + ry * (0.25 + 0.72 * t);
        const dx = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
        p.line(xL + dx, y, xR + dx - 2, y);
      }
      // Filler neck.
      const nx = W * 0.22;
      p.rect(nx - 9 * s, -H / 2 + 4 * s, 18 * s, cy - ry - (-H / 2 + 4 * s));
      p.rect(nx - 13 * s, -H / 2, 26 * s, 4 * s);
      // Saddles.
      for (const x of [-W * 0.3, W * 0.3]) {
        const top = cy + ry - 6 * s;
        p.poly([[x - 16 * s, top], [x + 16 * s, top], [x + 24 * s, H / 2], [x - 24 * s, H / 2]], true);
        p.hatch([rectPts(x - 15 * s, top + 4 * s, 30 * s, H / 2 - top - 6 * s)], 5 * s, 45);
      }
    },
  };
}

function gearOutline(R: number, teeth: number): Pt[] {
  const pts: Pt[] = [];
  const root = R * 0.85;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    for (const [f, r] of [
      [0, root],
      [0.18, R],
      [0.48, R],
      [0.66, root],
    ] as const) {
      pts.push({ x: r * Math.cos(a + f * step), y: r * Math.sin(a + f * step) });
    }
  }
  return pts;
}

function gear(s: number): PartGeom {
  const R = 72 * s;
  const teeth = Math.max(12, Math.round(18 * s));
  return {
    w: 2 * R,
    h: 2 * R,
    wheel: { r: R },
    ports: [port(0, -R, "up"), port(0, R, "down"), port(-R, 0, "left"), port(R, 0, "right")],
    lead: [
      { x: R * 0.6, y: -R * 0.6 },
      { x: -R * 0.6, y: R * 0.6 },
      { x: R * 0.6, y: R * 0.6 },
      { x: -R * 0.6, y: -R * 0.6 },
    ],
    draw(p) {
      p.poly(gearOutline(R, teeth), true);
      p.circle(0, 0, R * 0.7);
      p.circle(0, 0, R * 0.3);
      p.circle(0, 0, R * 0.11);
      p.rect(-R * 0.03, -R * 0.15, R * 0.06, R * 0.05);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        p.circle(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, R * 0.11);
      }
      p.hatch([circlePts(0, 0, R * 0.3), circlePts(0, 0, R * 0.11)], 4 * s, 45);
    },
  };
}

function flywheel(s: number): PartGeom {
  const R = 90 * s;
  return {
    w: 2 * R,
    h: 2 * R,
    wheel: { r: R },
    ports: [port(0, -R, "up"), port(0, R, "down"), port(-R, 0, "left"), port(R, 0, "right")],
    lead: [
      { x: R * 0.65, y: -R * 0.65 },
      { x: -R * 0.65, y: R * 0.65 },
      { x: R * 0.65, y: R * 0.65 },
      { x: -R * 0.65, y: -R * 0.65 },
    ],
    draw(p) {
      p.circle(0, 0, R);
      p.circle(0, 0, R * 0.84);
      p.circle(0, 0, R * 0.2);
      p.circle(0, 0, R * 0.08);
      p.hatch([circlePts(0, 0, R, 72), circlePts(0, 0, R * 0.84, 72)], 4.5 * s, 45);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 12;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        for (const side of [-1, 1]) {
          const w0 = R * 0.05 * side;
          const w1 = R * 0.03 * side;
          // Sample along the spoke so it meets the hub and rim circles.
          const r0 = Math.sqrt((R * 0.2) ** 2 - w0 ** 2);
          const r1 = Math.sqrt((R * 0.84) ** 2 - w1 ** 2);
          p.line(c * r0 - sn * w0, sn * r0 + c * w0, c * r1 - sn * w1, sn * r1 + c * w1);
        }
      }
    },
  };
}

function valve(s: number): PartGeom {
  const W = 112 * s;
  const H = 88 * s;
  const wheelY = -H / 2 + 7 * s;
  const bodyY = wheelY + 52 * s;
  const r = 22 * s;
  return {
    w: W,
    h: H,
    ports: [port(-W / 2, bodyY, "left", { flanged: true }), port(W / 2, bodyY, "right", { flanged: true }), port(0, H / 2, "down", { cost: 120 })],
    lead: [
      { x: r * 0.5, y: bodyY + r * 0.5 },
      { x: 26 * s, y: wheelY },
      { x: -r * 0.5, y: bodyY - r * 0.3 },
    ],
    draw(p) {
      // Handwheel and stem.
      p.ellipse(0, wheelY, 30 * s, 7 * s);
      p.line(-30 * s, wheelY, 30 * s, wheelY).line(0, wheelY - 7 * s, 0, wheelY + 7 * s);
      p.line(-3 * s, wheelY + 7 * s, -3 * s, wheelY + 18 * s).line(3 * s, wheelY + 7 * s, 3 * s, wheelY + 18 * s);
      // Bonnet with packing nut.
      p.rect(-8 * s, wheelY + 18 * s, 16 * s, 6 * s);
      p.poly([[-10 * s, wheelY + 24 * s], [10 * s, wheelY + 24 * s], [17 * s, bodyY - r + 4 * s], [-17 * s, bodyY - r + 4 * s]], true);
      // Globe body.
      p.circle(0, bodyY, r);
      p.hatch([circlePts(0, bodyY, r)], 4 * s, -45, 0);
      // Pipe ends with flanges.
      for (const side of [-1, 1]) {
        const x0 = side * r * 0.85;
        const x1 = side * (W / 2 - 6 * s);
        p.line(x0, bodyY - 10 * s, x1, bodyY - 10 * s).line(x0, bodyY + 10 * s, x1, bodyY + 10 * s);
        p.rect(side < 0 ? -W / 2 : x1, bodyY - 17 * s, 6 * s, 34 * s);
        p.circle(x1 + side * 3 * s, bodyY - 13 * s, 1.5 * s).circle(x1 + side * 3 * s, bodyY + 13 * s, 1.5 * s);
      }
      // Drain plug below.
      p.rect(-6 * s, bodyY + r - 1, 12 * s, H / 2 - bodyY - r + 1);
    },
  };
}

function gauge(s: number): PartGeom {
  const R = 46 * s;
  const W = 2 * R + 4 * s;
  const H = 2 * R + 40 * s;
  const cy = -H / 2 + R + 2 * s;
  return {
    w: W,
    h: H,
    ports: [port(0, H / 2, "down"), port(-W / 2, cy, "left", { cost: 600 }), port(W / 2, cy, "right", { cost: 600 })],
    lead: [
      { x: R * 0.72, y: cy - R * 0.72 },
      { x: -R * 0.72, y: cy + R * 0.72 },
      { x: R * 0.72, y: cy + R * 0.72 },
      { x: 0, y: H / 2 - 12 * s },
    ],
    draw(p) {
      p.circle(0, cy, R);
      p.circle(0, cy, R - 6 * s);
      p.hatch([circlePts(0, cy, R, 64), circlePts(0, cy, R - 6 * s, 64)], 3.2 * s, 45);
      const a0 = (135 * Math.PI) / 180;
      const span = (270 * Math.PI) / 180;
      for (let i = 0; i <= 20; i++) {
        const a = a0 + (span * i) / 20;
        const len = (i % 4 === 0 ? 9 : 4) * s;
        const r0 = R - 9 * s;
        p.line(Math.cos(a) * r0, cy + Math.sin(a) * r0, Math.cos(a) * (r0 - len), cy + Math.sin(a) * (r0 - len));
      }
      const labels = ["0", "", "", "", "", "10"];
      for (let i = 0; i <= 5; i++) {
        if (!labels[i]) continue;
        const a = a0 + (span * i) / 5;
        const rr = R - 26 * s;
        drawText(p, labels[i], Math.cos(a) * rr, cy + Math.sin(a) * rr + 3 * s, { size: 7 * s, anchor: "middle" });
      }
      // Needle.
      const na = (-35 * Math.PI) / 180;
      p.poly([
        [Math.cos(na) * (R - 14 * s), cy + Math.sin(na) * (R - 14 * s)],
        [Math.cos(na + Math.PI / 2) * 2.5 * s, cy + Math.sin(na + Math.PI / 2) * 2.5 * s],
        [-Math.cos(na) * 10 * s, cy - Math.sin(na) * 10 * s],
        [Math.cos(na - Math.PI / 2) * 2.5 * s, cy + Math.sin(na - Math.PI / 2) * 2.5 * s],
      ], true);
      p.circle(0, cy, 3 * s);
      // Stem with hex nut and thread.
      const sy = cy + R;
      p.line(-6 * s, sy, -6 * s, sy + 12 * s).line(6 * s, sy, 6 * s, sy + 12 * s);
      p.rect(-13 * s, sy + 12 * s, 26 * s, 12 * s);
      p.line(-4 * s, sy + 12 * s, -4 * s, sy + 24 * s).line(4 * s, sy + 12 * s, 4 * s, sy + 24 * s);
      p.rect(-5 * s, sy + 24 * s, 10 * s, H / 2 - sy - 24 * s);
      for (let y = sy + 27 * s; y < H / 2 - 1; y += 3 * s) p.line(-5 * s, y, 5 * s, y + 1.5 * s);
    },
  };
}

function funnel(s: number): PartGeom {
  const W = 130 * s;
  const H = 160 * s;
  const rimY = -H / 2 + 9 * s;
  const neckY = H / 2 - 54 * s;
  const nw = 10 * s;
  return {
    w: W,
    h: H,
    ports: [port(0, H / 2, "down"), port(-W / 2, rimY, "left", { cost: 300 }), port(W / 2, rimY, "right", { cost: 300 })],
    lead: [
      { x: -W * 0.25, y: rimY + (neckY - rimY) * 0.4 },
      { x: W * 0.22, y: rimY + (neckY - rimY) * 0.5 },
      { x: 0, y: H / 2 - 20 * s },
    ],
    draw(p) {
      p.ellipse(0, rimY, W / 2, 9 * s);
      p.ellipse(0, rimY, W / 2 - 5 * s, 6 * s);
      p.line(-W / 2, rimY, -nw, neckY).line(W / 2, rimY, nw, neckY);
      p.line(-nw, neckY, -7 * s, H / 2).line(nw, neckY, 7 * s, H / 2);
      p.M(-7 * s, H / 2).A(7 * s, 2.5 * s, 0, 0, 7 * s, H / 2);
      // Converging shading rays on the right of the cone.
      for (let i = 0; i < 9; i++) {
        const t = 1 - Math.pow(1 - (i + 0.5) / 9, 1.7);
        const xr = W / 2 * (0.3 + 0.68 * t);
        const yr = rimY + 9 * s * Math.sqrt(Math.max(0, 1 - (xr / (W / 2)) ** 2));
        p.line(xr, yr, nw * (0.3 + 0.68 * t), neckY);
      }
      // Seam band at the neck.
      p.line(-nw - 1, neckY, nw + 1, neckY);
      p.line(-nw + 0.5, neckY + 8 * s, nw - 0.5, neckY + 8 * s);
    },
  };
}

function crank(s: number): PartGeom {
  const W = 140 * s;
  const H = 92 * s;
  const hx = -W / 2 + 46 * s;
  const hr = 24 * s;
  const ex = W / 2 - 18 * s;
  const ey = 4 * s;
  return {
    w: W,
    h: H,
    ports: [port(-W / 2, 0, "left"), port(hx, H / 2, "down"), port(W / 2, ey, "right")],
    lead: [
      { x: (hx + ex) / 2, y: (0 + ey) / 2 + 2 * s },
      { x: hx - hr * 0.6, y: hr * 0.6 },
      { x: ex, y: -H / 2 + 14 * s },
    ],
    draw(p) {
      // Shaft stub.
      p.line(-W / 2, -6 * s, hx - hr, -6 * s).line(-W / 2, 6 * s, hx - hr, 6 * s).line(-W / 2, -6 * s, -W / 2, 6 * s);
      // Hub.
      p.circle(hx, 0, hr);
      p.circle(hx, 0, 7 * s);
      p.hatch([circlePts(hx, 0, hr), circlePts(hx, 0, 7 * s)], 4 * s, 45);
      // Tapered arm, tangent to hub and to the handle boss.
      const ang = Math.atan2(ey, ex - hx);
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const w0 = 13 * s;
      const w1 = 8 * s;
      for (const side of [-1, 1]) {
        p.line(hx + nx * w0 * side + Math.cos(ang) * hr * 0.8, ny * w0 * side + Math.sin(ang) * hr * 0.8, ex + nx * w1 * side - Math.cos(ang) * 8 * s, ey + ny * w1 * side - Math.sin(ang) * 8 * s);
      }
      p.circle(ex, ey, 11 * s);
      p.circle(ex, ey, 4 * s);
      // Handle grip rising toward the viewer.
      p.M(ex - 7 * s, ey - 11 * s).L(ex - 7 * s, -H / 2 + 7 * s).A(7 * s, 7 * s, 0, 1, ex + 7 * s, -H / 2 + 7 * s).L(ex + 7 * s, ey - 11 * s);
      p.cylinderShade(ex + 1 * s, ex + 6.5 * s, -H / 2 + 8 * s, ey - 12 * s, 4);
      // Mounting bracket under the hub.
      p.poly([[hx - 12 * s, hr * 0.8], [hx - 18 * s, H / 2], [hx + 18 * s, H / 2], [hx + 12 * s, hr * 0.8]]);
    },
  };
}

function spring(s: number): PartGeom {
  const W = 62 * s;
  const H = 170 * s;
  const plate = 8 * s;
  const rx = 24 * s;
  return {
    w: W,
    h: H,
    ports: [port(0, -H / 2, "up"), port(0, H / 2, "down"), port(-W / 2, -H / 2 + plate / 2, "left"), port(W / 2, H / 2 - plate / 2, "right")],
    lead: [
      { x: rx, y: -H * 0.15 },
      { x: -rx, y: H * 0.2 },
      { x: rx, y: H * 0.3 },
    ],
    draw(p) {
      p.rect(-W / 2, -H / 2, W, plate);
      p.rect(-W / 2, H / 2 - plate, W, plate);
      const y0 = -H / 2 + plate + 6 * s;
      const y1 = H / 2 - plate - 6 * s;
      const turns = Math.max(6, Math.round(9 * s));
      const pts: Pt[] = [];
      const n = turns * 32;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * turns * Math.PI * 2;
        pts.push({ x: rx * Math.cos(t + Math.PI), y: y0 + ((y1 - y0) * i) / n + 6 * s * Math.sin(t) });
      }
      p.line(-rx, -H / 2 + plate, -rx, y0).poly(pts).line(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[pts.length - 1].x, H / 2 - plate);
    },
  };
}

function glassJar(s: number): PartGeom {
  const W = 120 * s;
  const H = 165 * s;
  const lidH = 18 * s;
  const neck = W * 0.34;
  const half = W / 2;
  const shoulder = -H / 2 + lidH + 30 * s;
  const bot = H / 2 - 8 * s;
  const rr = 16 * s;
  const level = -H / 2 + lidH + 62 * s;
  return {
    w: W,
    h: H,
    ports: [port(0, -H / 2, "up"), port(-half, H * 0.12, "left"), port(half, H * 0.12, "right"), port(0, H / 2, "down")],
    lead: [
      { x: -half + 10 * s, y: H * 0.25 },
      { x: half - 12 * s, y: shoulder + 20 * s },
      { x: 0, y: -H / 2 + lidH / 2 },
    ],
    draw(p) {
      // Screw lid with knurling.
      p.rect(-neck - 4 * s, -H / 2, 2 * neck + 8 * s, lidH);
      for (let x = -neck; x <= neck; x += 6 * s) p.line(x, -H / 2 + 3 * s, x, -H / 2 + lidH - 3 * s);
      // Body outline: neck, shoulders, sides, rounded bottom.
      p.M(-neck, -H / 2 + lidH).L(-neck, -H / 2 + lidH + 8 * s).Q(-half, -H / 2 + lidH + 10 * s, -half, shoulder);
      p.L(-half, bot - rr).Q(-half, bot, -half + rr, bot).L(half - rr, bot).Q(half, bot, half, bot - rr).L(half, shoulder);
      p.Q(half, -H / 2 + lidH + 10 * s, neck, -H / 2 + lidH + 8 * s).L(neck, -H / 2 + lidH);
      p.line(-neck, -H / 2 + lidH + 8 * s, neck, -H / 2 + lidH + 8 * s);
      // Base ring.
      p.M(-half + rr, bot).A(half - rr, 7 * s, 0, 0, half - rr, bot);
      // Liquid level and bubbles.
      p.M(-half, level).A(half, 6 * s, 0, 0, half, level);
      p.M(-half, level).A(half, 6 * s, 0, 1, half, level);
      const bubbles = [[-20, 30, 4], [8, 48, 3], [22, 20, 5], [-6, 66, 2.5], [-28, 58, 3]];
      for (const [bx, by, br] of bubbles) p.circle(bx * s, level + by * s, br * s);
      // Glare: two highlight strokes on the left.
      p.line(-half + 9 * s, shoulder + 6 * s, -half + 9 * s, bot - 30 * s);
      p.line(-half + 15 * s, shoulder + 14 * s, -half + 15 * s, shoulder + 50 * s);
      // Shading on the right of the liquid.
      p.cylinderShade(half * 0.5, half - 2, (x) => level + 6 * s * Math.sqrt(Math.max(0, 1 - (x / half) ** 2)) + 3, bot - 4 * s, 7);
    },
  };
}

function piston(s: number): PartGeom {
  const W = 100 * s;
  const H = 190 * s;
  const top = -H / 2 + 50 * s;
  const bot = H / 2;
  const wall = 8 * s;
  const half = W / 2;
  const headTop = top + 34 * s;
  return {
    w: W,
    h: H,
    ports: [port(0, -H / 2, "up"), port(0, bot, "down"), port(-half, bot - 34 * s, "left"), port(half, bot - 34 * s, "right")],
    lead: [
      { x: -half + 4 * s, y: (top + bot) / 2 },
      { x: 6 * s, y: -H / 2 + 34 * s },
      { x: half - 4 * s, y: bot - 14 * s },
      { x: 0, y: headTop + 16 * s },
    ],
    draw(p) {
      // Cylinder in section: walls, base and gland, all hatched.
      const walls = [
        rectPts(-half, top, wall, bot - top),
        rectPts(half - wall, top, wall, bot - top),
        rectPts(-half + wall, bot - wall, W - 2 * wall, wall),
        rectPts(-half + wall, top, half - wall - 8 * s, wall),
        rectPts(8 * s, top, half - wall - 8 * s, wall),
      ];
      for (const w of walls) {
        p.poly(w, true);
        p.hatch([w], 4 * s, 45);
      }
      // Piston head with ring grooves.
      p.rect(-half + wall + 1, headTop, W - 2 * wall - 2, 30 * s);
      p.line(-half + wall + 1, headTop + 7 * s, half - wall - 1, headTop + 7 * s);
      p.line(-half + wall + 1, headTop + 12 * s, half - wall - 1, headTop + 12 * s);
      // Rod and eye.
      p.line(-6 * s, headTop, -6 * s, -H / 2 + 22 * s).line(6 * s, headTop, 6 * s, -H / 2 + 22 * s);
      p.circle(0, -H / 2 + 11 * s, 11 * s);
      p.circle(0, -H / 2 + 11 * s, 4.5 * s);
      p.cylinderShade(1 * s, 5.5 * s, -H / 2 + 22 * s, top - 2, 3);
    },
  };
}

function chimney(s: number): PartGeom {
  const W = 84 * s;
  const H = 250 * s;
  const smoke = 46 * s;
  const capY = -H / 2 + smoke;
  const plinth = 20 * s;
  const bw = 34 * s;
  const tw = 24 * s;
  const yTop = capY + 12 * s;
  const yBot = H / 2 - plinth;
  const xAt = (y: number) => tw + ((bw - tw) * (y - yTop)) / (yBot - yTop);
  return {
    w: W,
    h: H,
    ports: [port(0, H / 2, "down"), port(-W / 2, H / 2 - plinth / 2, "left"), port(W / 2, H / 2 - plinth / 2, "right")],
    lead: [
      { x: -xAt(0) + 4 * s, y: 0 },
      { x: xAt(yTop + 40 * s) - 4 * s, y: yTop + 40 * s },
      { x: 0, y: capY + 6 * s },
    ],
    draw(p) {
      p.rect(-30 * s, capY, 60 * s, 12 * s);
      p.poly([[-tw, yTop], [-bw, yBot], [bw, yBot], [tw, yTop]]);
      p.rect(-W / 2, yBot, W, plinth);
      // Brick courses.
      const course = 13 * s;
      let row = 0;
      for (let y = yTop + course; y < yBot - 2; y += course, row++) {
        const xr = xAt(y);
        p.line(-xr, y, xr, y);
        const yPrev = y - course;
        for (let x = -xr + ((row % 2) + 1) * 9 * s; x < xr - 4 * s; x += 18 * s) p.line(x, yPrev, x, y);
      }
      // Smoke wisps.
      const puffs = [[0, 30, 10], [12, 18, 12], [-6, 8, 9], [20, 4, 7]];
      for (const [x, y, r] of puffs) p.arc(x * s, -H / 2 + y * s, r * s, r * 0.8 * s, Math.PI * 0.85, Math.PI * 2.4);
    },
  };
}

function conveyor(s: number): PartGeom {
  const W = 290 * s;
  const H = 96 * s;
  const R = 20 * s;
  const cy = 2 * s;
  const xl = -W / 2 + R;
  const xr = W / 2 - R;
  return {
    w: W,
    h: H,
    ports: [port(-W / 2, cy, "left"), port(W / 2, cy, "right"), port(0, H / 2, "down")],
    lead: [
      { x: -W * 0.25, y: cy + R },
      { x: xr, y: cy },
      { x: W * 0.1, y: cy - R - 10 * s },
    ],
    draw(p) {
      for (const x of [xl, xr]) {
        p.circle(x, cy, R);
        p.circle(x, cy, 5 * s);
        p.hatch([circlePts(x, cy, 5 * s, 24)], 2.5 * s, 45);
      }
      p.line(xl, cy - R, xr, cy - R).line(xl, cy + R, xr, cy + R);
      // Idler rollers.
      for (let x = xl + 36 * s; x < xr - 20 * s; x += 36 * s) p.circle(x, cy - R + 6 * s, 5 * s);
      // Crates riding on top.
      const boxes = [-0.3, 0.02, 0.3];
      for (const f of boxes) {
        const bx = W * f;
        const bw = 32 * s;
        const bh = 24 * s;
        p.rect(bx - bw / 2, cy - R - bh, bw, bh);
        p.line(bx - bw / 2, cy - R - bh, bx + bw / 2, cy - R).line(bx + bw / 2, cy - R - bh, bx - bw / 2, cy - R);
      }
      // Frame legs.
      for (const x of [xl + 30 * s, xr - 30 * s]) {
        p.line(x - 4 * s, cy + R, x - 8 * s, H / 2).line(x + 4 * s, cy + R, x + 8 * s, H / 2);
        p.line(x - 14 * s, H / 2, x + 14 * s, H / 2);
      }
      p.line(xl + 30 * s, H / 2 - 12 * s, xr - 30 * s, H / 2 - 12 * s);
    },
  };
}

function bellows(s: number): PartGeom {
  const W = 150 * s;
  const H = 104 * s;
  const hinge = -W / 2 + 36 * s;
  const end = W / 2 - 26 * s;
  const spread = H / 2 - 10 * s;
  const yTopAt = (x: number) => -6 * s - ((x - hinge) / (end - hinge)) * (spread - 6 * s);
  return {
    w: W,
    h: H,
    ports: [port(-W / 2, 0, "left"), port(W / 2, -H / 2 + 10 * s, "right"), port(0, H / 2, "down")],
    lead: [
      { x: (hinge + end) / 2, y: yTopAt((hinge + end) / 2) + 2 * s },
      { x: -W / 2 + 14 * s, y: 0 },
      { x: (hinge + end) / 2 + 10 * s, y: 0 },
    ],
    draw(p) {
      // Nozzle.
      p.poly([[hinge, -7 * s], [-W / 2, -3 * s], [-W / 2, 3 * s], [hinge, 7 * s]]);
      p.line(-W / 2 + 10 * s, -4 * s, -W / 2 + 10 * s, 4 * s);
      // Boards.
      for (const side of [-1, 1]) {
        const y0 = side * 6 * s;
        const y1 = side * spread;
        p.poly([[hinge, y0], [end, y1], [end, y1 + side * 7 * s], [hinge, y0 + side * 4 * s]], true);
        // Handle loop.
        p.M(end, y1 + side * 2 * s).Q(W / 2 + 6 * s, y1 + side * 2 * s, W / 2, y1 + side * 9 * s);
        p.hatch([[{ x: hinge, y: y0 }, { x: end, y: y1 }, { x: end, y: y1 + side * 7 * s }, { x: hinge, y: y0 + side * 4 * s }]], 3 * s, 60);
      }
      // Leather folds.
      const folds = 6;
      for (let i = 1; i <= folds; i++) {
        const x = hinge + ((end - hinge) * i) / (folds + 1);
        const yt = yTopAt(x);
        const inset = 9 * s;
        p.poly([[x, yt], [x + inset, 0], [x, -yt]]);
      }
      p.line(end, yTopAt(end), end + 8 * s, 0).line(end + 8 * s, 0, end, -yTopAt(end));
    },
  };
}

function lever(s: number): PartGeom {
  const W = 230 * s;
  const H = 96 * s;
  const tilt = (-7 * Math.PI) / 180;
  const pivotY = -H / 2 + 34 * s;
  const rot = (x: number, y: number): [number, number] => [x * Math.cos(tilt) - y * Math.sin(tilt), pivotY + x * Math.sin(tilt) + y * Math.cos(tilt)];
  const half = W / 2 - 14 * s;
  const [lx, ly] = rot(-half, 0);
  const [rx, ry] = rot(half, 0);
  return {
    w: W,
    h: H,
    ports: [port(-W / 2, ly, "left"), port(W / 2, ry, "right"), port(0, H / 2, "down")],
    lead: [
      { x: -half * 0.5, y: rot(-half * 0.5, 0)[1] },
      { x: half * 0.55, y: rot(half * 0.55, 0)[1] },
      { x: 0, y: H / 2 - 18 * s },
    ],
    draw(p) {
      p.poly([rot(-half, -5 * s), rot(half, -5 * s), rot(half, 5 * s), rot(-half, 5 * s)], true);
      // End weight and handle knob.
      p.circle(lx, ly, 13 * s);
      p.hatch([circlePts(lx, ly, 13 * s, 32)], 4 * s, 45);
      p.circle(rx, ry, 8 * s);
      // Fulcrum.
      const tri = [{ x: 0, y: pivotY + 5 * s }, { x: 28 * s, y: H / 2 - 10 * s }, { x: -28 * s, y: H / 2 - 10 * s }];
      p.poly(tri, true);
      p.hatch([tri], 4.5 * s, 45);
      p.rect(-40 * s, H / 2 - 10 * s, 80 * s, 10 * s);
      p.circle(0, pivotY, 4 * s);
    },
  };
}

function horn(s: number): PartGeom {
  const W = 150 * s;
  const H = 132 * s;
  const tubeY = 22 * s;
  const tubeR = 6 * s;
  const throatX = -W / 2 + 18 * s;
  const bellX = W / 2 - 16 * s;
  const bellR = H / 2 - 2 * s;
  return {
    w: W,
    h: H,
    ports: [port(-W / 2, tubeY, "left"), port(throatX - 8 * s, tubeY + tubeR, "down", { cost: 80 })],
    lead: [
      { x: bellX - 30 * s, y: -bellR * 0.45 },
      { x: bellX, y: bellR * 0.6 },
      { x: throatX + 20 * s, y: tubeY + 2 * s },
    ],
    draw(p) {
      p.line(-W / 2, tubeY - tubeR, throatX, tubeY - tubeR).line(-W / 2, tubeY + tubeR, throatX, tubeY + tubeR);
      p.line(-W / 2, tubeY - tubeR, -W / 2, tubeY + tubeR);
      p.M(throatX, tubeY - tubeR).Q(bellX - 40 * s, tubeY - tubeR, bellX, -bellR);
      p.M(throatX, tubeY + tubeR).Q(bellX - 40 * s, tubeY + tubeR, bellX, bellR);
      p.ellipse(bellX, 0, 14 * s, bellR);
      p.ellipse(bellX, 0, 10 * s, bellR - 6 * s);
      // Flare petals.
      for (const f of [-0.55, 0, 0.55]) {
        p.M(throatX + 16 * s, tubeY + f * tubeR).Q(bellX - 34 * s, tubeY + f * tubeR * 2, bellX - 8 * s, f * (bellR - 6 * s) + (f === 0 ? 6 * s : 0));
      }
      // Shading on the underside of the flare.
      for (let i = 1; i <= 6; i++) {
        const t = i / 7;
        const x = throatX + 30 * s + (bellX - throatX - 40 * s) * t;
        const yb = tubeY + tubeR + (bellR - tubeY - tubeR) * Math.pow(t, 2.2) - 2 * s;
        p.line(x, yb - (8 + 18 * t) * s, x, yb);
      }
    },
  };
}

const BUILDERS: Record<PartType, (s: number) => PartGeom> = {
  boiler,
  tank,
  gear,
  flywheel,
  valve,
  gauge,
  funnel,
  crank,
  spring,
  glass_jar: glassJar,
  piston,
  chimney,
  conveyor,
  bellows,
  lever,
  horn,
};

export function buildPart(type: PartType, size: Size, shrink = 1): PartGeom {
  return BUILDERS[type](SIZE_SCALE[size] * shrink);
}

/** Parts that read best above whatever they connect to. */
export const PREFERS_ABOVE: ReadonlySet<PartType> = new Set(["chimney", "funnel", "gauge", "horn"]);
