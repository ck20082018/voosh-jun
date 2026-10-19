import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { registry, type Level } from '../level';
import { compileLevel } from '../compiler';
import { FactoryCore } from '../core';
import { MissionSession, type SessionMode } from '../platform/session';
import { stageIndex, STAGES } from '../platform/explain';
import { formatTime } from '../platform/result';
import type { Anchor, WorkshopHandle } from '../Workshop';
import { isReducedMotion, type MotionSetting } from '../ui/motion';
import { Icon } from '../ui/Icon';
import { Button, Chip, Dialog, Segmented, Switch, useToasts } from '../ui/primitives';
import { Briefing, RuntimeHints, Dock, ObjectPopover, TaskSheet, TimeReadout, potentialScore, useSession } from './MissionPanels';

const Workshop = lazy(() => import('../Workshop').then(module => ({ default: module.Workshop })));

export interface MissionScreenProps {
  level: Level;
  mode: SessionMode;
  title: string;
  eyebrow: string;
  timeLimitSec?: number | null;
  /** Вызывается, когда игрок принял заказ (начало попытки). */
  onStarted?: () => void;
  /** Выход без результата (до начала или в тренировке). */
  onExit: () => void;
  /** Попытка закончена: выполнена, время вышло или игрок вышел из олимпиады. */
  onFinished?: (session: MissionSession) => void;
  exitLabel?: string;
  motion?: MotionSetting;
  onMotion?: (value: MotionSetting) => void;
}

const MODE_LABEL: Record<SessionMode, string> = { training: 'Тренировка', olympiad: 'Олимпиада', test: 'Тест уровня' };
type DialogKind = null | 'pause' | 'exit' | 'settings';

