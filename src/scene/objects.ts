import { Drawer, P, darken, lighten, mix, hash, type Pt } from './iso';

/** Геометрия детали нормирована: длина заготовки всегда PART_LEN, радиус PART_R. Пропорции участков сохраняются. */
export const PART_LEN = 0.56;
export const PART_R = 0.095;
export const AXIS_Z = 0.66;
const CHUCK_X = -0.24;

const C = {
  steelRaw: 0x8f9db0, steelBright: 0xdde7f1, body: 0xe1e8f0, bodyShade: 0xc3cddb, dark: 0x39455f, darker: 0x252f45, cast: 0x9aa8bb,
  amber: 0xf6a823, teal: 0x22c3b3, green: 0x3fbd6a, red: 0xe8553f,
};

export interface PartSpec { blankDiameter: number; blankLength: number; ops: { diameter: number; length: number }[] }
export interface Segment { x0: number; x1: number; r: number; machined: boolean }

export function partSegments(spec: PartSpec, doneOps: number, progress: number): Segment[] {
  const unit = PART_LEN / spec.blankLength;
  const total = spec.ops.reduce((s, o) => s + o.length, 0);
  const segs: Segment[] = [];
  let x = 0;
  const shoulder = Math.max(0, spec.blankLength - total) * unit;
  if (shoulder > 0) { segs.push({ x0: 0, x1: shoulder, r: PART_R, machined: false }); x = shoulder; }
  spec.ops.forEach((op, i) => {
    const x1 = x + op.length * unit, r = PART_R * Math.max(0.15, Math.min(1, op.diameter / spec.blankDiameter));
    if (i < doneOps) segs.push({ x0: x, x1, r, machined: true });
    else if (i === doneOps && progress > 0) {
      const xm = x + (x1 - x) * progress;
      segs.push({ x0: x, x1: xm, r, machined: true }, { x0: xm, x1, r: PART_R, machined: false });
    } else segs.push({ x0: x, x1, r: PART_R, machined: false });
    x = x1;
  });
  return segs;
}

export function drawPart(d: Drawer, x0: number, y: number, z: number, segs: Segment[], k = 1, streak = 0) {
  for (const s of segs) {
    if (s.x1 - s.x0 < 0.002) continue;
    d.cylX(x0 + s.x0 * k, x0 + s.x1 * k, y, z, s.r * k, s.machined ? C.steelBright : C.steelRaw, { caps: 'end', streaks: streak || undefined, rz: s.r * k });
  }
}

/** Положение инструмента вдоль оси для операции opIndex при прогрессе progress. */
export function toolPosition(spec: PartSpec, opIndex: number, progress: number) {
  const unit = PART_LEN / spec.blankLength;
  const total = spec.ops.reduce((s, o) => s + o.length, 0);
  let start = Math.max(0, spec.blankLength - total);
  for (let i = 0; i < opIndex; i++) start += spec.ops[i].length;
  const op = spec.ops[opIndex];
  const x = CHUCK_X + (start + op.length * progress) * unit;
  const r = PART_R * Math.max(0.15, Math.min(1, op.diameter / spec.blankDiameter));
  return { x, r };
}

/** Напольная разметка: чередующиеся янтарные и тёмные полосы по периметру. */
export function hazardFrame(d: Drawer, x0: number, y0: number, x1: number, y1: number, w = 0.055, seg = 0.11) {
  const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(len / seg));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const p0 = [ax + (bx - ax) * t0, ay + (by - ay) * t0], p1 = [ax + (bx - ax) * t1, ay + (by - ay) * t1];
      d.poly([d.p(p0[0], p0[1]), d.p(p1[0], p1[1]), d.p(p1[0] + nx * w, p1[1] + ny * w), d.p(p0[0] + nx * w, p0[1] + ny * w)], i % 2 ? 0x1a2233 : C.amber, 0.9);
    }
  };
  edge(x0, y0, x1, y0, 0, w); edge(x0, y1 - w, x1, y1 - w, 0, w); edge(x0, y0, x0, y1, w, 0); edge(x1 - w, y0, x1 - w, y1, w, 0);
}

/* ---------------------------------------------------------------- токарный станок */
export interface LatheView {
  loaded: boolean; processing: boolean; progress: number; doneOps: number; opIndex: number; finished: boolean;
  phase: number; time: number; alert: number; ready: boolean; hidePart?:boolean;
}
export const LATHE_BOX = { x0: -0.64, x1: 0.64, y0: -0.26, y1: 0.26, h: 1.0 };

