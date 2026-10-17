import { useEffect, useRef, type MutableRefObject } from 'react';
import Phaser from 'phaser';
import type { Level } from './level';
import type { MissionSession } from './platform/session';
import { WorkshopScene, type Anchor, type Insets, type SceneHooks } from './scene/WorkshopScene';

export type { Anchor, Insets } from './scene/WorkshopScene';
export interface WorkshopHandle { zoomBy: (factor: number) => void; fit: () => void }

interface WorkshopProps {
  level: Level;
  /** Игровой режим: сцена управляется сессией миссии. */
  session?: MissionSession;
  /** Режим карты редактора. */
  selected?: string | null;
  onCell?: (x: number, y: number) => void;
  onAnchor?: (anchor: Anchor | null) => void;
  handle?: MutableRefObject<WorkshopHandle | null>;
  insets?: Insets;
  coachHighlights?: boolean;
}

/** Сигнатура уровня: пересоздаём объекты сцены только когда меняется то, что на ней видно. */
const worldSignature = (level: Level) => JSON.stringify([level.grid, level.placements, level.nodes.filter(n => ['blank', 'lathe', 'warehouse', 'turning'].includes(n.type)).map(n => [n.id, n.type, n.params]), level.edges.filter(e => e.targetHandle === 'previous' || e.targetHandle === 'blank').map(e => [e.source, e.target])]);

export function Workshop({ level, session, selected = null, onCell, onAnchor, handle, insets, coachHighlights = false }: WorkshopProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ session, selected, onCell, onAnchor, insets: insets ?? { left: 0, right: 0, top: 0, bottom: 0 }, coachHighlights, level });
  live.current = { session, selected, onCell, onAnchor, insets: insets ?? { left: 0, right: 0, top: 0, bottom: 0 }, coachHighlights, level };
  const scene = useRef<WorkshopScene | null>(null);
  const signature = worldSignature(level);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const hooks: SceneHooks = {
      getSession: () => live.current.session,
      getSelected: () => live.current.selected,
      onCell: (x, y) => live.current.onCell?.(x, y),
      onAnchor: anchor => live.current.onAnchor?.(anchor),
      getInsets: () => live.current.insets,
      getCoachHighlights: () => live.current.coachHighlights,
    };
    const sceneInstance = new WorkshopScene();
    const rect = el.getBoundingClientRect();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      transparent: true,
      width: Math.max(2, Math.round(rect.width * dpr)),
      height: Math.max(2, Math.round(rect.height * dpr)),
      scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
      audio: { noAudio: true },
      banner: false,
      render: { antialias: true, powerPreference: 'high-performance' },
      scene: [],
    });
    game.scene.add('workshop', sceneInstance, true, { hooks, host: el, level: live.current.level, dpr });
    scene.current = sceneInstance;
    const observer = new ResizeObserver(entries => {
      const box = entries[0].contentRect;
      if (box.width > 0 && box.height > 0) sceneInstance.resize(box.width, box.height);
    });
    observer.observe(el);
    if (handle) handle.current = { zoomBy: factor => sceneInstance.zoomBy(factor), fit: () => sceneInstance.fit() };
    return () => {
      observer.disconnect();
      scene.current = null;
      if (handle) handle.current = null;
      game.destroy(true);
    };
    // Игра создаётся один раз на сессию/режим; уровень применяется через setLevel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => { scene.current?.setLevel(live.current.level); }, [signature]);
  useEffect(() => { scene.current?.fit(); }, [insets?.left, insets?.right, insets?.top, insets?.bottom]);

  return <div className="workshop-canvas" ref={host} role="img" aria-label={session ? 'Изометрический цех: заготовка, токарный станок, склад' : 'Карта размещения объектов'} />;
}
