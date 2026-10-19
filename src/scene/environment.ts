import type Phaser from 'phaser';
import { Drawer, P, hash, hull, lighten, darken, mix, scale, type Pt } from './iso';

/** Размеры комнаты: сетка W×H клеток плюс поля M со всех сторон. */
export const MARGIN = 0.6;
export const WALL_H = 2.35;
export const SLAB = 0.24;

export interface RoomBounds { minX: number; maxX: number; minY: number; maxY: number }
export function roomBounds(W: number, H: number): RoomBounds {
  const left = P(-MARGIN, H + MARGIN, 0), right = P(W + MARGIN, -MARGIN, 0), top = P(-MARGIN, -MARGIN, WALL_H), bottom = P(W + MARGIN, H + MARGIN, -SLAB);
  return { minX: left.x, maxX: right.x, minY: top.y, maxY: bottom.y };
}

const FLOOR = 0x4b5a72;
const FLOOR_ALT = 0x52627b;
const SEAM = 0x2a3447;
const AMBER = 0xf6a823;

function wallQuad(side: 'R' | 'L', a0: number, a1: number, z0: number, z1: number): Pt[] {
  return side === 'R'
    ? [P(a0, -MARGIN, z0), P(a1, -MARGIN, z0), P(a1, -MARGIN, z1), P(a0, -MARGIN, z1)]
    : [P(-MARGIN, a0, z0), P(-MARGIN, a1, z0), P(-MARGIN, a1, z1), P(-MARGIN, a0, z1)];
}
const wp = (side: 'R' | 'L', a: number, z: number) => (side === 'R' ? P(a, -MARGIN, z) : P(-MARGIN, a, z));

export function drawFloorAndWalls(g: Phaser.GameObjects.Graphics, W: number, H: number) {
  const d = new Drawer(g);
  const x0 = -MARGIN, y0 = -MARGIN, x1 = W + MARGIN, y1 = H + MARGIN;

  // плита: видимые боковые грани
  d.poly([P(x0, y1, -SLAB), P(x1, y1, -SLAB), P(x1, y1, 0), P(x0, y1, 0)], 0x1d2638);
  d.poly([P(x1, y0, -SLAB), P(x1, y1, -SLAB), P(x1, y1, 0), P(x1, y0, 0)], 0x121a29);
  d.line(P(x0, y1, 0), P(x1, y1, 0), 0xffffff, 0.16, 1.5);
  d.line(P(x1, y1, 0), P(x1, y0, 0), 0xffffff, 0.08, 1.5);
  d.line(P(x0, y1, -SLAB), P(x1, y1, -SLAB), 0x000000, 0.35, 1);

  // пол: поле, затем клетки сетки
  d.poly([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)], darken(FLOOR, 0.12));
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const n = hash(i, j);
      const base = mix((i + j) % 2 ? FLOOR : FLOOR_ALT, 0x5d6d87, n * 0.22);
      d.poly([P(i, j, 0), P(i + 1, j, 0), P(i + 1, j + 1, 0), P(i, j + 1, 0)], base);
      // фаска швов: светлая сверху-слева, тёмная снизу-справа
      d.line(P(i, j, 0), P(i + 1, j, 0), 0xffffff, 0.1, 1);
      d.line(P(i, j, 0), P(i, j + 1, 0), 0xffffff, 0.06, 1);
      d.line(P(i + 1, j, 0), P(i + 1, j + 1, 0), 0x000000, 0.28, 1);
      d.line(P(i, j + 1, 0), P(i + 1, j + 1, 0), 0x000000, 0.28, 1);
      // пятна и царапины
      if (n > 0.72) d.poly([P(i + 0.2 + n * 0.3, j + 0.3, 0), P(i + 0.5 + n * 0.3, j + 0.34, 0), P(i + 0.46 + n * 0.3, j + 0.5, 0), P(i + 0.18 + n * 0.3, j + 0.46, 0)], 0x000000, 0.08);
    }
  }
  // линия безопасного прохода по периметру рабочей зоны
  const inset = 0.06, wline = 0.045;
  const strip = (ax: number, ay: number, bx: number, by: number, w: number, h: number) => d.poly([P(ax, ay, 0), P(bx, by, 0), P(bx + w, by + h, 0), P(ax + w, ay + h, 0)], AMBER, 0.85);
  strip(inset, inset, W - inset, inset, 0, wline);
  strip(inset, H - inset - wline, W - inset, H - inset - wline, 0, wline);
  strip(inset, inset, inset, H - inset, wline, 0);
  strip(W - inset - wline, inset, W - inset - wline, H - inset, wline, 0);

  // стены
  const wallR = 0x3a4965, wallL = 0x2c3850;
  for (const side of ['L', 'R'] as const) {
    const len = side === 'R' ? W + 2 * MARGIN : H + 2 * MARGIN;
    const a0 = -MARGIN, a1 = a0 + len;
    const base = side === 'R' ? wallR : wallL;
    d.poly(wallQuad(side, a0, a1, 0, WALL_H), base);
    d.poly(wallQuad(side, a0, a1, 0, 0.78), darken(base, 0.28));
    d.poly(wallQuad(side, a0, a1, 0.78, 0.84), lighten(base, 0.2));
    d.poly(wallQuad(side, a0, a1, WALL_H - 0.14, WALL_H), darken(base, 0.45));
    d.line(wp(side, a0, WALL_H - 0.14), wp(side, a1, WALL_H - 0.14), 0xffffff, 0.12, 1);
    // панели
    for (let a = Math.ceil(a0); a <= a1; a++) {
      d.line(wp(side, a, 0.84), wp(side, a, WALL_H - 0.14), 0x000000, 0.22, 1);
      d.line(wp(side, a + 0.03, 0.84), wp(side, a + 0.03, WALL_H - 0.14), 0xffffff, 0.05, 1);
      d.line(wp(side, a, 0), wp(side, a, 0.78), 0x000000, 0.2, 1);
    }
    // плинтус-ограждение янтарного цвета
    d.poly(wallQuad(side, a0, a1, 0.0, 0.07), AMBER, 0.9);
    // окна
    const step = 2.1;
    for (let a = a0 + 0.55; a + 1.1 < a1; a += step) {
      const wa0 = a, wa1 = a + 1.1, wz0 = 1.12, wz1 = 2.0;
      d.poly(wallQuad(side, wa0 - 0.06, wa1 + 0.06, wz0 - 0.06, wz1 + 0.06), 0x8593ae);
      const bands = 10;
      for (let b = 0; b < bands; b++) {
        const t0 = b / bands, t1 = (b + 1) / bands;
        d.poly(wallQuad(side, wa0, wa1, wz1 - (wz1 - wz0) * t1, wz1 - (wz1 - wz0) * t0), mix(0x0b1730, 0x2a4a7a, Math.pow(t0, 1.4)));
      }
      // огни города за окном
      for (let k = 0; k < 9; k++) {
        const h1 = hash(a * 7 + k, side === 'R' ? 3 : 9), h2 = hash(a * 3 + k, 5 + k);
        const pt = wp(side, wa0 + 0.08 + h1 * 0.94, wz0 + 0.05 + h2 * 0.45);
        g.fillStyle(h1 > 0.6 ? 0xffd27d : 0xdfeaff, 0.5 + h2 * 0.4);
        g.fillCircle(pt.x, pt.y, 1.3 + h2 * 1.1);
      }
      // переплёт
      const mid = (wa0 + wa1) / 2;
      d.line(wp(side, mid, wz0), wp(side, mid, wz1), 0x8593ae, 1, 3);
      d.line(wp(side, wa0, (wz0 + wz1) / 2), wp(side, wa1, (wz0 + wz1) / 2), 0x8593ae, 1, 3);
      // блик на стекле
      d.poly([wp(side, wa0 + 0.08, wz1 - 0.05), wp(side, wa0 + 0.34, wz1 - 0.05), wp(side, wa0 + 0.14, wz0 + 0.05), wp(side, wa0 + 0.02, wz0 + 0.05)], 0xffffff, 0.06);
    }
  }
  // углы стен
  d.line(P(x0, y0, 0), P(x0, y0, WALL_H), 0xffffff, 0.12, 2);
}

