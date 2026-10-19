import type Phaser from 'phaser';

/**
 * Процедурная изометрия. Мировые координаты измеряются в клетках (1 = ребро клетки), z — высота.
 * Угол обзора ≈ 30°: полуширина клетки 80 px, полувысота 46 px.
 */
export const HW = 80;
export const HH = 46;
export const ZP = 88;

export interface Pt { x: number; y: number }
export const P = (x: number, y: number, z = 0): Pt => ({ x: (x - y) * HW, y: (x + y) * HH - z * ZP });

/* ---------- цвет ---------- */
const ch = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as const;
const pack = (r: number, g: number, b: number) => (Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b)));
export const mix = (a: number, b: number, t: number) => { const [ar, ag, ab] = ch(a), [br, bg, bb] = ch(b); return pack(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t); };
export const lighten = (c: number, t: number) => mix(c, 0xffffff, t);
export const darken = (c: number, t: number) => mix(c, 0x05080f, t);
export const scale = (c: number, k: number) => { const [r, g, b] = ch(c); return pack(r * k, g * k, b * k); };

/* ---------- освещение ---------- */
const LIGHT = (() => { const v = [0.12, 0.62, 0.78]; const n = Math.hypot(...v); return v.map(c => c / n) as [number, number, number]; })();
const VIEW = (() => { const v = [1, 1, (2 * HH) / ZP]; const n = Math.hypot(...v); return v.map(c => c / n) as [number, number, number]; })();
const HALF = (() => { const v = [LIGHT[0] + VIEW[0], LIGHT[1] + VIEW[1], LIGHT[2] + VIEW[2]]; const n = Math.hypot(...v); return v.map(c => c / n) as [number, number, number]; })();
export const shade = (nx: number, ny: number, nz: number) => {
  const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  const spec = Math.pow(Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]), 22);
  return { k: 0.34 + 0.72 * diffuse, spec };
};
const visible = (nx: number, ny: number, nz: number) => nx * VIEW[0] + ny * VIEW[1] + nz * VIEW[2] > 0.001;

export interface Palette { top: number; left: number; right: number }
export const paint = (base: number): Palette => ({ top: lighten(base, 0.2), left: base, right: darken(base, 0.36) });

/** Рисовальщик с локальным началом координат (центр клетки). */
export class Drawer {
  g: Phaser.GameObjects.Graphics;
  ox = 0;
  oy = 0;
  oz = 0;
  constructor(g: Phaser.GameObjects.Graphics) { this.g = g; }
  at(x: number, y: number, z = 0) { this.ox = x; this.oy = y; this.oz = z; return this; }
  p(x: number, y: number, z = 0) { return P(this.ox + x, this.oy + y, this.oz + z); }

  poly(points: Pt[], color: number, alpha = 1) {
    this.g.fillStyle(color, alpha);
    this.g.beginPath();
    points.forEach((pt, i) => (i ? this.g.lineTo(pt.x, pt.y) : this.g.moveTo(pt.x, pt.y)));
    this.g.closePath();
    this.g.fillPath();
  }
  line(a: Pt, b: Pt, color: number, alpha = 1, width = 1) { this.g.lineStyle(width, color, alpha); this.g.lineBetween(a.x, a.y, b.x, b.y); }
  stroke(points: Pt[], color: number, alpha = 1, width = 1, close = true) {
    this.g.lineStyle(width, color, alpha);
    this.g.beginPath();
    points.forEach((pt, i) => (i ? this.g.lineTo(pt.x, pt.y) : this.g.moveTo(pt.x, pt.y)));
    if (close) this.g.closePath();
    this.g.strokePath();
  }

  /** Параллелепипед: видны верх, грань +y (слева) и грань +x (справа). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, base: number | Palette, edge = 0.22) {
    const c = typeof base === 'number' ? paint(base) : base;
    const p = (x: number, y: number, z: number) => this.p(x, y, z);
    this.poly([p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], c.left);
    this.poly([p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)], c.right);
    this.poly([p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], c.top);
    if (edge > 0) {
      this.line(p(x0, y1, z1), p(x1, y1, z1), 0xffffff, edge);
      this.line(p(x1, y1, z1), p(x1, y0, z1), 0xffffff, edge * 0.55);
      this.line(p(x0, y1, z0), p(x0, y1, z1), 0xffffff, edge * 0.5);
    }
  }
  /** Накладка на грань +y (лицо слева): прямоугольник в плоскости y = yy. */
  faceY(x0: number, x1: number, z0: number, z1: number, yy: number, color: number, alpha = 1) {
    this.poly([this.p(x0, yy, z0), this.p(x1, yy, z0), this.p(x1, yy, z1), this.p(x0, yy, z1)], color, alpha);
  }
  /** Накладка на грань +x (лицо справа). */
  faceX(y0: number, y1: number, z0: number, z1: number, xx: number, color: number, alpha = 1) {
    this.poly([this.p(xx, y0, z0), this.p(xx, y1, z0), this.p(xx, y1, z1), this.p(xx, y0, z1)], color, alpha);
  }
  /** Плоская плита на уровне z. */
  slab(x0: number, y0: number, x1: number, y1: number, z: number, color: number, alpha = 1) {
    this.poly([this.p(x0, y0, z), this.p(x1, y0, z), this.p(x1, y1, z), this.p(x0, y1, z)], color, alpha);
  }

