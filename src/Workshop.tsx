import { useEffect, useRef, useMemo, useState, type MutableRefObject } from 'react';
import Phaser from 'phaser';
import type { FactoryCore } from './core';
import { MissionSession } from './platform/session';
import { ObjectPopover, Dock } from './screens/MissionPanels';
import type { Level } from './level';
import { WorkshopScene, type Anchor, type Insets, type SceneHooks } from './scene/WorkshopScene';

export type { Anchor, Insets } from './scene/WorkshopScene';
export interface WorkshopHandle { zoomBy: (factor: number) => void; fit: () => void }

interface WorkshopProps {
  level: Level;
  core?: FactoryCore;
  onUpdate?: () => void;
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
const worldSignature = (level: Level) => JSON.stringify([level.grid, level.placements, level.nodes.filter(n => ['blank', 'lathe', 'warehouse', 'table'].includes(n.type)).map(n => [n.id, n.type, n.params]), level.edges.filter(e => e.targetHandle === 'previous' || e.targetHandle === 'blank').map(e => [e.source, e.target])]);

export function Workshop({ level, session: suppliedSession, core, onUpdate, selected = null, onCell, onAnchor, handle, insets, coachHighlights = false }: WorkshopProps) {
  const localSession = useMemo(() => core ? new MissionSession(core, 'test') : undefined, [core]);
  const session = suppliedSession ?? localSession;
  const [localAnchor, setLocalAnchor] = useState<Anchor | null>(null);
  useEffect(() => localSession?.subscribe(() => onUpdate?.()), [localSession, onUpdate]);
  useEffect(() => () => localSession?.dispose(), [localSession]);
  const anchorChanged = onAnchor ?? (core ? setLocalAnchor : undefined);
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ session, selected, onCell, onAnchor: anchorChanged, insets: insets ?? { left: 0, right: 0, top: 0, bottom: 0 }, coachHighlights, level });
  live.current = { session, selected, onCell, onAnchor: anchorChanged, insets: insets ?? { left: 0, right: 0, top: 0, bottom: 0 }, coachHighlights, level };
  const scene = useRef<WorkshopScene | null>(null);
  const signature = worldSignature(level);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const hooks: SceneHooks = {
      getRuntime: () => {const s=live.current.session;return s&&!s.core.isWelcome?{state:s.state,resources:s.core.resources,targetIds:s.core.targetIds,progress:s.progress,opsDone:s.opsDone}:undefined;},
      onTick:delta=>live.current.session?.tick(delta),
      onSelect:id=>{live.current.session?.click(id);},
      onBeginDrag:()=>live.current.session?.beginDrag()??null,
      onFinishDrag:(drag,target)=>{live.current.session?.finishDrag(drag,target);},
      onCancelDrag:drag=>live.current.session?.cancelDrag(drag),
      onEvent:listener=>live.current.session?.onEvent(listener)??(()=>{}),
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

  const canvas = <div className="workshop-canvas" ref={host} role="img" aria-label={session ? 'Изометрический цех: заготовка, токарный станок, склад' : 'Карта размещения объектов'} />;
  return core && session ? <div className="workshop-stage">{canvas}<ObjectPopover session={session} anchor={localAnchor} stage={host.current} /><Dock session={session} hintText={null} onHint={()=>{}}/></div> : canvas;
}
