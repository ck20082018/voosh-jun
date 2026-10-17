import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Level } from '../level';
import type { MissionSession } from '../platform/session';
import { computeScore } from '../platform/scoring';
import { formatTime } from '../platform/result';
import { whyText } from '../platform/explain';
import type { Anchor } from '../Workshop';
import { Icon, type IconName } from '../ui/Icon';
import { Button, Chip, Dialog, Meter, Switch } from '../ui/primitives';
import { DrawingSheet } from './DrawingSheet';

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Подписка компонента на сессию: перерисовка при каждом изменении журнала попытки. */
export function useSession(session: MissionSession) {
  useSyncExternalStore(session.subscribe, session.getVersion, session.getVersion);
}

/** Максимум, который ещё можно набрать: считается по формуле оценки, как если бы работа была закончена без новых ошибок. */
export function potentialScore(session: MissionSession): number {
  const s = session.summary();
  return computeScore({ ...s, completed: true, installed: true, stored: true, opsDone: s.opsTotal, timeSec: Math.max(s.timeSec, s.parSec) }).total;
}

/* ---------- Лист задания ---------- */
export function TaskSheet({ session, collapsed, onToggle }: { session: MissionSession; collapsed: boolean; onToggle: () => void }) {
  useSession(session);
  const r = session.core.resources;
  const s = session.state;
  const total = session.opsTotal, done = session.opsDone;
  const stored = s.stage === 'stored' || s.completed;
  const summary = session.summary();
  return (
    <aside className={`task-sheet panel ${collapsed ? 'is-collapsed' : ''}`} aria-label="Задание">
      <header className="task-sheet__head">
        <div>
          <span className="eyebrow">Техническое задание</span>
          <h2 className="t-h3">{s.goal || 'Подготовка к работе'}</h2>
        </div>
        <Button variant="quiet" size="sm" icon={collapsed ? 'down' : 'up'} label={collapsed ? 'Показать задание' : 'Свернуть задание'} aria-expanded={!collapsed} onClick={onToggle} />
      </header>
      {!collapsed && (
        <div className="task-sheet__body scroll-y">
          {s.instruction && <p className="t-small t-dim">{s.instruction}</p>}
          <DrawingSheet title={session.core.level.name} blank={r.blank} ops={r.operations} actual={{ doneOps: done, progress: session.progress }} />
          <section aria-label="Операции">
            <h3 className="sheet-h">Операции</h3>
            <ol className="ops">
              {r.operations.map((op, i) => {
                const state = i < done ? 'done' : i === done && s.stage === 'processing' ? 'active' : i === done && !stored ? 'next' : 'todo';
                return (
                  <li key={op.id} data-state={state}>
                    <span className="ops__mark" aria-hidden="true">{state === 'done' ? <Icon name="check" size={14} /> : i + 1}</span>
                    <span className="ops__text"><b>Ø{op.diameter} × {op.length} мм</b><small>{op.seconds} с · снять {trim((r.blank.diameter - op.diameter) / 2)} мм на сторону</small></span>
                    <span className="sr-only">{state === 'done' ? 'выполнена' : state === 'active' ? 'идёт' : 'ожидает'}</span>
                  </li>
                );
              })}
            </ol>
          </section>
          <section aria-label="Критерии">
            <h3 className="sheet-h">Критерии сдачи</h3>
            <ul className="crit">
              <Crit ok={session.installed}>Заготовка закреплена в станке</Crit>
              <Crit ok={total > 0 && done >= total}>Размеры по чертежу: {done} из {total} операций</Crit>
              <Crit ok={stored}>Готовая деталь на складе</Crit>
            </ul>
            <p className="t-small t-faint par">Норма времени: {formatTime(summary.parSec)}</p>
          </section>
        </div>
      )}
    </aside>
  );
}
function Crit({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <li data-ok={ok}><span aria-hidden="true"><Icon name={ok ? 'checkCircle' : 'target'} size={17} /></span><span>{children}</span><span className="sr-only">{ok ? 'выполнено' : 'не выполнено'}</span></li>;
}

/* ---------- Контекстная панель объекта ---------- */
export function ObjectPopover({ session, anchor, stage }: { session: MissionSession; anchor: Anchor | null; stage: HTMLElement | null }) {
  useSession(session);
  const ref = useRef<HTMLDivElement>(null);
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; dock: boolean; side: 'left' | 'right' } | null>(null);
  const s = session.state;
  const r = session.core.resources;
  const strict = session.strict;

  useLayoutEffect(() => {
    const el = ref.current;
    const set = (next: typeof place) => setPlace(prev => (prev === next || (prev && next && prev.left === next.left && prev.top === next.top && prev.dock === next.dock && prev.side === next.side) ? prev : next));
    if (!el || !anchor || !stage) { set(null); return; }
    const W = stage.clientWidth, H = stage.clientHeight;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (W < 760) { set({ left: 0, top: 0, dock: true, side: 'right' }); return; }
    const gap = 88;
    const right = anchor.x + gap + w <= W - 16;
    const left = Math.round(right ? anchor.x + gap : Math.max(16, anchor.x - gap - w));
    const top = Math.round(Math.max(76, Math.min(H - h - 150, anchor.y - h / 2)));
    set({ left, top, dock: false, side: right ? 'right' : 'left' });
  });

  const selectionKey = `${s.selected}|${s.stage}|${s.operationIndex}|${s.target}`;
  if (!anchor || s.completed || s.intro || session.ended || hiddenKey === selectionKey) return null;
  const blocked = (c: Parameters<MissionSession['blockedReason']>[0]) => (strict ? '' : session.blockedReason(c));
  const act = (c: Parameters<MissionSession['command']>[0]) => session.command(c);
  const isBlank = s.selected === r.blank.id, isMachine = s.selected === r.machine.id, isStore = s.selected === r.warehouse.id;
  const op = session.core.currentOperation;
  const finished = s.stage === 'finished';

  let icon: IconName = 'blank', title = '', sub = '';
  let body: ReactNode = null;
  if (s.target) {
    const want = s.target === 'machine' ? r.machine.name : r.warehouse.name;
    icon = 'target'; title = 'Выберите цель'; sub = `Нужно выбрать «${want}»`;
    body = (
      <>
        <p className="t-small t-dim">Нажмите на объект на сцене или на его кнопку внизу{strict ? '.' : '. Другие объекты не подойдут.'}</p>
        <div className="pop__actions"><Button variant="ghost" size="sm" onClick={() => act('cancel')}>Отменить выбор цели</Button></div>
      </>
    );
  } else if (isBlank && !finished && s.stage === 'table') {
    icon = 'blank'; title = r.blank.name; sub = `${r.blank.material} · Ø${r.blank.diameter} × ${r.blank.length} мм`;
    body = <Action command="install" label="Установить в станок" session={session} reason={blocked('install')} />;
  } else if (isBlank && finished) {
    icon = 'cube'; title = 'Готовая деталь'; sub = `${r.blank.material} · Ø${r.blank.diameter} × ${r.blank.length} мм`;
    body = (
      <>
        <ul className="pop__list">
          {(s.part?.sections ?? []).map((sec, i) => <li key={i}><span>Участок {i + 1}</span><b>Ø{sec.diameter} × {sec.length} мм</b></li>)}
        </ul>
        <Action command="store" label="Отправить на склад" session={session} reason={blocked('store')} />
      </>
    );
  } else if (isMachine) {
    icon = 'lathe'; title = r.machine.name; sub = r.tool.name;
    if (s.stage === 'table') body = <p className="t-small t-dim">Станок пуст. Заготовка ещё на столе.</p>;
    else if (finished) body = (
      <>
        <p className="t-small t-dim">Все операции выполнены. Выберите готовую деталь в станке, чтобы отправить её на склад.</p>
        <div className="pop__actions"><Button variant="primary" size="sm" onClick={() => session.click(r.blank.id)}>Выбрать деталь</Button></div>
      </>
    );
    else body = (
      <>
        <ul className="pop__list">
          <li><span>Операция</span><b>{s.operationIndex + 1} из {r.operations.length}</b></li>
          <li><span>Результат</span><b>Ø{op.diameter} × {op.length} мм</b></li>
          <li><span>Время</span><b>{op.seconds} с</b></li>
        </ul>
        {s.stage === 'processing' ? (
          <div className="pop__progress"><span>Идёт обработка · {Math.round(session.progress * 100)}%</span><Meter value={session.progress * 100} tone="amber" label="Прогресс обработки" /></div>
        ) : (
          <Action command="process" variant="run" label={`Запустить обработку ${s.operationIndex + 1} / ${r.operations.length}`} session={session} reason={blocked('process')} />
        )}
      </>
    );
  } else if (isStore || (isBlank && s.stage === 'stored')) {
    icon = 'warehouse'; title = r.warehouse.name; sub = `Деталей: ${s.count} из ${r.warehouse.capacity}`;
    body = <p className="t-small t-dim">{s.stage === 'stored' ? 'Готовая деталь на складе.' : finished ? 'Чтобы сдать деталь, выберите её в станке и нажмите «Отправить на склад».' : 'Склад принимает только готовую деталь.'}</p>;
  } else return null;

  const style = place && !place.dock ? { left: place.left, top: place.top } : undefined;
  return (
    <>
      {place && !place.dock && <span className="pop-dot" style={{ left: anchor.x, top: anchor.y }} aria-hidden="true" />}
      <div ref={ref} className={`pop panel ${place?.dock ? 'pop--dock' : ''}`} data-side={place?.side} style={{ ...style, visibility: place ? 'visible' : 'hidden' }} role="region" aria-label={`Объект: ${title}`}>
        <header><span className="pop__icon" aria-hidden="true"><Icon name={icon} size={20} /></span><div><strong>{title}</strong><small>{sub}</small></div><Button variant="quiet" size="sm" icon="close" label="Скрыть панель объекта" onClick={() => setHiddenKey(selectionKey)} /></header>
        {body}
      </div>
    </>
  );
}