  /** Цилиндр вдоль оси X; ось проходит через (y, z). Освещение считается по полосам. */
  cylX(x0: number, x1: number, y: number, z: number, r: number, base: number, opts: { caps?: 'end' | 'both' | 'none'; rz?: number; streaks?: number } = {}) {
    const N = 22, rz = opts.rz ?? r;
    const ring = (x: number, k: number) => P(this.ox + x, this.oy + y + r * Math.cos(k), this.oz + z + rz * Math.sin(k));
    for (let i = 0; i < N; i++) {
      const k0 = (i / N) * Math.PI * 2, k1 = ((i + 1) / N) * Math.PI * 2, km = (k0 + k1) / 2;
      const ny = Math.cos(km), nz = Math.sin(km);
      if (!visible(0, ny, nz)) continue;
      const { k, spec } = shade(0, ny, nz);
      const color = mix(scale(base, k), 0xffffff, Math.min(0.75, spec * 0.7));
      this.poly([ring(x0, k0), ring(x1, k0), ring(x1, k1), ring(x0, k1)], color);
    }
    if (opts.streaks) {
      const phase = opts.streaks;
      for (let s = 0; s < 3; s++) {
        const km = phase + (s * Math.PI * 2) / 3;
        const ny = Math.cos(km), nz = Math.sin(km);
        if (!visible(0, ny, nz)) continue;
        this.line(ring(x0 + 0.01, km), ring(x1 - 0.01, km), 0xffffff, 0.34, 1.5);
      }
    }
    const cap = (x: number, color: number) => this.poly(Array.from({ length: N }, (_, i) => ring(x, (i / N) * Math.PI * 2)), color);
    if (opts.caps !== 'none') {
      cap(x1, lighten(scale(base, 0.9), 0.1));
      this.stroke(Array.from({ length: N }, (_, i) => ring(x1, (i / N) * Math.PI * 2)), 0xffffff, 0.2, 1);
      if (opts.caps === 'both') cap(x0, scale(base, 0.5));
    }
  }
  /** Вертикальный цилиндр. */
  cylZ(x: number, y: number, z0: number, z1: number, r: number, base: number, cap = true) {
    const N = 20;
    const ring = (z: number, k: number) => P(this.ox + x + r * Math.cos(k), this.oy + y + r * Math.sin(k), this.oz + z);
    for (let i = 0; i < N; i++) {
      const k0 = (i / N) * Math.PI * 2, k1 = ((i + 1) / N) * Math.PI * 2, km = (k0 + k1) / 2;
      const nx = Math.cos(km), ny = Math.sin(km);
      if (!visible(nx, ny, 0)) continue;
      const { k, spec } = shade(nx, ny, 0);
      this.poly([ring(z0, k0), ring(z0, k1), ring(z1, k1), ring(z1, k0)], mix(scale(base, k), 0xffffff, Math.min(0.6, spec * 0.5)));
    }
    if (cap) this.poly(Array.from({ length: N }, (_, i) => ring(z1, (i / N) * Math.PI * 2)), lighten(base, 0.22));
  }
  /** Тень от параллелепипеда на полу (свет слева-сверху, тень падает назад и вправо). */
  shadow(x0: number, y0: number, x1: number, y1: number, h: number, alpha = 0.3) {
    const dx = h * 0.28, dy = -h * 0.42;
    const pts = [
      this.p(x0, y0, 0), this.p(x1, y0, 0), this.p(x1, y1, 0), this.p(x0, y1, 0),
      this.p(x0 + dx, y0 + dy, 0), this.p(x1 + dx, y0 + dy, 0), this.p(x1 + dx, y1 + dy, 0), this.p(x0 + dx, y1 + dy, 0),
    ];
    this.poly(hull(pts), 0x04070d, alpha);
    // мягкий контакт с полом
    const g = 0.05;
    this.poly(hull([this.p(x0 - g, y0 - g, 0), this.p(x1 + g, y0 - g, 0), this.p(x1 + g, y1 + g, 0), this.p(x0 - g, y1 + g, 0)]), 0x04070d, alpha * 0.55);
  }
}

/** Выпуклая оболочка (цепочка Эндрю). */
export function hull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper: Pt[] = [];
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

/** Контур коробки в экране (для областей нажатия и подсветки). */
export function boxHull(cx: number, cy: number, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): Pt[] {
  const pts: Pt[] = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push(P(cx + x, cy + y, z));
  return hull(pts);
}
export const cellCenter = (i: number, j: number) => ({ x: i + 0.5, y: j + 0.5 });
export const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
