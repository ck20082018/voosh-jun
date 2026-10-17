import Phaser from 'phaser';
import type { Level, LevelNode } from '../level';
import type { MissionSession, SessionEvent } from '../platform/session';
import { operationsOf } from '../platform/missions';
import { isReducedMotion } from '../ui/motion';
import { Drawer, P, HW, HH, boxHull, type Pt } from './iso';
import { drawFloorAndWalls, buildProps, drawLamp, roomBounds, type RoomBounds } from './environment';
import { drawLathe, drawBench, drawWarehouse, partSegments, toolPosition, LATHE_BOX, BENCH_BOX, WAREHOUSE_BOX, AXIS_Z, PART_LEN, PART_R, type PartSpec } from './objects';

export interface Insets { left: number; right: number; top: number; bottom: number }
export interface Anchor { id: string; x: number; y: number }
export interface SceneHooks {
  getSession: () => MissionSession | undefined;
  getSelected: () => string | null;
  onCell: (x: number, y: number) => void;
  onAnchor: (anchor: Anchor | null) => void;
  getInsets: () => Insets;
  getCoachHighlights: () => boolean;
}
type Kind = 'blank' | 'lathe' | 'warehouse';
interface Box { x0: number; x1: number; y0: number; y1: number; h: number }
interface WorldObject {
  id: string; kind: Kind; node: LevelNode; cx: number; cy: number; box: Box; g: Phaser.GameObjects.Graphics; poly: Phaser.Geom.Polygon;
  tag: HTMLDivElement; nameEl: HTMLElement; subEl: HTMLElement; bar: HTMLElement; barFill: HTMLElement; lastSub: string; lastName: string;
  shakeUntil: number; flashUntil: number;
}

const BOXES: Record<Kind, Box> = { blank: BENCH_BOX, lathe: LATHE_BOX, warehouse: WAREHOUSE_BOX };
const TEAL = 0x22c3b3, AMBER = 0xf6a823, GREEN = 0x3fbd6a, RED = 0xe8553f;
export const MAX_ZOOM = 3.2;

export function partSpecFor(level: Level): PartSpec {
  const blank = level.nodes.find(n => n.type === 'blank');
  const diameter = Number(blank?.params.diameter) > 0 ? Number(blank?.params.diameter) : 20;
  const length = Number(blank?.params.length) > 0 ? Number(blank?.params.length) : 60;
  let ops: PartSpec['ops'] = [];
  try { ops = operationsOf(level).filter(o => o.diameter > 0 && o.length > 0); } catch { ops = []; }
  return { blankDiameter: diameter, blankLength: length, ops };
}

export class WorkshopScene extends Phaser.Scene {
  private hooks!: SceneHooks;
  private host!: HTMLElement;
  private level!: Level;
  private dpr = 1;
  private spec!: PartSpec;
  private objects: WorldObject[] = [];
  private world: { destroy: () => void }[] = [];
  private labels!: HTMLDivElement;
  private fxFloor!: Phaser.GameObjects.Graphics;
  private fxTop!: Phaser.GameObjects.Graphics;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private chips!: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private toolGlow!: Phaser.GameObjects.Image;
  private bounds!: RoomBounds;
  private hoverId: string | null = null;
  private hoverPart = false;
  private hoverCell: { x: number; y: number } | null = null;
  private pulses: { cx: number; cy: number; t0: number; color: number }[] = [];
  private unsubs: (() => void)[] = [];
  private now = 0;
  private userMoved = false;
  private lastAnchor: Anchor | null = null;
  private pinch = 0;
  private panning = false;
  private cssW = 0;
  private cssH = 0;
  private ready = false;

  constructor() { super('workshop'); }

  init(data: { hooks: SceneHooks; host: HTMLElement; level: Level; dpr: number }) {
    this.hooks = data.hooks; this.host = data.host; this.level = data.level; this.dpr = data.dpr;
  }

