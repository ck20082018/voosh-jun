import {useEffect, useRef, useState, type PointerEvent, type CSSProperties} from 'react';
import type {FactoryCore, Command} from './core';
import {locatedPlacements, type Level} from './level';
import {beginPartDrag, cancelPartDrag, finishPartDrag, type PartDrag} from './workshopInteraction';
import {objectBounds, partPose, projectCell, workshopPoint, WORKSHOP_WIDTH, WORKSHOP_HEIGHT, type PartPose} from './presentation/workshopGeometry';

interface Props {
  level: Level;
  core: FactoryCore;
  onUpdate: () => void;
  onDragChange: (pose: PartPose | null) => void;
}
interface Gesture {
  pointerId: number;
  start: {x: number; y: number};
  clientStart: {x: number; y: number};
  pose: PartPose;
  transfer: PartDrag | null;
}
function areaStyle(box: {x: number; y: number; width: number; height: number}): CSSProperties {
  return {left: `${box.x / WORKSHOP_WIDTH * 100}%`, top: `${box.y / WORKSHOP_HEIGHT * 100}%`, width: `${box.width / WORKSHOP_WIDTH * 100}%`, height: `${box.height / WORKSHOP_HEIGHT * 100}%`};
}

export function WorkshopInteractions({level, core, onUpdate, onDragChange}: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [closed, setClosed] = useState(false);
  const [notice, setNotice] = useState('');
  const s = core.state;
  const placements = locatedPlacements(level);
  const itemPlacement = placements.find(p => p.nodeId === s.location?.id);
  const itemNode = level.nodes.find(n => n.id === itemPlacement?.nodeId);
  const pose = itemPlacement && itemNode ? partPose(itemPlacement, itemNode.type, itemNode.params.kind === 'mill') : null;
  const visibleItem = !!pose && !!s.item;
  const selectedPart = s.selected === core.resources.blank.id;
  const selectedId = selectedPart ? s.location?.id : s.selected;
  const selectedPlacement = placements.find(p => p.nodeId === selectedId);
  const selectedNode = level.nodes.find(n => n.id === selectedId);
  const title = selectedPart ? (s.part ? core.currentPartName : core.resources.blank.name) : String(selectedNode?.params.name ?? 'Объект');

  useEffect(() => {
    function cancel() {
      if (gesture.current) suppressClick.current = true;
      if (gesture.current?.transfer) cancelPartDrag(core, gesture.current.transfer);
      gesture.current = null;
      onDragChange(null);
      setDragging(false);
      onUpdate();
    }
    function key(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      cancel();
      if (core.can('cancel')) core.command('cancel');
      setClosed(true);
      onUpdate();
    }
    function visibility() {if (document.hidden) cancel();}
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', visibility);
      if (gesture.current?.transfer) cancelPartDrag(core, gesture.current.transfer);
      onDragChange(null);
    };
  }, [core, onUpdate, onDragChange]);

  useEffect(() => {
    const current = gesture.current;
    if (!current) return;
    if (s.intro || !s.playing || s.disposed || s.completed || (current.transfer && (s.target !== current.transfer.target || s.location?.id !== current.transfer.sourceId))) {
      gesture.current = null;
      onDragChange(null);
      setDragging(false); setClosed(false); setNotice('');
    }
  }, [s.intro, s.playing, s.disposed, s.completed, s.target, s.location?.id, onDragChange]);

  function point(event: PointerEvent) {
    return workshopPoint({x: event.clientX, y: event.clientY}, layer.current!.getBoundingClientRect());
  }
  function select(id: string) {
    setClosed(false); setNotice('');
    const targeting = core.state.target;
    if (core.click(id) && !targeting) {
      const state = core.state;
      // A finished machine opens the actions for the part it contains.
      if (state.location?.kind === 'machine' && state.location.id === id && state.machines[id].stage === 'finished') core.click(core.resources.blank.id);
    }
    onUpdate();
  }
  function command(command: Command) {
    if (core.can(command)) core.command(command);
    onUpdate();
  }
  function down(event: PointerEvent<HTMLButtonElement>) {
    suppressClick.current = false;
    if (event.button !== 0 || !event.isPrimary || !pose || gesture.current) return;
    gesture.current = {pointerId: event.pointerId, start: point(event), clientStart: {x: event.clientX, y: event.clientY}, pose, transfer: null};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.transfer) {
      if (Math.hypot(event.clientX - current.clientStart.x, event.clientY - current.clientStart.y) < 6) return;
      suppressClick.current = true;
      current.transfer = beginPartDrag(core);
      if (!current.transfer) {gesture.current = null; setNotice('Сейчас эту деталь переместить нельзя.'); onUpdate(); return;}
      setDragging(true); setNotice(''); onUpdate();
    }
    const cursor = point(event);
    onDragChange({...current.pose, x: current.pose.x + cursor.x - current.start.x, y: current.pose.y + cursor.y - current.start.y});
  }
  function end(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (current.transfer) {
      const cursor = point(event);
      const candidates = [...placements].sort((a, b) => (b.x + b.y) - (a.x + a.y));
      const target = cancelled ? undefined : candidates.find(p => {
        const node = level.nodes.find(n => n.id === p.nodeId)!;
        const box = objectBounds(p, node.type === 'lathe' && node.params.kind === 'mill');
        return Math.abs(cursor.x - box.x) <= box.width / 2 && Math.abs(cursor.y - box.y) <= box.height / 2;
      });
      const moved = finishPartDrag(core, current.transfer, target?.nodeId ?? null);
      setNotice(moved ? '' : 'Перемещение отменено. Отпустите деталь на подсвеченном объекте.');
    }
    onDragChange(null); setDragging(false); setClosed(false); onUpdate();
  }

  const menu = selectedPlacement ? projectCell(selectedPlacement.x, selectedPlacement.y) : null;
  const open = menu && s.selected && !closed && !dragging && s.playing && !s.intro && !s.completed && !s.activeHint?.confirm;
  return <div className="workshop-interactions" ref={layer}>
    {placements.map(p => {
      const node = level.nodes.find(n => n.id === p.nodeId)!;
      const box = objectBounds(p, node.type === 'lathe' && node.params.kind === 'mill');
      return <button key={p.nodeId} className="workshop-object-hit" style={{...areaStyle(box), zIndex: 1 + p.x + p.y}} aria-label={`Выбрать ${String(node.params.name)}`} onClick={() => select(p.nodeId)}/>;
    })}
    {visibleItem && pose && <button className={`workshop-part-hit${dragging ? ' dragging' : ''}`} style={{...areaStyle({x: pose.x + pose.length / 2, y: pose.y + 5, width: 68, height: 40}), zIndex: 20}}
      aria-label={s.location?.kind === 'warehouse' ? 'Выбрать деталь на складе' : s.part ? 'Выбрать готовую деталь' : 'Выбрать заготовку'}
      onClick={() => {if (!suppressClick.current) select(s.location?.kind === 'warehouse' ? s.location.id : core.resources.blank.id); suppressClick.current = false;}}
      onPointerDown={down} onPointerMove={move} onPointerUp={event => end(event)} onPointerCancel={event => end(event, true)} onLostPointerCapture={event => end(event, true)}/>}
    {open && <section className={`workshop-action-menu${s.target ? ' choosing-target' : ''}`} role="group" aria-label={`Действия: ${title}`} style={s.target ? {left: 8, top: 8} : {left: `clamp(120px, ${menu.x / WORKSHOP_WIDTH * 100}%, calc(100% - 120px))`, top: `clamp(8px, ${(menu.y + 48) / WORKSHOP_HEIGHT * 100}%, calc(100% - 160px))`}}>
      <div className="workshop-action-heading"><strong>{title}</strong><button aria-label="Закрыть действия" onClick={() => setClosed(true)}>×</button></div>
      {s.target ? <><p>Выберите подсвеченную цель в цехе.</p><button onClick={() => command('cancel')}>Отменить выбор цели</button></> : <>
        {selectedPart && s.location?.kind === 'table' && <button className="primary" disabled={!core.can('install')} onClick={() => command('install')}>Установить в станок</button>}
        {selectedPart && s.location?.kind === 'machine' && <button className="primary" disabled={!core.can('store')} onClick={() => command('store')}>Отправить на склад</button>}
        {selectedNode?.type === 'lathe' && !selectedPart && <><button className="primary" disabled={!core.can('process')} onClick={() => command('process')}>Обработать {(s.machines[selectedId!]?.operationIndex ?? 0) + 1} / {core.resources.machines[selectedId!].operations.length}</button>{s.machines[selectedId!]?.stage === 'empty' && <p>Перетащите заготовку на этот станок.</p>}{s.machines[selectedId!]?.stage === 'processing' && <p>Дождитесь завершения обработки.</p>}</>}
        {selectedNode?.type === 'warehouse' && <>{core.resources.warehouses[selectedId!].mode === 'intermediate' && <button className="primary" disabled={!core.can('take')} onClick={() => command('take')}>Взять заготовку</button>}<p>{s.warehouses[selectedId!]?.count ? 'Деталь на складе.' : 'Перетащите готовую деталь на склад.'}</p></>}
      </>}
    </section>}
    {notice && <p className="workshop-transfer-notice" role="status">{notice}</p>}
  </div>;
}