export function MissionScreen(props: MissionScreenProps) {
  const { level, mode, timeLimitSec = null } = props;
  const built = useMemo(() => {
    try { return { session: new MissionSession(new FactoryCore(compileLevel(structuredClone(level))), mode, { coaching: true, timeLimitSec }), error: '' }; }
    catch (error) { return { session: null, error: error instanceof Error ? error.message : String(error) }; }
    // Сессия создаётся один раз для экрана: родитель меняет key, чтобы начать заново.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => built.session?.dispose(), [built]);
  if (!built.session) {
    return (
      <main className="mission mission--error"><div className="center-card surface"><Icon name="alert" size={28} /><h1 className="t-h2">Уровень не запускается</h1><p className="t-dim">{built.error}</p><Button variant="primary" onClick={props.onExit}>Назад</Button></div></main>
    );
  }
  return built.session.core.isWelcome ? <WelcomeView {...props} session={built.session} /> : <PlayView {...props} session={built.session} />;
}

/* ---------- Уровень-приветствие: без оборудования и без сцены ---------- */
function WelcomeView({ session, level, mode, title, onExit }: MissionScreenProps & { session: MissionSession }) {
  useSession(session);
  const s = session.state;
  const active = level.nodes.find(n => n.id === s.activeNodeId);
  return (
    <main className="mission mission--welcome theme-paper">
      <header className="mission-top">
        <Button variant="ghost" icon="back" onClick={onExit}>Вернуться в редактор</Button>
        <div className="mission-top__title"><span className="eyebrow">{MODE_LABEL[mode]}</span><h1 className="t-h3">{title}</h1></div>
        <Button variant="ghost" icon="refresh" onClick={() => session.restart()}>Начать заново</Button>
      </header>
      <section className="center-card surface welcome">
        <span className="eyebrow">Знакомство</span>
        <h2 className="t-h2">{s.completed ? 'Готово' : String(active?.params.title ?? level.name)}</h2>
        <p>{s.completed ? s.success : String(active?.params.text ?? '')}</p>
        {s.intro && !s.activeHint && <Button variant="primary" size="lg" onClick={() => session.command('start')}>Продолжить →</Button>}
        {s.completed && <Button variant="ghost" onClick={() => session.restart()}>Пройти ещё раз</Button>}
      </section>
      <RuntimeHints session={session}/>{mode === 'test' && <DebugJournal session={session} level={level} />}
    </main>
  );
}

function DebugJournal({ session, level }: { session: MissionSession; level: Level }) {
  useSession(session);
  const s = session.state;
  const active = level.nodes.find(n => n.id === s.activeNodeId);
  return (
    <details className="debug surface" open>
      <summary>Журнал ядра <small>только в тесте уровня</small></summary>
      <div className="debug__grid">
        <div><span className="eyebrow">Активная нода</span><strong>{active ? registry[active.type].title : '—'}</strong><code>{s.activeNodeId ?? ''}</code></div>
        <div className="debug__log">{session.core.log.map(event => <p key={event.sequence}><span>{String(event.sequence).padStart(2, '0')}</span>{event.message}</p>)}</div>
      </div>
    </details>
  );
}

/* ---------- Игровой экран ---------- */
function PlayView(props: MissionScreenProps & { session: MissionSession }) {
  const { session, level, mode, title, eyebrow, timeLimitSec = null, onExit, onFinished, onStarted } = props;
  useSession(session);
  const stageEl = useRef<HTMLDivElement>(null);
  const handle = useRef<WorkshopHandle | null>(null);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [sheetOpen, setSheetOpen] = useState<boolean | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [hint, setHint] = useState<{ text: string; key: string } | null>(null);
  const toasts = useToasts();
  const s = session.state;
  const strict = session.strict;
  const wide = size.w >= 1040;
  const open = sheetOpen ?? wide;
  const phase = `${s.stage}|${s.operationIndex}|${s.target}|${s.selected}`;

  useEffect(() => {
    const el = stageEl.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth || 1280, h: el.clientHeight || 720 });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Сообщения об ошибках и завершении
  useEffect(() => session.onEvent(event => {
    if (event.type === 'error') toasts.push({ tone: 'err', title: event.text, text: strict ? '−60 баллов точности' : `${event.code === 'wrong-target' ? 'Подсказка: ' : ''}−60 баллов точности` });
    if (event.type === 'completed' && mode !== 'test') toasts.push({ tone: 'ok', title: 'Деталь на складе', text: 'Миссия выполнена. Подводим итог.' });
    if (event.type === 'timeout') setDialog(null);
  }), [session, strict, mode, toasts.push]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(() => onFinished?.(session), [onFinished, session]);

  // Автопереход к результату после успешного завершения
  useEffect(() => {
    if (session.ended !== 'completed' || mode === 'test' || !onFinished) return;
    const id = window.setTimeout(finish, isReducedMotion() ? 900 : 2400);
    return () => window.clearTimeout(id);
  }, [session.ended, mode, onFinished, finish]);

  // Горячие клавиши
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const r = session.core.resources, st = session.state;
      if (!session.running) return;
      const location = st.stage === 'table' || st.stage === 'finished' ? r.blank.id : st.stage === 'stored' ? r.warehouse.id : r.machine.id;
      if (event.key === '1') session.click(location);
      else if (event.key === '2') session.click(r.machine.id);
      else if (event.key === '3') session.click(r.warehouse.id);
      else if (event.key === 'Escape' && st.target) session.command('cancel');
      else if (event.key === '+' || event.key === '=') handle.current?.zoomBy(1.25);
      else if (event.key === '-') handle.current?.zoomBy(0.8);
      else if (event.key === '0') handle.current?.fit();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);

  const openDialog = (kind: DialogKind) => { if (kind === 'pause') session.setPaused(true); setDialog(kind); };
  const closeDialog = () => { if (dialog === 'pause') session.setPaused(false); setDialog(null); };
  const requestExit = () => (mode === 'test' ? onExit() : openDialog('exit'));
  const confirmExit = () => {
    setDialog(null);
    if (strict && session.state.playing) { session.abandon(); finish(); } else onExit();
  };

  const insets = useMemo(() => ({
    left: wide && open ? 372 : 16, right: 16, top: wide ? 16 : open ? 150 : 76, bottom: size.w < 760 ? 230 : 156,
  }), [wide, open, size.w]);

  const stepIndex = stageIndex(session);
  const hintText = hint && hint.key === phase ? hint.text : null;
  const potential = potentialScore(session);
  const timeout = session.ended === 'timeout';

  return (
    <main className={`mission mission--${mode}`} data-paused={session.paused || undefined}>
      <header className="mission-top">
        <Button variant="ghost" icon="back" label="Выйти из задания" onClick={requestExit} />
        <div className="mission-top__title"><span className="eyebrow">{eyebrow}</span><h1 className="t-h3">{title}</h1></div>
        <ol className="steps" aria-label="Этапы работы">
          {STAGES.map((name, i) => <li key={name} data-state={i < stepIndex ? 'done' : i === stepIndex ? 'now' : 'todo'} aria-current={i === stepIndex ? 'step' : undefined}><i aria-hidden="true">{i < stepIndex ? <Icon name="check" size={12} /> : i + 1}</i><span>{name}</span></li>)}
        </ol>
        <div className="mission-top__stats">
          <Chip tone={strict ? 'amber' : mode === 'test' ? 'neutral' : 'teal'} icon={strict ? 'trophy' : mode === 'test' ? 'editor' : 'book'}>{MODE_LABEL[mode]}</Chip>
          <span title="Максимум баллов, который ещё можно получить. Каждая ошибка снимает 60; при включённом обучении самостоятельность даёт 40 из 100.">
            <Chip tone={potential < 1000 ? 'amber' : 'green'} icon="star"><span className="num">до {potential}</span></Chip>
          </span>
          <Chip tone={session.errors.length ? 'red' : 'neutral'} icon="alert"><span className="num" aria-label={`Ошибок: ${session.errors.length}`}>{session.errors.length}</span></Chip>
          <TimeReadout session={session} />
        </div>
        <div className="mission-top__tools">
          <Button variant="quiet" icon="pause" label={strict ? 'Пауза недоступна в олимпиаде' : 'Пауза'} disabled={strict || !session.running} title={strict ? 'Пауза недоступна в олимпиаде' : 'Пауза'} onClick={() => openDialog('pause')} />
          <Button variant="quiet" icon="settings" label="Настройки" onClick={() => openDialog('settings')} />
        </div>
      </header>

      <div className="mission-stage" ref={stageEl}>
        <Suspense fallback={<div className="scene-loading" role="status">Загрузка цеха…</div>}>
          <Workshop level={level} session={session} handle={handle} onAnchor={setAnchor} insets={insets} coachHighlights={mode !== 'olympiad' && (session.coaching || mode === 'test')} />
        </Suspense>
        <TaskSheet session={session} collapsed={!open} onToggle={() => setSheetOpen(!open)} />
        <ObjectPopover session={session} anchor={anchor} stage={stageEl.current} />
        <div className="scene-tools panel" role="group" aria-label="Камера">
          <Button variant="quiet" size="sm" icon="zoomIn" label="Приблизить (+)" onClick={() => handle.current?.zoomBy(1.25)} />
          <Button variant="quiet" size="sm" icon="zoomOut" label="Отдалить (−)" onClick={() => handle.current?.zoomBy(0.8)} />
          <Button variant="quiet" size="sm" icon="fit" label="Показать весь цех (0)" onClick={() => handle.current?.fit()} />
        </div>
        <Dock session={session} hintText={hintText} onHint={() => setHint({ text: session.useHint(), key: phase })} />
        {s.completed && (
          <div className="finish-banner panel" role="status">
            <Icon name="checkCircle" size={26} />
            <div><strong>{mode === 'test' ? 'Задание выполнено' : 'Миссия выполнена'}</strong><p>{s.success}</p></div>
            {mode === 'test'
              ? <><Button variant="ghost" onClick={() => session.restart()}>Пройти ещё раз</Button><Button variant="primary" onClick={onExit}>Вернуться в редактор</Button></>
              : <Button variant="primary" iconRight="next" onClick={finish}>Показать результат</Button>}
          </div>
        )}
      </div>
      {mode === 'test' && <div className="stage-debug"><DebugJournal session={session} level={level} /></div>}
      {toasts.node}

      <RuntimeHints session={session}/>{s.intro && !s.activeHint && <Briefing session={session} level={level} timeLimitSec={timeLimitSec} onBack={onExit} onStart={() => { session.command('start'); onStarted?.(); }} />}

      {dialog === 'pause' && (
        <Dialog title="Пауза" onClose={closeDialog}>
          <p className="t-dim">Время остановлено. Станок и сцена ждут вас.</p>
          <div className="dialog__actions">
            {mode !== 'olympiad' && <Button variant="ghost" icon="refresh" onClick={() => { session.restart(); closeDialog(); }}>Начать заново</Button>}
            <Button variant="primary" data-autofocus icon="play" onClick={closeDialog}>Продолжить</Button>
          </div>
        </Dialog>
      )}
      {dialog === 'exit' && (
        <Dialog title="Выйти из задания?" onClose={closeDialog}>
          <p className="t-dim">{strict && s.playing ? 'Выход засчитает попытку этапа с текущим результатом. Повторить этап нельзя.' : 'Попытка не сохранится. Миссия останется в списке, а прогресс других заданий не изменится.'}</p>
          <div className="dialog__actions">
            <Button variant="ghost" data-autofocus onClick={closeDialog}>Остаться</Button>
            <Button variant="danger" onClick={confirmExit}>{strict && s.playing ? 'Сдать как есть и выйти' : 'Выйти'}</Button>
          </div>
        </Dialog>
      )}
      {dialog === 'settings' && (
        <Dialog title="Настройки" onClose={closeDialog}>
          <div className="settings">
            {mode === 'training' ? (
              <Switch checked={session.coaching} onChange={v => session.setCoaching(v)} label="Обучение с подсказками" hint="Включено: сцена подсвечивает следующий шаг, а самостоятельность даёт 40 из 100 баллов. Выключено: подсказки по запросу, −30 баллов за каждую." />
            ) : <p className="t-dim">{strict ? 'В олимпиаде подсказки, пауза и перезапуск отключены, а оценка не зависит от уровня игрока.' : 'В тесте уровня обучающая подсветка включена всегда.'}</p>}
            {props.onMotion && props.motion && (
              <div className="field"><span>Анимации</span><Segmented label="Анимации" value={props.motion} onChange={props.onMotion} options={[{ value: 'system', label: 'Как в системе' }, { value: 'reduce', label: 'Меньше' }, { value: 'full', label: 'Обычные' }]} /></div>
            )}
            <p className="t-small t-faint">Управление: 1, 2, 3 — выбрать объект, Esc — отменить выбор цели, + и − — масштаб, 0 — весь цех. Сцену можно двигать мышью или пальцем.</p>
          </div>
          <div className="dialog__actions"><Button variant="primary" data-autofocus onClick={closeDialog}>Готово</Button></div>
        </Dialog>
      )}
      {timeout && (
        <Dialog title="Время вышло" labelledBy="timeout-title">
          <p className="t-dim">Работа сдаётся в том виде, в каком она есть. Баллы за время засчитываются только за завершённую деталь.</p>
          <div className="dialog__actions"><Button variant="primary" data-autofocus iconRight="next" onClick={finish}>Показать результат · {formatTime(timeLimitSec ?? 0)}</Button></div>
        </Dialog>
      )}
    </main>
  );
}