export function drawLathe(d: Drawer, spec: PartSpec, v: LatheView): { tip: Pt | null; chuck: Pt } {
  d.shadow(-0.62, -0.24, 0.62, 0.24, 0.95, 0.34);
  d.slab(-0.7, -0.3, 0.7, 0.3, 0.002, 0x1a2233, 0.4);
  hazardFrame(d, -0.74, -0.34, 0.74, 0.34);

  // тумбы
  for (const [a, b] of [[-0.58, -0.2], [0.2, 0.58]] as const) {
    d.box(a, -0.21, 0, b, 0.21, 0.3, C.dark, 0.14);
    d.faceY(a + 0.03, b - 0.03, 0.04, 0.26, 0.21, C.darker, 0.8);
    d.faceY((a + b) / 2 - 0.012, (a + b) / 2 + 0.012, 0.1, 0.2, 0.21, 0xc3cddb, 0.9);
  }
  // стружкосборник
  d.box(-0.2, -0.17, 0.04, 0.2, 0.17, 0.15, C.darker, 0.1);
  const chipCount = Math.round((v.doneOps + v.progress) * 22) + (v.finished ? 4 : 0);
  for (let i = 0; i < chipCount; i++) {
    const h1 = hash(i, 1), h2 = hash(i, 2);
    const p = d.p(-0.17 + h1 * 0.34, -0.12 + h2 * 0.24, 0.155);
    d.g.fillStyle(h1 > 0.5 ? 0xdde7f1 : 0x9aa8bb, 0.95); d.g.fillRect(p.x, p.y, 3, 1.6);
  }

  // станина и направляющие
  d.box(-0.64, -0.24, 0.3, 0.64, 0.24, 0.4, C.cast, 0.16);
  d.box(-0.3, -0.13, 0.4, 0.6, -0.09, 0.43, 0xd7e0ea, 0.12);
  d.box(-0.3, 0.09, 0.4, 0.6, 0.13, 0.43, 0xd7e0ea, 0.12);

  // передняя бабка
  d.box(-0.64, -0.24, 0.4, -0.34, 0.24, 0.84, C.body, 0.24);
  d.faceY(-0.62, -0.36, 0.43, 0.46, 0.24, C.bodyShade, 0.9);
  // панель управления
  d.faceY(-0.6, -0.4, 0.52, 0.76, 0.24, 0x0f1726);
  d.faceY(-0.595, -0.405, 0.525, 0.755, 0.24, 0x1b2740, 0.9);
  const bar = (i: number, w: number, color: number, alpha = 1) => d.faceY(-0.58, -0.58 + 0.16 * w, 0.7 - i * 0.055, 0.73 - i * 0.055, 0.241, color, alpha);
  if (v.alert > 0.05) { bar(0, 1, C.red, 0.5 + v.alert * 0.5); bar(1, 0.6, C.red, 0.5); }
  else if (v.processing) { bar(0, v.progress, C.amber); bar(1, 0.5 + 0.4 * Math.sin(v.time / 180), C.amber, 0.7); bar(2, 0.3 + 0.3 * Math.sin(v.time / 120 + 1), C.teal, 0.8); }
  else if (v.loaded) { bar(0, 1, C.teal, 0.85); bar(1, 0.4, C.teal, 0.45); }
  else bar(0, 0.25, C.teal, 0.35);
  d.faceY(-0.58, -0.54, 0.53, 0.56, 0.241, v.ready ? C.green : 0x39455f);
  d.faceY(-0.52, -0.48, 0.53, 0.56, 0.241, v.processing ? C.amber : 0x39455f);

  // сигнальная колонна
  const blink = v.processing ? 0.55 + 0.45 * Math.sin(v.time / 140) : 1;
  const tower: [number, boolean][] = [[C.red, v.alert > 0.1], [C.amber, v.processing], [C.green, v.ready && !v.processing]];
  d.cylZ(-0.5, -0.12, 0.84, 0.88, 0.03, C.dark);
  tower.forEach(([color, on], i) => d.cylZ(-0.5, -0.12, 0.88 + i * 0.06, 0.94 + i * 0.06, 0.032, mix(darken(color, 0.65), color, on ? blink : 0), i === 2));

  // патрон
  d.cylX(-0.34, CHUCK_X, 0, AXIS_Z, 0.15, 0x6c788f, { caps: 'end', rz: 0.15 });
  const jawPhase = v.processing ? v.phase : 0.4;
  for (let i = 0; i < 3; i++) {
    const a = jawPhase + (i * Math.PI * 2) / 3;
    const p = P(d.ox + CHUCK_X, d.oy + 0.118 * Math.cos(a), d.oz + AXIS_Z + 0.118 * Math.sin(a));
    d.g.fillStyle(0xdde7f1, 1); d.g.fillCircle(p.x, p.y, 4.2);
    d.g.lineStyle(1, 0x252f45, 0.8); d.g.strokeCircle(p.x, p.y, 4.2);
  }
  const chuck = d.p(CHUCK_X, 0, AXIS_Z);

  // деталь
  if (v.loaded && !v.hidePart) {
    const segs = partSegments(spec, v.doneOps, v.processing ? v.progress : 0);
    drawPart(d, CHUCK_X, 0, AXIS_Z, segs, 1, v.processing ? v.phase : 0);
  }

  // задняя бабка и пиноль
  d.cylX(0.3, 0.4, 0, AXIS_Z, 0.028, 0xc3cddb, { caps: 'end' });
  d.box(0.4, -0.11, 0.4, 0.6, 0.11, 0.74, C.body, 0.22);
  d.faceY(0.42, 0.58, 0.43, 0.47, 0.11, C.bodyShade, 0.9);
  d.cylX(0.6, 0.64, 0, AXIS_Z, 0.04, 0x252f45, { caps: 'end' });

  // каретка и резец
  let tip: Pt | null = null;
  const rest = { x: 0.2, r: PART_R + 0.012 };
  const pos = v.processing && spec.ops.length ? toolPosition(spec, v.opIndex, v.progress) : rest;
  const xt = pos.x, rTip = v.processing ? pos.r : PART_R + 0.028;
  d.box(xt - 0.11, -0.22, 0.4, xt + 0.11, 0.22, 0.5, 0x6c788f, 0.14);
  d.box(xt - 0.08, 0.0, 0.5, xt + 0.08, 0.22, 0.56, 0xc7d1de, 0.16);
  d.box(xt - 0.055, 0.15, 0.56, xt + 0.055, 0.25, 0.72, C.dark, 0.18);
  d.box(xt - 0.016, rTip, AXIS_Z - 0.026, xt + 0.016, 0.17, AXIS_Z + 0.004, C.amber, 0.3);
  if (v.processing) tip = d.p(xt, rTip, AXIS_Z - 0.01);
  return { tip, chuck };
}

