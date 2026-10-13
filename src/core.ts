import type { ExecutableLevel, Operation, ProductionLevel } from './compiler';
import { applyOperation, matches, matchesConfiguration, type Part, type Requirements } from './manufacturing';
export type { Part } from './manufacturing';
export type ItemStage = 'table' | 'loaded' | 'processing' | 'finished' | 'stored';
export type Command = 'start' | 'install' | 'process' | 'store' | 'cancel';
export interface CoreState {
    operationIndex: number;
    stage: ItemStage;
    selected: string | null;
    target: 'machine' | 'warehouse' | null;
    elapsed: number;
    count: number;
    warehouseId: string | null;
    activeNodeId: string | null;
    intro: boolean;
    playing: boolean;
    completed: boolean;
    disposed: boolean;
    part: Part | null;
    goal: string;
    instruction: string;
    success: string;
    checkMessage: string;
}
export type EventType = 'node-started' | 'node-completed' | 'configuration-checked' | 'blank-installed' | 'processing-started' | 'processing-finished' | 'part-stored' | 'level-completed' | 'reset';
export interface CoreEvent {
    type: EventType;
    nodeId?: string;
    message: string;
    objectId?: string;
    operationId?: string;
    warehouseId?: string;
    result?: boolean;
    part?: Part;
}
export interface LogEntry extends CoreEvent {
    sequence: number;
}
export function suitable(part: Part | null, expected: Requirements, warehouseId: string | null, expectedWarehouseId: string): boolean { return warehouseId === expectedWarehouseId && matches(part, expected); }
export class FactoryCore {
    readonly level: ExecutableLevel;
    private value!: CoreState;
    private listeners = new Set<(e: CoreEvent) => void>();
    private waitUnsubscribe: (() => void) | null = null; // A reset during an event callback invalidates the remaining old activation.
    private runId = 0;
    private sequence = 0;
    private journal: LogEntry[] = [];
    constructor(level: ExecutableLevel) { this.level = structuredClone(level); this.reset(); }
    get isWelcome() { return this.level.mode === 'welcome'; }
    get resources(): ProductionLevel { if (this.level.mode !== 'production')
        throw new Error('У текстового уровня нет оборудования.'); return this.level; }
    get currentOperation(): Operation { return this.resources.operations[this.value.operationIndex]; }
    get state(): Readonly<CoreState> { return structuredClone(this.value); }
    get log(): LogEntry[] { return structuredClone(this.journal); }
    get subscriptionCount() { return this.listeners.size; }
    subscribe(callback: (e: CoreEvent) => void) { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; }
    private emit(e: CoreEvent) { const run = this.runId; this.journal.push({ ...structuredClone(e), sequence: ++this.sequence }); for (const callback of [...this.listeners]) {
        if (run !== this.runId)
            break;
        callback(structuredClone(e));
    } }
    private clearWait() { this.waitUnsubscribe?.(); this.waitUnsubscribe = null; }
    reset() { const run = ++this.runId; this.clearWait(); this.listeners.clear(); this.sequence = 0; this.journal = []; this.value = { operationIndex: 0, stage: 'table', selected: null, target: null, elapsed: 0, count: 0, warehouseId: null, activeNodeId: this.level.entry, intro: false, playing: false, completed: false, disposed: false, part: null, goal: '', instruction: '', success: '', checkMessage: '' }; this.emit({ type: 'reset', message: 'Новый запуск: состояние сброшено' }); if (run === this.runId)
        this.activate(); }
    dispose() { this.runId++; this.clearWait(); this.listeners.clear(); this.value.disposed = true; this.value.playing = false; this.value.target = null; this.value.elapsed = 0; if (this.value.stage === 'processing')
        this.value.stage = 'loaded'; }
    private active() { return this.level.scenario.find(n => n.id === this.value.activeNodeId); }
    private activate() {
        const run = this.runId;
        if (this.value.disposed || this.value.completed)
            return;
        const n = this.active();
        if (!n)
            return;
        this.emit({ type: 'node-started', nodeId: n.id, message: `Вход в ноду: ${n.type}` });
        if (run !== this.runId || this.value.disposed)
            return;
        switch (n.type) {
            case 'start':
                this.advance();
                break;
            case 'intro':
                this.value.intro = true;
                break;
            case 'task':
                this.value.playing = true;
                this.value.goal = String(n.params.title);
                this.value.instruction = String(n.params.instruction);
                this.advance();
                break;
            case 'check': {
                const correct = matchesConfiguration(this.level.checks[n.id]);
                this.value.checkMessage = String(correct ? n.params.success : n.params.error);
                this.emit({ type: 'configuration-checked', nodeId: n.id, result: correct, message: this.value.checkMessage });
                if (run === this.runId && !this.value.disposed)
                    this.advance(correct ? 'correct' : 'incorrect');
                break;
            }
            case 'wait':
                this.waitUnsubscribe = this.subscribe(e => { if (e.type === 'part-stored')
                    this.checkWait(); });
                this.checkWait();
                break;
            case 'finish':
                this.value.completed = true;
                this.value.playing = false;
                this.value.success = String(n.params.text);
                this.value.selected = null;
                this.value.target = null;
                this.clearWait();
                this.emit({ type: 'node-completed', nodeId: n.id, message: 'Завершение выполнено' });
                if (run === this.runId && !this.value.disposed)
                    this.emit({ type: 'level-completed', nodeId: n.id, message: this.value.success });
                break;
        }
    }
    private advance(port = 'out') { const run = this.runId; const n = this.active(); if (!n)
        return; this.clearWait(); this.emit({ type: 'node-completed', nodeId: n.id, message: `Выход из ноды: ${n.type}` }); if (run !== this.runId || this.value.disposed || this.value.completed)
        return; this.value.activeNodeId = this.level.next[n.id]?.[port] ?? null; this.activate(); }
    private checkWait() { if (this.isWelcome || this.active()?.type !== 'wait' || this.value.disposed)
        return; const w = this.resources.waits[this.value.activeNodeId!]; if (this.value.stage === 'stored' && this.value.count >= w.quantity && suitable(this.value.part, w.requirements, this.value.warehouseId, w.warehouseId))
        this.advance(); }
    can(command: Command) {
        const s = this.value;
        if (s.disposed || s.completed)
            return false;
        if (command === 'start')
            return s.intro;
        if (this.isWelcome || !s.playing || s.intro)
            return false;
        if (command === 'cancel')
            return s.target !== null;
        if (s.stage === 'processing' || s.target)
            return false;
        if (command === 'install')
            return s.stage === 'table' && s.selected === this.resources.blank.id;
        if (command === 'process')
            return s.stage === 'loaded' && s.selected === this.resources.machine.id;
        if (command === 'store')
            return s.stage === 'finished' && s.selected === this.resources.blank.id && s.count < this.resources.warehouse.capacity;
        return false;
    }
    command(command: Command) { if (!this.can(command))
        return false; if (command === 'start') {
        this.value.intro = false;
        this.advance();
    } if (command === 'install')
        this.value.target = 'machine'; if (command === 'store')
        this.value.target = 'warehouse'; if (command === 'cancel')
        this.value.target = null; if (command === 'process') {
        this.value.stage = 'processing';
        this.value.elapsed = 0;
        this.emit({ type: 'processing-started', operationId: this.currentOperation.id, objectId: this.resources.machine.id, message: `Обработка: ${this.currentOperation.seconds} с` });
    } return true; }
    click(id: string) {
        const s = this.value;
        if (this.isWelcome || s.disposed || !s.playing || s.intro || s.completed || s.stage === 'processing')
            return false;
        if (s.target === 'machine') {
            if (id !== this.resources.machine.id || s.stage !== 'table' || s.selected !== this.resources.blank.id)
                return false;
            s.stage = 'loaded';
            s.selected = id;
            s.target = null;
            this.emit({ type: 'blank-installed', objectId: this.resources.blank.id, message: 'Заготовка установлена в станок' });
            return true;
        }
        if (s.target === 'warehouse') {
            if (id !== this.resources.warehouse.id || s.stage !== 'finished' || s.selected !== this.resources.blank.id || s.count >= this.resources.warehouse.capacity || !s.part)
                return false;
            s.stage = 'stored';
            s.selected = id;
            s.target = null;
            s.count = 1;
            s.warehouseId = id;
            this.emit({ type: 'part-stored', warehouseId: id, objectId: this.resources.blank.id, part: s.part, message: 'Готовая деталь поступила на склад' });
            return true;
        }
        if (id === this.resources.blank.id && (s.stage === 'table' || s.stage === 'finished')) {
            s.selected = id;
            return true;
        }
        if (id === this.resources.machine.id || id === this.resources.warehouse.id) {
            s.selected = id;
            return true;
        }
        return false;
    }
    tick(delta: number) {
        if (this.isWelcome || this.value.disposed || this.value.stage !== 'processing' || !Number.isFinite(delta) || delta <= 0)
            return;
        const op = this.currentOperation;
        const duration = op.seconds * 1000;
        this.value.elapsed = Math.min(duration, this.value.elapsed + delta);
        if (this.value.elapsed === duration) {
            this.value.part = applyOperation(this.resources.blank, this.value.part, op);
            this.value.selected = this.resources.machine.id;
            const index = this.value.operationIndex;
            if (index + 1 < this.resources.operations.length) {
                this.value.operationIndex++;
                this.value.stage = 'loaded';
                this.value.elapsed = 0;
            }
            else
                this.value.stage = 'finished';
            this.emit({ type: 'processing-finished', operationId: op.id, objectId: this.resources.machine.id, part: this.value.part, message: `Операция ${index + 1} завершена: ${op.kind === 'turning' ? `Ø${op.diameter} × ${op.length} мм` : `снято ${op.depth} мм`}` });
        }
    }
    get hint() { const s = this.value; if (s.completed)
        return s.success; if (s.intro)
        return 'Прочитайте вступление и нажмите «Продолжить».'; if (s.target === 'machine')
        return 'Выберите станок на карте или отмените выбор цели.'; if (s.target === 'warehouse')
        return 'Выберите склад на карте или отмените выбор цели.'; if (this.isWelcome)
        return 'Следуйте тексту вступления.'; if (s.stage === 'table')
        return s.selected === this.resources.blank.id ? 'Нажмите «Установить в станок».' : 'Выберите заготовку на столе.'; if (s.stage === 'loaded')
        return s.selected === this.resources.machine.id ? `Нажмите «Обработать»: операция ${s.operationIndex + 1} из ${this.resources.operations.length}.` : 'Выберите загруженный станок.'; if (s.stage === 'processing')
        return 'Дождитесь завершения обработки.'; if (s.stage === 'finished')
        return s.selected === this.resources.blank.id ? 'Нажмите «Отправить на склад».' : 'Выберите готовую деталь в станке.'; return 'Деталь на складе не соответствует требованиям. Измените техпроцесс или требования в редакторе.'; }
}