/** Крупные несущие детали и реквизит. Все предметы стоят на полях и не пересекают клетки сетки. */
export interface Prop { depth: number; draw: (d: Drawer) => void }
export function buildProps(W: number, H: number): Prop[] {
  const props: Prop[] = [];
  const crate = (x: number, y: number, z: number, s: number, color: number, d: Drawer) => {
    d.box(x, y, z, x + s, y + s, z + s * 0.8, color);
    d.faceY(x + s * 0.08, x + s * 0.92, z + s * 0.1, z + s * 0.7, y + s, darken(color, 0.25), 0.55);
  };
  // стеллаж с инструментом у левой стены
  props.push({ depth: -MARGIN + 0.5 + (H * 0.2), draw: d => {
    const cx = -MARGIN + 0.04, cy = Math.min(H - 1.2, 0.35);
    d.at(0, 0, 0);
    d.shadow(cx, cy, cx + 0.46, cy + 0.85, 1.1, 0.28);
    d.box(cx, cy, 0, cx + 0.46, cy + 0.85, 1.1, 0x56647c);
    for (let k = 0; k < 4; k++) {
      d.faceY(cx + 0.02, cx + 0.44, 0.08 + k * 0.25, 0.28 + k * 0.25, cy + 0.85, darken(0x56647c, 0.16));
      d.faceY(cx + 0.18, cx + 0.3, 0.17 + k * 0.25, 0.2 + k * 0.25, cy + 0.85, 0xf6a823);
    }
    d.box(cx + 0.02, cy + 0.1, 1.1, cx + 0.2, cy + 0.34, 1.26, 0xaab5c4);
  } });
  // ящики в дальнем углу
  props.push({ depth: 0, draw: d => {
    d.at(0, 0, 0);
    d.shadow(-0.52, -0.52, -0.08, -0.08, 0.7, 0.28);
    crate(-0.52, -0.52, 0, 0.44, 0x7a8aa3, d);
    crate(-0.46, -0.46, 0.35, 0.34, 0x6a7b95, d);
  } });
  // бочка у правой стены
  const bx = Math.max(2.2, W - 0.9);
  props.push({ depth: bx - 0.4, draw: d => {
    d.at(0, 0, 0);
    d.shadow(bx - 0.18, -0.46, bx + 0.18, -0.1, 0.8, 0.28);
    d.cylZ(bx, -0.28, 0, 0.72, 0.18, 0x3a4a66);
    d.cylZ(bx, -0.28, 0.3, 0.38, 0.182, 0xf6a823, false);
    d.cylZ(bx, -0.28, 0.5, 0.54, 0.182, 0x24304a, false);
  } });
  // шкаф управления на правой стене
  const ex = Math.min(W - 1.8, 1.6);
  props.push({ depth: ex, draw: d => {
    d.at(0, 0, 0);
    d.box(ex, -MARGIN, 0.9, ex + 0.7, -MARGIN + 0.14, 1.9, 0x9aa7ba);
    d.faceY(ex + 0.06, ex + 0.64, 1.0, 1.8, -MARGIN + 0.14, 0x1c2638);
    for (let k = 0; k < 4; k++) d.faceY(ex + 0.12, ex + 0.58, 1.68 - k * 0.2, 1.74 - k * 0.2, -MARGIN + 0.14, k === 1 ? 0xf6a823 : 0x22c3b3, 0.75);
    // огнетушитель
    const fx = ex + 0.95;
    d.cylZ(fx, -MARGIN + 0.1, 0.55, 1.1, 0.07, 0xe8553f);
    d.box(fx - 0.035, -MARGIN + 0.04, 1.1, fx + 0.035, -MARGIN + 0.16, 1.18, 0x1c2638);
  } });
  // доска объявлений на левой стене: чертежи
  const ny = Math.min(H - 1.6, 1.4);
  props.push({ depth: ny, draw: d => {
    d.at(0, 0, 0);
    const left = (a: number, z: number) => P(-MARGIN, a, z);
    d.poly([left(ny, 1.15), left(ny + 1.0, 1.15), left(ny + 1.0, 1.95), left(ny, 1.95)], 0x6b7c98);
    d.poly([left(ny + 0.04, 1.19), left(ny + 0.96, 1.19), left(ny + 0.96, 1.91), left(ny + 0.04, 1.91)], 0xc9d3e0);
    [[0.1, 1.55, 0.4, 1.86], [0.5, 1.4, 0.88, 1.84], [0.12, 1.24, 0.46, 1.48]].forEach(([a, z0, a1, z1]) => {
      d.poly([left(ny + a, z0), left(ny + a1, z0), left(ny + a1, z1), left(ny + a, z1)], 0xf6f8fb);
      d.line(left(ny + a + 0.04, z0 + (z1 - z0) * 0.7), left(ny + a1 - 0.04, z0 + (z1 - z0) * 0.7), 0x31466a, 0.8, 1);
      d.line(left(ny + a + 0.04, z0 + (z1 - z0) * 0.4), left(ny + a1 - 0.08, z0 + (z1 - z0) * 0.4), 0x31466a, 0.6, 1);
    });
  } });
  return props;
}