/* ---------------------------------------------------------------- верстак с заготовкой */
export const BENCH_BOX = { x0: -0.58, x1: 0.58, y0: -0.32, y1: 0.32, h: 0.7 };
export function drawBench(d: Drawer, spec: PartSpec, v: { hasPart: boolean; alert: number }) {
  d.shadow(-0.56, -0.3, 0.56, 0.3, 0.55, 0.3);
  d.slab(-0.64, -0.36, 0.64, 0.36, 0.002, 0x1a2233, 0.35);
  for (const [x, y] of [[-0.5, -0.26], [0.45, -0.26], [-0.5, 0.2], [0.45, 0.2]]) d.box(x, y, 0, x + 0.06, y + 0.06, 0.4, C.dark, 0.12);
  d.box(-0.5, -0.24, 0.12, 0.5, 0.26, 0.16, C.dark, 0.1);
  // ящик под столом
  d.box(0.12, -0.2, 0.16, 0.44, 0.2, 0.32, 0x6b7a90, 0.1);
  d.faceY(0.14, 0.42, 0.18, 0.3, 0.2, darken(0x6b7a90, 0.3), 0.7);
  d.box(-0.56, -0.3, 0.4, 0.56, 0.3, 0.46, 0xb9c4d2, 0.26);
  d.faceY(-0.55, 0.55, 0.405, 0.43, 0.3, 0x1a2233, 0.25);
  // V-призмы
  d.box(-0.3, -0.07, 0.46, -0.2, 0.07, 0.53, C.dark, 0.14);
  d.box(0.1, -0.07, 0.46, 0.2, 0.07, 0.53, C.dark, 0.14);
  d.box(0.32, -0.25, 0.46, 0.5, -0.05, 0.56, 0x7a8aa3, 0.14);
  d.cylX(-0.5, -0.1, 0.22, 0.5, 0.025, 0xaab5c4, { caps: 'both' });
  if (v.hasPart) {
    const segs = partSegments(spec, 0, 0);
    drawPart(d, -0.28, 0, 0.53 + PART_R * 0.82, segs, 1);
  }
}

