import { FactoryCore, type Command, type CoreEvent } from '../core';
import { parSeconds, type AttemptSummary } from './scoring';

/**
 * Сессия миссии — тонкая обёртка над FactoryCore. Ядро остаётся единственным источником правил;
 * сессия лишь ведёт журнал попытки: ошибки, подсказки, активное время и протокол действий.
 */
export type SessionMode = 'training' | 'olympiad' | 'test';
export type SessionEvent =
  | { type: 'error'; code: 'wrong-target' | 'invalid-command'; text: string; objectId?: string }
  | { type: 'ok'; text: string; objectId?: string }
  | { type: 'core'; event: CoreEvent }
  | { type: 'completed' }
  | { type: 'timeout' };
export interface ProtocolEntry { atSec: number; kind: 'action' | 'error' | 'hint' | 'result'; text: string }
export interface ErrorRecord { atSec: number; code: 'wrong-target' | 'invalid-command'; text: string; fix: string }

const NOTIFY_EVERY_MS = 90;

export class MissionSession {
  readonly core: FactoryCore;
  readonly mode: SessionMode;
  readonly timeLimitMs: number | null;
  coaching: boolean;
  paused = false;
  activeMs = 0;
  errors: ErrorRecord[] = [];
  hints = 0;
  installed = false;
  protocol: ProtocolEntry[] = [];
  ended: 'completed' | 'timeout' | 'abandoned' | null = null;
  version = 0;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: SessionEvent) => void>();
  private unsubscribeCore: (() => void) | null = null;
  private sinceNotify = 0;

  constructor(core: FactoryCore, mode: SessionMode, options: { coaching?: boolean; timeLimitSec?: number | null } = {}) {
    this.core = core;
    this.mode = mode;
    this.coaching = mode === 'training' ? options.coaching ?? true : false;
    this.timeLimitMs = options.timeLimitSec ? options.timeLimitSec * 1000 : null;
    this.bind();
  }

  /* ---------- подписки ---------- */
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getVersion = () => this.version;
  onEvent(listener: (event: SessionEvent) => void) { this.eventListeners.add(listener); return () => { this.eventListeners.delete(listener); }; }
  private notify() { this.version++; for (const l of [...this.listeners]) l(); }
  private emit(event: SessionEvent) { for (const l of [...this.eventListeners]) l(event); }
  private bind() {
    this.unsubscribeCore?.();
    this.unsubscribeCore = this.core.subscribe(event => {
      if (event.type === 'blank-installed') { this.installed = true; this.log('action', 'Заготовка установлена в станок'); }
      if (event.type === 'processing-started') this.log('action', event.message);
      if (event.type === 'processing-finished') this.log('action', event.message);
      if (event.type === 'part-stored') this.log('action', 'Деталь отправлена на склад');
      this.emit({ type: 'core', event });
    });
  }
  private log(kind: ProtocolEntry['kind'], text: string) { this.protocol.push({ atSec: Math.round(this.activeMs / 100) / 10, kind, text }); }

  /* ---------- производные величины ---------- */
  get state() { return this.core.state; }
  get strict() { return this.mode === 'olympiad'; }
  get timeSec() { return this.activeMs / 1000; }
  get remainingMs(): number | null { return this.timeLimitMs === null ? null : Math.max(0, this.timeLimitMs - this.activeMs); }
  get running() { const s = this.core.state; return !this.core.isWelcome && s.playing && !s.intro && !s.completed && this.ended === null; }
  get opsTotal() { return this.core.isWelcome ? 0 : this.core.resources.operations.length; }
  get opsDone(): number {
    if (this.core.isWelcome) return 0;
    const s = this.core.state;
    if (s.stage === 'finished' || s.stage === 'stored') return this.opsTotal;
    return s.stage === 'table' ? 0 : s.operationIndex;
  }
  /** Доля обработки текущей операции (0..1). */
  get progress(): number {
    if (this.core.isWelcome) return 0;
    const s = this.core.state;
    if (s.stage !== 'processing') return 0;
    return Math.min(1, s.elapsed / (this.core.currentOperation.seconds * 1000));
  }

  /** Почему команда сейчас недоступна. Пустая строка, если доступна. */
  blockedReason(command: Command): string {
    if (this.core.can(command)) return '';
    const s = this.core.state;
    if (this.core.isWelcome) return 'В этом уровне нет оборудования.';
    if (s.completed) return 'Задание уже выполнено.';
    if (s.intro) return 'Сначала примите заказ.';
    if (s.stage === 'processing') return 'Дождитесь окончания обработки.';
    if (s.target && command !== 'cancel') return 'Сначала выберите цель на карте или отмените выбор.';
    const r = this.core.resources;
    switch (command) {
      case 'install':
        if (s.stage !== 'table') return 'Заготовка уже в станке.';
        return 'Выберите заготовку на столе.';
      case 'process':
        if (s.stage === 'table') return 'В станке нет заготовки. Сначала установите её.';
        if (s.stage === 'finished' || s.stage === 'stored') return 'Все операции уже выполнены.';
        return `Выберите ${r.machine.name.toLowerCase()}, чтобы запустить обработку.`;
      case 'store':
        if (s.stage !== 'finished') return 'На склад можно отправить только готовую деталь.';
        if (s.selected !== r.blank.id) return 'Выберите готовую деталь в станке.';
        return 'На складе нет места.';
      case 'cancel': return 'Нечего отменять.';
      case 'start': return 'Заказ уже принят.';
    }
  }

  /* ---------- действия игрока ---------- */
  command(command: Command): boolean {
    if (this.ended) return false;
    const reason = this.blockedReason(command);
    const ok = this.core.command(command);
    if (!ok) {
      if (command !== 'cancel' && command !== 'start') this.recordError('invalid-command', reason || 'Действие сейчас недоступно.', reason);
    } else if (command === 'start') this.log('action', 'Заказ принят');
    this.checkEnd();
    this.notify();
    return ok;
  }

  click(id: string): boolean {
    if (this.ended) return false;
    const before = this.core.state;
    const ok = this.core.click(id);
    if (!ok && before.target && this.running) {
      const r = this.core.resources;
      const expected = before.target === 'machine' ? r.machine : r.warehouse;
      const label = id === r.machine.id ? r.machine.name : id === r.warehouse.id ? r.warehouse.name : r.blank.name;
      this.recordError('wrong-target', `${label}: сюда нельзя. Нужно выбрать «${expected.name}».`, `Выберите «${expected.name}» или отмените выбор цели.`, id);
    }
    this.checkEnd();
    this.notify();
    return ok;
  }

  private recordError(code: ErrorRecord['code'], text: string, fix: string, objectId?: string) {
    this.errors.push({ atSec: Math.round(this.activeMs / 100) / 10, code, text, fix });
    this.log('error', text);
    this.emit({ type: 'error', code, text, objectId });
  }

  useHint(): string {
    if (this.mode !== 'training' || this.coaching) return this.core.hint;
    this.hints++;
    const text = this.core.hint;
    this.log('hint', text);
    this.notify();
    return text;
  }

  setCoaching(value: boolean) { if (this.mode === 'training') { this.coaching = value; this.notify(); } }
  setPaused(value: boolean) { if (!this.strict) { this.paused = value; this.notify(); } }

  tick(delta: number) {
    if (this.paused || this.ended || !Number.isFinite(delta) || delta <= 0) return;
    const wasRunning = this.running;
    if (wasRunning) this.activeMs += delta;
    this.core.tick(delta);
    this.checkEnd();
    this.sinceNotify += delta;
    if (this.sinceNotify >= NOTIFY_EVERY_MS) { this.sinceNotify = 0; if (wasRunning || this.core.state.stage === 'processing') this.notify(); }
  }

  private checkEnd() {
    if (this.ended) return;
    if (this.core.state.completed && !this.core.isWelcome) {
      this.ended = 'completed'; this.log('result', 'Миссия выполнена'); this.emit({ type: 'completed' });
    } else if (this.remainingMs === 0) {
      this.ended = 'timeout'; this.log('result', 'Время вышло'); this.emit({ type: 'timeout' });
    }
  }

  /** Выход до завершения: попытка засчитывается с текущим результатом. */
  abandon() { if (!this.ended) { this.ended = 'abandoned'; this.log('result', 'Выход из задания'); this.notify(); } }

  restart() {
    this.core.reset();
    this.bind();
    this.errors = []; this.hints = 0; this.installed = false; this.activeMs = 0; this.protocol = []; this.ended = null; this.paused = false; this.sinceNotify = 0;
    this.notify();
  }

  dispose() { this.unsubscribeCore?.(); this.unsubscribeCore = null; this.core.dispose(); this.listeners.clear(); this.eventListeners.clear(); }

  summary(): AttemptSummary {
    const ops = this.core.isWelcome ? [] : this.core.resources.operations;
    const s = this.core.state;
    return {
      mode: this.mode === 'olympiad' ? 'olympiad' : 'training',
      completed: this.ended === 'completed' || (s.completed && !this.core.isWelcome),
      installed: this.installed,
      stored: s.stage === 'stored',
      opsDone: this.opsDone,
      opsTotal: this.opsTotal,
      errors: this.errors.length,
      hints: this.hints,
      coaching: this.coaching,
      timeSec: this.timeSec,
      parSec: parSeconds(ops),
    };
  }
}