  create() {
    this.makeTextures();
    this.labels = document.createElement('div');
    this.labels.className = 'scene-labels';
    this.host.appendChild(this.labels);
    this.fxFloor = this.add.graphics().setDepth(-400);
    this.fxTop = this.add.graphics().setDepth(5000);
    this.sparks = this.add.particles(0, 0, 'spark', {
      lifespan: { min: 260, max: 640 }, speed: { min: 70, max: 240 }, angle: { min: -165, max: -25 }, gravityY: 520,
      scale: { start: 0.95, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false, frequency: 32, quantity: 2, tint: [0xffd27d, 0xffa63a, 0xfff1c4],
    }).setDepth(4000);
    this.chips = this.add.particles(0, 0, 'chip', {
      lifespan: { min: 700, max: 1200 }, speed: { min: 30, max: 120 }, angle: { min: -150, max: -40 }, gravityY: 540, rotate: { min: 0, max: 360 },
      scale: { start: 1, end: 0.6 }, alpha: { start: 1, end: 0 }, emitting: false, frequency: 120, quantity: 1,
    }).setDepth(3990);
    this.burst = this.add.particles(0, 0, 'spark', {
      lifespan: { min: 500, max: 1000 }, speed: { min: 60, max: 260 }, angle: { min: 0, max: 360 }, gravityY: 180,
      scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false, tint: [0x74d691, 0x76e4d9, 0xffffff],
    }).setDepth(4010);
    this.toolGlow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffa63a).setAlpha(0).setDepth(3980).setDisplaySize(120, 120);

    this.buildWorld();
    this.input.addPointer(1);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', () => { this.pinch = 0; this.panning = false; });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => { if (this.fromCanvas(p)) this.zoomAt(p.x, p.y, dy > 0 ? 1 / 1.14 : 1.14); });
    const session = this.hooks.getSession();
    if (session) this.unsubs.push(session.onEvent(event => this.onSessionEvent(event)));
    this.ready = true;
    this.resize(this.host.clientWidth, this.host.clientHeight);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  /* ---------------------------------------------------------------- построение мира */
  setLevel(level: Level) { this.level = level; if (this.labels) this.buildWorld(); }

  private makeTextures() {
    const glow = this.textures.createCanvas('glow', 256, 256);
    if (glow) {
      const ctx = glow.getContext();
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.4)'); g.addColorStop(0.65, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256); glow.refresh();
    }
    const spark = this.textures.createCanvas('spark', 32, 32);
    if (spark) {
      const ctx = spark.getContext();
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32); spark.refresh();
    }
    const chip = this.make.graphics({ x: 0, y: 0 }, false);
    chip.fillStyle(0xdde7f1, 1).fillRect(0, 0, 5, 2); chip.fillStyle(0x8f9db0, 1).fillRect(1, 1, 4, 1);
    chip.generateTexture('chip', 5, 2); chip.destroy();
  }

  private clearWorld() {
    for (const item of this.world) item.destroy();
    this.world = [];
    this.objects = [];
    this.labels.replaceChildren();
    this.hoverId = null;
  }

  private buildWorld() {
    this.clearWorld();
    const { width: W, height: H } = this.level.grid;
    this.spec = partSpecFor(this.level);
    this.bounds = roomBounds(W, H);
    const track = <T extends { destroy: () => void }>(o: T): T => { this.world.push(o); return o; };

    const env = track(this.add.graphics().setDepth(-1000));
    drawFloorAndWalls(env, W, H);
    for (const prop of buildProps(W, H)) {
      const g = track(this.add.graphics().setDepth(prop.depth));
      prop.draw(new Drawer(g));
    }
    const session = this.hooks.getSession();
    const placed = this.level.placements.map(p => ({ p, node: this.level.nodes.find(n => n.id === p.nodeId) })).filter((v): v is { p: typeof v.p; node: LevelNode } => !!v.node && ['blank', 'lathe', 'warehouse'].includes(v.node.type));

    for (const { p } of placed) {
      const c = { x: p.x + 0.5, y: p.y + 0.5 };
      const at = P(c.x, c.y, 0);
      const pool = track(this.add.image(at.x, at.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe2b0).setAlpha(0.36).setDepth(-300).setDisplaySize(HW * 4.6, HH * 4.6));
      void pool;
      const lamp = track(this.add.graphics().setDepth(6000));
      drawLamp(lamp, c.x, c.y);
    }

    for (const { p, node } of placed) {
      const kind = node.type as Kind;
      const cx = p.x + 0.5, cy = p.y + 0.5, box = BOXES[kind];
      const g = track(this.add.graphics().setDepth(cx + cy));
      const poly = new Phaser.Geom.Polygon(boxHull(cx, cy, box.x0, box.y0, box.x1, box.y1, 0, box.h).flatMap(pt => [pt.x, pt.y]));
      const tag = document.createElement('div');
      tag.className = `scene-tag scene-tag--${kind}`;
      const nameEl = document.createElement('span'); nameEl.className = 'scene-tag__name';
      const subEl = document.createElement('span'); subEl.className = 'scene-tag__sub';
      const bar = document.createElement('i'); bar.className = 'scene-tag__bar';
      const barFill = document.createElement('b'); bar.appendChild(barFill);
      tag.append(nameEl, subEl, bar);
      this.labels.appendChild(tag);
      const obj: WorldObject = { id: node.id, kind, node, cx, cy, box, g, poly, tag, nameEl, subEl, bar, barFill, lastSub: '\u0000', lastName: '\u0000', shakeUntil: 0, flashUntil: 0 };
      this.objects.push(obj);
      if (session) {
        g.setInteractive(poly, Phaser.Geom.Polygon.Contains);
        g.on('pointerover', () => { this.hoverId = obj.id; });
        g.on('pointerout', () => { if (this.hoverId === obj.id) this.hoverId = null; this.hoverPart = false; });
        g.on('pointerup', (pointer: Phaser.Input.Pointer) => this.objectClick(obj, pointer));
      }
    }

    if (!session) {
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const c = P(i + 0.5, j + 0.5, 0);
        const zone = track(this.add.zone(c.x, c.y, HW * 2, HH * 2).setDepth(7000));
        zone.setInteractive(new Phaser.Geom.Polygon([HW, 0, HW * 2, HH, HW, HH * 2, 0, HH]), Phaser.Geom.Polygon.Contains);
        zone.on('pointerover', () => { this.hoverCell = { x: i, y: j }; });
        zone.on('pointerout', () => { if (this.hoverCell?.x === i && this.hoverCell?.y === j) this.hoverCell = null; });
        zone.on('pointerup', (pointer: Phaser.Input.Pointer) => { if (this.fromCanvas(pointer) && pointer.getDistance() < 10 * this.dpr) this.hooks.onCell(i, j); });
      }
    }
    this.fit();
  }

  /* ---------------------------------------------------------------- камера */
  resize(cssW: number, cssH: number) {
    this.cssW = cssW; this.cssH = cssH;
    if (!this.ready) return;
    const keep = this.userMoved;
    this.scale.resize(Math.max(2, Math.round(cssW * this.dpr)), Math.max(2, Math.round(cssH * this.dpr)));
    const canvas = this.game.canvas;
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    this.scale.updateBounds();
    if (this.cameras.main && this.bounds) { if (keep) this.clampCamera(); else this.fit(); }
  }
  private get zoomCss() { return this.cameras.main.zoom / this.dpr; }
  private mid() { const c = this.cameras.main; return { x: c.scrollX + c.width / 2, y: c.scrollY + c.height / 2 }; }
  private setMid(x: number, y: number) { const c = this.cameras.main; c.setScroll(x - c.width / 2, y - c.height / 2); }
  private toWorld(px: number, py: number) { const c = this.cameras.main, m = this.mid(); return { x: m.x + (px - c.width / 2) / c.zoom, y: m.y + (py - c.height / 2) / c.zoom }; }
  private toCss(wx: number, wy: number) { const c = this.cameras.main, m = this.mid(); return { x: ((wx - m.x) * c.zoom + c.width / 2) / this.dpr, y: ((wy - m.y) * c.zoom + c.height / 2) / this.dpr }; }

  private focusBox(): { minX: number; maxX: number; minY: number; maxY: number } {
    if (!this.objects.length) return this.bounds;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const o of this.objects) {
      for (const pt of boxHull(o.cx, o.cy, o.box.x0 - 0.9, o.box.y0 - 0.8, o.box.x1 + 0.9, o.box.y1 + 0.8, -0.1, o.box.h + 0.9)) {
        minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
      }
    }
    return { minX, maxX, minY, maxY };
  }
  private minZoomCss() {
    const b = this.bounds; if (!b || !this.cssW) return 0.3;
    return Math.min(this.cssW / (b.maxX - b.minX), this.cssH / (b.maxY - b.minY)) * 0.8;
  }
  fit() {
    if (!this.cssW || !this.bounds) return;
    const box = this.focusBox(), ins = this.hooks.getInsets();
    const availW = Math.max(160, this.cssW - ins.left - ins.right), availH = Math.max(140, this.cssH - ins.top - ins.bottom);
    const z = Math.max(this.minZoomCss(), Math.min(MAX_ZOOM, Math.min(availW / (box.maxX - box.minX), availH / (box.maxY - box.minY))));
    const cam = this.cameras.main;
    cam.setZoom(z * this.dpr);
    const offX = (ins.left - ins.right) / 2, offY = (ins.top - ins.bottom) / 2;
    this.setMid((box.minX + box.maxX) / 2 - offX / z, (box.minY + box.maxY) / 2 - offY / z);
    this.userMoved = false;
  }
  zoomBy(factor: number) { this.zoomAt(this.cameras.main.width / 2, this.cameras.main.height / 2, factor); }
  private zoomAt(px: number, py: number, factor: number) {
    const cam = this.cameras.main;
    const before = this.toWorld(px, py);
    const z = Math.max(this.minZoomCss(), Math.min(MAX_ZOOM, this.zoomCss * factor));
    cam.setZoom(z * this.dpr);
    this.setMid(before.x - (px - cam.width / 2) / cam.zoom, before.y - (py - cam.height / 2) / cam.zoom);
    this.userMoved = true;
    this.clampCamera();
  }
  private clampCamera() {
    const b = this.bounds, m = this.mid();
    this.setMid(Math.max(b.minX, Math.min(b.maxX, m.x)), Math.max(b.minY, Math.min(b.maxY, m.y)));
  }
  private onMove(pointer: Phaser.Input.Pointer) {
    const p1 = this.input.pointer1, p2 = this.input.pointer2;
    if (p1.isDown && p2.isDown) {
      const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      if (this.pinch > 0) this.zoomAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, dist / this.pinch);
      this.pinch = dist; return;
    }
    if (!pointer.isDown) return;
    if (!this.panning && pointer.getDistance() > 8 * this.dpr) this.panning = true;
    if (!this.panning) return;
    const c = this.cameras.main;
    this.setMid(this.mid().x - (pointer.x - pointer.prevPosition.x) / c.zoom, this.mid().y - (pointer.y - pointer.prevPosition.y) / c.zoom);
    this.userMoved = true;
    this.clampCamera();
  }

  /* ---------------------------------------------------------------- ввод */
  /** HTML-панели лежат поверх canvas: события, пришедшие не с него, сцену не касаются. */
  private fromCanvas(pointer: Phaser.Input.Pointer): boolean {
    const native = pointer.event as Event | undefined;
    return !native || native.target === this.game.canvas;
  }
  private objectClick(obj: WorldObject, pointer: Phaser.Input.Pointer) {
    const session = this.hooks.getSession();
    if (!session || !this.fromCanvas(pointer) || this.panning || pointer.getDistance() > 10 * this.dpr) return;
    const r = session.core.resources;
    if (obj.kind === 'blank') session.click(r.blank.id);
    else if (obj.kind === 'warehouse') session.click(r.warehouse.id);
    else {
      const world = this.toWorld(pointer.x, pointer.y);
      const finished = session.state.stage === 'finished';
      session.click(finished && this.inPartRegion(obj, world.x, world.y) ? r.blank.id : r.machine.id);
    }
  }
  private partRegion(obj: WorldObject): Pt[] {
    return boxHull(obj.cx - 0.24, obj.cy, 0, -0.14, PART_LEN + 0.04, 0.14, AXIS_Z - 0.16, AXIS_Z + 0.16);
  }
  private inPartRegion(obj: WorldObject, wx: number, wy: number) {
    return Phaser.Geom.Polygon.Contains(new Phaser.Geom.Polygon(this.partRegion(obj).flatMap(pt => [pt.x, pt.y])), wx, wy);
  }

  private onSessionEvent(event: SessionEvent) {
    const reduce = isReducedMotion();
    const session = this.hooks.getSession();
    if (!session) return;
    if (event.type === 'error') {
      const target = event.objectId ? this.objects.find(o => o.id === event.objectId) : this.objects.find(o => o.kind === 'lathe');
      if (target) { target.flashUntil = this.now + 700; if (!reduce) target.shakeUntil = this.now + 420; }
    }
    if (event.type === 'core' && !reduce) {
      const r = session.core.resources;
      const lathe = this.objects.find(o => o.id === r.machine.id), house = this.objects.find(o => o.id === r.warehouse.id);
      if (event.event.type === 'processing-finished' && lathe) this.pulses.push({ cx: lathe.cx, cy: lathe.cy, t0: this.now, color: AMBER });
      if (event.event.type === 'blank-installed' && lathe) this.pulses.push({ cx: lathe.cx, cy: lathe.cy, t0: this.now, color: TEAL });
      if (event.event.type === 'part-stored' && house) { this.pulses.push({ cx: house.cx, cy: house.cy, t0: this.now, color: GREEN }); const at = P(house.cx, house.cy, 0.75); this.burst.explode(26, at.x, at.y); }
    }
    if (event.type === 'completed' && !reduce) {
      const r = session.core.resources, house = this.objects.find(o => o.id === r.warehouse.id);
      if (house) { const at = P(house.cx, house.cy, 1.1); this.burst.explode(48, at.x, at.y); }
    }
  }

  /* ---------------------------------------------------------------- кадр */
  update(time: number, delta: number) {
    this.now = time;
    const session = this.hooks.getSession();
    if (session) session.tick(delta);
    const reduce = isReducedMotion();
    const s = session?.state ?? null;
    const selectedId = session ? s!.selected : this.hooks.getSelected();
    const stage = s?.stage ?? 'table';
    const spec = this.spec;
    const progress = session?.progress ?? 0;
    const doneOps = session?.opsDone ?? 0;
    const processing = stage === 'processing';
    const phase = (time / 90) % (Math.PI * 2);

    let tip: Pt | null = null;
    for (const obj of this.objects) {
      const g = obj.g; g.clear();
      const shake = obj.shakeUntil > time ? Math.sin(time / 26) * 4 * ((obj.shakeUntil - time) / 420) : 0;
      g.x = shake;
      const alert = Math.max(0, (obj.flashUntil - time) / 700);
      const d = new Drawer(g).at(obj.cx, obj.cy, 0);
      if (obj.kind === 'blank') drawBench(d, spec, { hasPart: !session || stage === 'table', alert });
      else if (obj.kind === 'warehouse') drawWarehouse(d, spec, { capacity: session ? session.core.resources.warehouse.capacity : Number(obj.node.params.capacity) || 1, stored: stage === 'stored', pulse: 0, time });
      else {
        const loaded = !!session && (stage === 'loaded' || processing || stage === 'finished');
        const out = drawLathe(d, spec, { loaded, processing, progress, doneOps, opIndex: Math.min(spec.ops.length - 1, s?.operationIndex ?? 0), finished: stage === 'finished', phase, time, alert, ready: stage === 'loaded' || stage === 'finished' });
        if (out.tip) tip = out.tip;
      }
      if (alert > 0) {
        this.fxTopQueue.push(() => { this.fxTop.fillStyle(RED, 0.16 * alert); this.fxTop.fillPoints(obj.poly.points, true); });
      }
    }
    this.drawEffects(time, s, selectedId, reduce);
    // искры и стружка у кончика резца
    if (tip && !reduce) {
      const t = tip as Pt;
      this.sparks.setPosition(t.x, t.y); this.chips.setPosition(t.x, t.y);
      this.sparks.emitting = true; this.chips.emitting = true;
      this.toolGlow.setPosition(t.x, t.y).setAlpha(0.55 + 0.25 * Math.sin(time / 70));
    } else {
      this.sparks.emitting = false; this.chips.emitting = false;
      if (tip) { const t = tip as Pt; this.toolGlow.setPosition(t.x, t.y).setAlpha(0.45); } else this.toolGlow.setAlpha(0);
    }
    this.updateTags(s, session);
    this.updateAnchor(selectedId, s);
    if (this.hoverId) this.input.setDefaultCursor('pointer'); else this.input.setDefaultCursor(this.panning ? 'grabbing' : 'grab');
    void spec; void toolPosition; void partSegments; void PART_R;
  }
  private fxTopQueue: (() => void)[] = [];

  private loop(g: Phaser.GameObjects.Graphics, pts: Pt[], dash: number, gap: number, offset: number, color: number, alpha: number, width: number) {
    const total = pts.reduce((sum, p, i) => sum + Math.hypot(pts[(i + 1) % pts.length].x - p.x, pts[(i + 1) % pts.length].y - p.y), 0);
    g.lineStyle(width, color, alpha);
    const point = (dist: number) => {
      let d = ((dist % total) + total) % total;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b.x - a.x, b.y - a.y);
        if (d <= len) return { x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len };
        d -= len;
      }
      return pts[0];
    };
    for (let at = offset % (dash + gap); at < total; at += dash + gap) {
      g.beginPath();
      const steps = 6;
      for (let k = 0; k <= steps; k++) { const p = point(at + (dash * k) / steps); if (k) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }
      g.strokePath();
    }
  }
  private footprint(obj: WorldObject, grow: number): Pt[] {
    const b = obj.box;
    return [P(obj.cx + b.x0 - grow, obj.cy + b.y0 - grow), P(obj.cx + b.x1 + grow, obj.cy + b.y0 - grow), P(obj.cx + b.x1 + grow, obj.cy + b.y1 + grow), P(obj.cx + b.x0 - grow, obj.cy + b.y1 + grow)];
  }
  /** Объект сцены, к которому относится выбранный элемент ядра. */
  private objectForSelection(selectedId: string | null, stage: string): WorldObject | undefined {
    const session = this.hooks.getSession();
    if (!selectedId) return undefined;
    if (!session) return this.objects.find(o => o.id === selectedId);
    const r = session.core.resources;
    if (selectedId === r.machine.id) return this.objects.find(o => o.kind === 'lathe');
    if (selectedId === r.warehouse.id) return this.objects.find(o => o.kind === 'warehouse');
    if (selectedId === r.blank.id) return this.objects.find(o => o.kind === (stage === 'table' ? 'blank' : stage === 'stored' ? 'warehouse' : 'lathe'));
    return undefined;
  }

  private drawEffects(time: number, s: Readonly<import('../core').CoreState> | null, selectedId: string | null, reduce: boolean) {
    const f = this.fxFloor, t = this.fxTop;
    f.clear(); t.clear();
    for (const q of this.fxTopQueue) q();
    this.fxTopQueue = [];
    const session = this.hooks.getSession();
    const march = reduce ? 0 : time / 38;
    const pulse = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(time / 260);
    const selected = this.objectForSelection(selectedId, s?.stage ?? 'table');

    if (!session) {
      // режим карты редактора: сетка клеток
      const { width: W, height: H } = this.level.grid;
      const cell = (i: number, j: number) => [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
      if (this.hoverCell && this.hoverCell.x < W && this.hoverCell.y < H) { f.fillStyle(TEAL, 0.22); f.fillPoints(cell(this.hoverCell.x, this.hoverCell.y), true); f.lineStyle(2, TEAL, 0.9); f.strokePoints(cell(this.hoverCell.x, this.hoverCell.y), true); }
      for (const o of this.objects) if (o.id === selectedId) { f.fillStyle(AMBER, 0.18); f.fillPoints(cell(o.cx - 0.5, o.cy - 0.5), true); this.loop(f, cell(o.cx - 0.5, o.cy - 0.5), 14, 8, march, AMBER, 1, 3); }
      return;
    }
    if (selected) { f.fillStyle(AMBER, 0.1); f.fillPoints(this.footprint(selected, 0.1), true); this.loop(f, this.footprint(selected, 0.1), 16, 9, march, AMBER, 1, 3); }
    // подсветка цели выбора и подсказка обучения
    const r = session.core.resources;
    const guide: { obj?: WorldObject; strong: boolean }[] = [];
    if (s?.target) {
      const want = s.target === 'machine' ? r.machine.id : r.warehouse.id;
      if (this.hooks.getCoachHighlights()) guide.push({ obj: this.objects.find(o => o.id === want), strong: true });
    } else if (this.hooks.getCoachHighlights() && s && s.playing && !s.intro && !s.completed) {
      const stage = s.stage;
      const bench = this.objects.find(o => o.kind === 'blank'), lathe = this.objects.find(o => o.kind === 'lathe');
      if (stage === 'table' && s.selected !== r.blank.id) guide.push({ obj: bench, strong: false });
      if ((stage === 'loaded' && s.selected !== r.machine.id) || (stage === 'finished' && s.selected !== r.blank.id)) guide.push({ obj: lathe, strong: false });
    }
    for (const gde of guide) {
      if (!gde.obj) continue;
      f.fillStyle(TEAL, 0.1 + 0.1 * pulse); f.fillPoints(this.footprint(gde.obj, 0.16), true);
      this.loop(f, this.footprint(gde.obj, 0.16), 12, 8, -march, TEAL, 0.5 + 0.5 * pulse, 3);
      const bob = reduce ? 0 : Math.sin(time / 230) * 0.05;
      const tip = P(gde.obj.cx, gde.obj.cy, gde.obj.box.h + 0.34 + bob);
      t.fillStyle(TEAL, 1); t.fillTriangle(tip.x - 11, tip.y - 16, tip.x + 11, tip.y - 16, tip.x, tip.y);
      t.lineStyle(2, 0x04201d, 0.55); t.strokeTriangle(tip.x - 11, tip.y - 16, tip.x + 11, tip.y - 16, tip.x, tip.y);
    }
    // наведение
    const hovered = this.objects.find(o => o.id === this.hoverId);
    if (hovered) {
      if (hovered.kind === 'lathe' && s?.stage === 'finished') {
        const w = this.toWorld(this.input.activePointer.x, this.input.activePointer.y);
        this.hoverPart = this.inPartRegion(hovered, w.x, w.y);
      } else this.hoverPart = false;
      const outline = this.hoverPart ? this.partRegion(hovered) : (hovered.poly.points as Pt[]);
      t.fillStyle(TEAL, 0.07); t.fillPoints(outline, true);
      t.lineStyle(2, TEAL, 0.95); t.strokePoints(outline, true);
    }
    // расходящиеся кольца событий
    this.pulses = this.pulses.filter(p => time - p.t0 < 800);
    for (const p of this.pulses) {
      const k = (time - p.t0) / 800;
      const ring = [P(p.cx - 0.4 - k * 1.1, p.cy - 0.4 - k * 1.1), P(p.cx + 0.4 + k * 1.1, p.cy - 0.4 - k * 1.1), P(p.cx + 0.4 + k * 1.1, p.cy + 0.4 + k * 1.1), P(p.cx - 0.4 - k * 1.1, p.cy + 0.4 + k * 1.1)];
      f.lineStyle(4 * (1 - k) + 1, p.color, 0.85 * (1 - k)); f.strokePoints(ring, true);
    }
  }

  /* ---------------------------------------------------------------- подписи и якорь */
  private updateTags(s: Readonly<import('../core').CoreState> | null, session: MissionSession | undefined) {
    const placed = (id: string) => this.level.placements.find(p => p.nodeId === id);
    for (const obj of this.objects) {
      let name = String(obj.node.params.name ?? ''), sub = '', showBar = false, tone = '';
      if (session && s) {
        const r = session.core.resources;
        if (obj.kind === 'blank') { sub = s.stage === 'table' ? `Ø${r.blank.diameter} × ${r.blank.length} мм` : ''; if (s.stage !== 'table') name = 'Стол'; }
        else if (obj.kind === 'warehouse') sub = `${s.count} из ${r.warehouse.capacity}`;
        else if (s.stage === 'processing') { sub = `Обработка ${Math.round(session.progress * 100)}%`; showBar = true; tone = 'run'; }
        else if (s.stage === 'finished') { sub = 'Готово, можно проверять'; tone = 'ok'; }
        else if (s.stage === 'loaded') { sub = `Заготовка закреплена · операция ${s.operationIndex + 1} из ${r.operations.length}`; tone = 'ready'; }
        else if (s.stage === 'stored') sub = 'Свободен';
        else sub = 'Ждёт заготовку';
      } else { const p = placed(obj.id); sub = p ? `Клетка ${p.x + 1}, ${p.y + 1}` : ''; }
      if (name !== obj.lastName) { obj.nameEl.textContent = name; obj.lastName = name; }
      if (sub !== obj.lastSub) { obj.subEl.textContent = sub; obj.subEl.hidden = !sub; obj.lastSub = sub; }
      obj.tag.dataset.tone = tone;
      obj.bar.hidden = !showBar;
      if (showBar) obj.barFill.style.width = `${Math.round((session?.progress ?? 0) * 100)}%`;
      const at = this.toCss(P(obj.cx, obj.cy, obj.box.h + 0.18).x, P(obj.cx, obj.cy, obj.box.h + 0.18).y);
      obj.tag.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) translate(-50%, -100%)`;
      obj.tag.classList.toggle('is-hover', this.hoverId === obj.id);
    }
  }
  private updateAnchor(selectedId: string | null, s: Readonly<import('../core').CoreState> | null) {
    const session = this.hooks.getSession();
    if (!session) return;
    const obj = this.objectForSelection(selectedId, s?.stage ?? 'table');
    if (!obj) { if (this.lastAnchor) { this.lastAnchor = null; this.hooks.onAnchor(null); } return; }
    const at = P(obj.cx, obj.cy, obj.box.h * 0.55);
    const css = this.toCss(at.x, at.y);
    const next: Anchor = { id: obj.id, x: css.x, y: css.y };
    const prev = this.lastAnchor;
    if (!prev || prev.id !== next.id || Math.abs(prev.x - next.x) > 0.6 || Math.abs(prev.y - next.y) > 0.6) { this.lastAnchor = next; this.hooks.onAnchor(next); }
  }

  private cleanup() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.labels?.remove();
    this.hooks.onAnchor(null);
  }
}