/** Подвесной светильник над клеткой (cx, cy) в мировых координатах клетки. */
export function drawLamp(g: Phaser.GameObjects.Graphics, cx: number, cy: number) {
  const d = new Drawer(g);
  d.line(P(cx, cy, 3.6), P(cx, cy, 2.3), 0x0b111c, 0.9, 2);
  const N = 20, ring = (z: number, r: number, k: number) => P(cx + r * Math.cos(k), cy + r * Math.sin(k), z);
  // купол абажура: виден сверху, поэтому рисуем только внешнюю поверхность
  for (let i = 0; i < N; i++) {
    const k0 = (i / N) * Math.PI * 2, k1 = ((i + 1) / N) * Math.PI * 2, km = (k0 + k1) / 2;
    if (Math.cos(km) + Math.sin(km) <= -0.35) continue;
    const lit = 0.55 + 0.45 * Math.max(0, Math.sin(km + 0.9));
    d.poly([ring(2.3, 0.04, k0), ring(2.3, 0.04, k1), ring(2.0, 0.26, k1), ring(2.0, 0.26, k0)], scale(0x6a7890, 0.55 + lit * 0.65));
  }
  d.poly(Array.from({ length: N }, (_, i) => ring(2.3, 0.045, (i / N) * Math.PI * 2)), 0x252f45);
  // тёплый ободок: свет выходит вниз
  d.stroke(Array.from({ length: N }, (_, i) => ring(2.0, 0.26, (i / N) * Math.PI * 2)), 0xffe2a8, 0.95, 2);
}

export { hull };