/* ---------------------------------------------------------------- склад */
export const WAREHOUSE_BOX = { x0: -0.56, x1: 0.56, y0: -0.34, y1: 0.34, h: 1.16 };
export function drawWarehouse(d: Drawer, spec: PartSpec, v: { capacity: number; stored: boolean; pulse: number; time: number }) {
  d.shadow(-0.54, -0.32, 0.54, 0.32, 1.1, 0.32);
  d.slab(-0.62, -0.4, 0.62, 0.4, 0.002, 0x1a2233, 0.35);
  d.box(-0.54, -0.32, 0.02, 0.54, -0.28, 1.1, 0x2b364e, 0.06);
  const back: [number, number][] = [[-0.55, -0.33], [0.5, -0.33]];
  back.forEach(([x, y]) => d.box(x, y, 0, x + 0.05, y + 0.05, 1.12, C.amber, 0.2));
  // нижняя полка с ящиками
  d.box(-0.54, -0.32, 0.06, 0.54, 0.32, 0.1, 0x56647c, 0.18);
  const crate = (x: number, z: number, w: number, h: number, color: number) => {
    d.box(x, -0.2, z, x + w, 0.18, z + h, color, 0.14);
    d.faceY(x + 0.02, x + w - 0.02, z + h * 0.18, z + h * 0.78, 0.18, darken(color, 0.28), 0.55);
  };
  crate(-0.48, 0.1, 0.3, 0.26, 0x7a8aa3); crate(-0.14, 0.1, 0.24, 0.2, 0x6a7b95); crate(0.2, 0.1, 0.3, 0.26, 0x7a8aa3);
  // полка со слотами для готовых деталей
  d.box(-0.54, -0.32, 0.5, 0.54, 0.32, 0.54, 0x56647c, 0.2);
  const n = Math.max(1, Math.min(6, v.capacity));
  const w = 1.0 / n;
  for (let i = 0; i < n; i++) {
    const x = -0.5 + i * w;
    d.box(x + 0.015, -0.24, 0.54, x + w - 0.015, 0.24, 0.57, 0x34405a, 0.1);
    d.box(x + 0.015, 0.22, 0.57, x + w - 0.015, 0.25, 0.62, 0x34405a, 0.1);
  }
  if (v.stored) {
    const k = Math.min(1, (w - 0.1) / PART_LEN);
    const segs = partSegments(spec, spec.ops.length, 0);
    drawPart(d, -0.5 + (w - PART_LEN * k) / 2, 0, 0.57 + PART_R * k * 0.82, segs, k);
  }
  const on = v.stored ? 1 : 0.18;
  d.faceY(-0.5, 0.5, 0.465, 0.485, 0.32, mix(0x39455f, C.green, on * (0.7 + 0.3 * Math.sin(v.time / 300))), 1);
  // верхняя рамка: только балки, чтобы не закрывать полки
  d.box(-0.55, -0.33, 1.08, 0.55, -0.28, 1.14, C.amber, 0.2);
  d.box(-0.55, 0.28, 1.08, 0.55, 0.33, 1.14, C.amber, 0.2);
  d.box(-0.55, -0.33, 1.08, -0.5, 0.33, 1.14, C.amber, 0.2);
  d.box(0.5, -0.33, 1.08, 0.55, 0.33, 1.14, C.amber, 0.2);
  [[-0.55, 0.28], [0.5, 0.28]].forEach(([x, y]) => d.box(x, y, 0, x + 0.05, y + 0.05, 1.12, C.amber, 0.2));
}

export const MILL_BOX = { x0: -.64, x1: .64, y0: -.36, y1: .36, h: 1.35 };
export const MILL_TABLE_Z = .55;

/** The upright and head sit behind the workpiece; the cutter is drawn after it. */
export function drawMill(d:Drawer, processing:boolean, time:number) {
  d.shadow(-.6,-.36,.6,.36,1.35,.35);
  hazardFrame(d,-.74,-.34,.74,.34);
  d.box(-.6,-.26,0,.6,.26,.3,C.dark,.15);
  d.box(-.52,-.36,.3,-.28,-.15,1.3,C.body,.2);
  d.box(-.4,-.34,1.12,.22,.14,1.3,C.body,.2);
  d.box(-.57,-.27,.43,.6,.28,MILL_TABLE_Z,C.cast,.15);
  for(const y of [-.17,0,.17])d.line(d.p(-.53,y,MILL_TABLE_Z+.003),d.p(.56,y,MILL_TABLE_Z+.003),C.dark,.75,2);
  d.faceY(-.49,-.31,.75,1.02,-.149,processing?C.amber:C.teal,.8);
  void time;
}

export function drawMillCutter(d:Drawer, top:number, processing:boolean, progress:number,time:number) {
  const x=processing?-.22+PART_LEN*progress:0;
  const contact=processing?top:Math.max(.88,top+.12);
  d.cylZ(x,0,contact+.1,1.12,.055,C.dark);
  d.cylZ(x,0,contact,contact+.1,.043,processing?C.amber:C.steelBright);
  if(processing)for(let i=0;i<4;i++){
    const a=time/70+i*Math.PI/2;
    d.line(d.p(x+.044*Math.cos(a),.044*Math.sin(a),contact),d.p(x+.044*Math.cos(a+.5),.044*Math.sin(a+.5),contact+.09),C.steelBright,.8);
  }
  return processing?d.p(x,0,contact):null;
}