function Action({ command, label, session, reason, variant = 'primary' }: { command: Parameters<MissionSession['command']>[0]; label: string; session: MissionSession; reason: string; variant?: 'primary' | 'run' }) {
  const disabled = !!reason;
  return (
    <div className="pop__actions">
      <Button variant={variant} size="md" iconRight="next" disabled={disabled} onClick={() => session.command(command)}>{label}</Button>
      {disabled && <p className="pop__why" role="note">{reason}</p>}
    </div>
  );
}

/* ---------- Нижняя панель: подсказка и объекты ---------- */
export function Dock({ session, onHint, hintText }: { session: MissionSession; onHint: () => void; hintText: string | null }) {
  useSession(session);
  const [why, setWhy] = useState(false);
  const r = session.core.resources;
  const s = session.state;
  const coach = session.mode !== 'olympiad' && (session.coaching || session.mode === 'test');
  const location = s.stage === 'table' || s.stage === 'finished' ? r.blank.id : s.stage === 'stored' ? r.warehouse.id : r.machine.id;
  const items: { key: string; id: string; icon: IconName; name: string; sub: string; tone: string }[] = [
    { key: '1', id: location, icon: 'blank', name: s.stage === 'finished' ? 'Готовая деталь' : r.blank.name, sub: s.stage === 'table' ? 'на столе' : s.stage === 'stored' ? 'на складе' : 'в станке', tone: s.selected === r.blank.id ? 'sel' : '' },
    { key: '2', id: r.machine.id, icon: 'lathe', name: r.machine.name, sub: s.stage === 'processing' ? `обработка ${Math.round(session.progress * 100)}%` : s.stage === 'loaded' ? 'готов к запуску' : s.stage === 'finished' || s.stage === 'stored' ? 'работа окончена' : 'свободен', tone: s.selected === r.machine.id ? 'sel' : '' },
    { key: '3', id: r.warehouse.id, icon: 'warehouse', name: r.warehouse.name, sub: `${s.count} / ${r.warehouse.capacity}`, tone: s.selected === r.warehouse.id ? 'sel' : '' },
  ];
  const wantId = s.target === 'machine' ? r.machine.id : s.target === 'warehouse' ? r.warehouse.id : null;
  const hasStatus = !session.core.isWelcome;

  let bar: ReactNode = null;
  if (session.mode === 'olympiad') {
    bar = <p className="dock__hint"><Icon name="shield" size={18} /><span>{s.target ? 'Выберите объект на сцене.' : s.stage === 'processing' ? 'Идёт обработка.' : 'Олимпиада: подсказок нет. Работайте по чертежу.'}</span></p>;
  } else if (coach) {
    bar = (
      <div className="dock__hint dock__hint--coach">
        <Icon name="bulb" size={18} />
        <div><strong aria-live="polite">{session.core.hint}</strong>{why && <p className="t-small t-dim">{whyText(session)}</p>}</div>
        <Button variant="quiet" size="sm" aria-expanded={why} onClick={() => setWhy(v => !v)}>{why ? 'Скрыть' : 'Почему?'}</Button>
      </div>
    );
  } else {
    bar = (
      <div className="dock__hint">
        <Icon name="hand" size={18} />
        <div>{hintText ? <strong aria-live="polite">{hintText}</strong> : <span>Обучение выключено. Подсказка стоит 30 баллов самостоятельности.</span>}</div>
        <Button variant="ghost" size="sm" icon="bulb" onClick={onHint}>Подсказка · −30</Button>
      </div>
    );
  }
  return (
    <div className="dock">
      {hasStatus && bar}
      {hasStatus && (
        <div className="dock__objects" role="group" aria-label="Объекты цеха. Клавиши 1, 2, 3">
          {items.map(item => (
            <button key={item.key} type="button" className="dock__obj" data-tone={item.tone} data-want={wantId === item.id && item.key !== '1' ? 'true' : undefined} aria-pressed={item.tone === 'sel'} onClick={() => session.click(item.id)}>
              <Icon name={item.icon} size={20} />
              <span><b>{item.name}</b><small>{item.sub}</small></span>
              <kbd aria-hidden="true">{item.key}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Брифинг ---------- */
export function Briefing({ session, level, onStart, onBack, timeLimitSec }: { session: MissionSession; level: Level; onStart: () => void; onBack: () => void; timeLimitSec: number | null }) {
  useSession(session);
  const r = session.core.resources;
  const intro = level.nodes.find(n => n.type === 'intro');
  const task = level.nodes.find(n => n.type === 'task');
  const strict = session.strict;
  return (
    <Dialog wide labelledBy="brief-title">
      <div className="brief">
        <div className="brief__text">
          <span className="eyebrow">{strict ? 'Олимпиадное задание' : session.mode === 'test' ? 'Тестовый запуск' : 'Производственный заказ'}</span>
          <h2 id="brief-title" className="t-h2">{String(intro?.params.title ?? level.name)}</h2>
          <p>{String(intro?.params.text ?? '')}</p>
          <p className="brief__task"><Icon name="flag" size={18} /><span><b>{String(task?.params.title ?? '')}.</b> {String(task?.params.instruction ?? '')}</span></p>
          <ul className="brief__rules">
            {strict ? (
              <>
                <li><Icon name="clock" size={16} />Время: {formatTime(timeLimitSec ?? 0)}. Отсчёт начнётся после кнопки «Начать».</li>
                <li><Icon name="shield" size={16} />Подсказок, паузы и перезапуска нет. Попытка одна.</li>
                <li><Icon name="alert" size={16} />Каждое неверное действие снимает 60 баллов точности.</li>
              </>
            ) : (
              <>
                <li><Icon name="target" size={16} />Каждая ошибка снимает 60 баллов точности.</li>
                <li><Icon name="bulb" size={16} />{session.coaching ? 'Обучение включено: сцена подсвечивает следующий шаг.' : 'Обучение выключено: подсказки по запросу.'}</li>
              </>
            )}
          </ul>
          {session.mode === 'training' && (
            <Switch checked={session.coaching} onChange={v => session.setCoaching(v)} label="Обучение с подсказками" hint="Выключите, если уже знаете порядок работы. Самостоятельная работа даёт больше баллов." />
          )}
        </div>
        <DrawingSheet title={level.name} blank={r.blank} ops={r.operations} />
      </div>
      <div className="dialog__actions">
        <Button variant="quiet" icon="back" onClick={onBack}>Назад</Button>
        <Button variant="primary" size="lg" data-autofocus onClick={onStart}>Начать →</Button>
      </div>
    </Dialog>
  );
}

/* ---------- Время и очки в верхней панели ---------- */
export function TimeReadout({ session }: { session: MissionSession }) {
  useSession(session);
  const remaining = session.remainingMs;
  if (remaining !== null) {
    const sec = Math.ceil(remaining / 1000);
    const tone = sec <= 10 ? 'red' : sec <= 30 ? 'amber' : 'neutral';
    return <Chip tone={tone} icon="clock"><span className="num" aria-label={`Осталось ${formatTime(sec)}`}>{formatTime(sec)}</span></Chip>;
  }
  return <Chip icon="clock"><span className="num" aria-label={`Время ${formatTime(session.timeSec)}`}>{formatTime(session.timeSec)}</span></Chip>;
}
