import type { ExecutableLevel, Operation, ProductionLevel, MachineDefinition, WarehouseDefinition, HintDefinition } from './compiler';
import { applyOperation, matches, matchesFreeResult, matchesConfiguration, dimensions, type Part, type Requirements } from './manufacturing';
import { operationCompatibility, type ItemSource } from './productionGraph';
export type { Part } from './manufacturing';
export type ItemStage = 'table' | 'loaded' | 'processing' | 'finished' | 'stored';
export type Command = 'start' | 'install' | 'process' | 'store' | 'take' | 'cancel' | 'continue-hint';
export type ItemLocation = {
    kind: 'table' | 'machine' | 'warehouse';
    id: string;
};
export interface MachineState {
    stage: 'empty' | 'loaded' | 'processing' | 'finished';
    operationIndex: number;
    elapsed: number;
    itemId: string | null;
}
export interface WarehouseState {
    itemId: string | null;
    count: number;
}
export interface ActiveHint extends HintDefinition {
    origin: 'scenario' | 'event';
}
interface RuntimeState {
    item: Part | null;
    location: ItemLocation | null;
    machines: Record<string, MachineState>;
    warehouses: Record<string, WarehouseState>;
    waitItems: Record<string, string>;
    lastMachineId: string | null;
    selected: string | null;
    target: 'machine' | 'warehouse' | null;
    transfer: 'install' | 'take' | null;
    activeNodeId: string | null;
    intro: boolean;
    playing: boolean;
    completed: boolean;
    disposed: boolean;
    goal: string;
    instruction: string;
    success: string;
    checkMessage: string;
    activeHint: ActiveHint | null;
    hintQueue: ActiveHint[];
    panelHints: ActiveHint[];
    error: string;
}
export interface CoreState extends RuntimeState {
    stage: ItemStage;
    operationIndex: number;
    elapsed: number;
    part: Part | null;
    count: number;
    warehouseId: string | null;
}
export type EventType = 'node-started' | 'node-completed' | 'configuration-checked' | 'blank-installed' | 'processing-started' | 'processing-finished' | 'part-stored' | 'item-retrieved' | 'wait-satisfied' | 'hint-shown' | 'level-completed' | 'reset';
export interface CoreEvent {
    type: EventType;
    nodeId?: string;
    message: string;
    objectId?: string;
    machineId?: string;
    itemId?: string;
    operationId?: string;
    toolId?:string;
    warehouseId?: string;
    result?: boolean;
    part?: Part;
}
export interface LogEntry extends CoreEvent {
    sequence: number;
}
export function suitable(part: Part | null, expected: Requirements, warehouseId: string | null, expectedWarehouseId: string) { return warehouseId === expectedWarehouseId && matches(part, expected); }
export class FactoryCore {
    readonly level: ExecutableLevel;
    private value!: RuntimeState;
    private listeners = new Set<(e: CoreEvent) => void>();
    private waitUnsubscribe: (() => void) | null = null;
    private runId = 0;
    private sequence = 0;
    private journal: LogEntry[] = [];
    private shown = new Set<string>();
    constructor(level: ExecutableLevel) { this.level = structuredClone(level); this.reset(); }
    get isWelcome() { return this.level.mode === 'welcome'; }
    get resources(): ProductionLevel { if (this.level.mode !== 'production')
        throw new Error('У текстового уровня нет оборудования.'); return this.level; }
    private machine(id: string | null | undefined) { return id && Object.hasOwn(this.resources.machines, id) ? this.resources.machines[id] : undefined; }
    private warehouse(id: string | null | undefined) { return id && Object.hasOwn(this.resources.warehouses, id) ? this.resources.warehouses[id] : undefined; }
    get currentMachine(): MachineDefinition { const s = this.value; const selected = this.machine(s.selected); return selected || this.resources.machines[s.location?.kind === 'machine' ? s.location.id : s.lastMachineId ?? this.resources.machine.id]; }
    get currentWarehouse(): WarehouseDefinition { const selected = this.warehouse(this.value.selected); if (selected)
        return selected; const id = this.value.location?.kind === 'warehouse' ? this.value.location.id : this.currentMachine.storeIds[0]; return this.resources.warehouses[id] ?? this.resources.warehouse; }
    get currentPartName() { return Object.values(this.resources.waits).find(w => w.machineId === this.currentMachine.id)?.requirements.name ?? this.resources.partName; }
    get currentTool(){const m=this.currentMachine;return m.operationTools?.[this.currentOperation.id]??m.tool;}
    get currentOperation(): Operation { const m = this.currentMachine; return m.operations[this.value.machines[m.id].operationIndex]; }
    get state(): Readonly<CoreState> { const s = this.value; const m = !this.isWelcome ? this.value.machines[this.currentMachine.id] : undefined; const stage: ItemStage = s.location?.kind === 'warehouse' ? 'stored' : s.location?.kind === 'machine' ? (this.value.machines[s.location.id].stage === 'empty' ? 'table' : this.value.machines[s.location.id].stage as ItemStage) : 'table'; return structuredClone({ ...s, stage, operationIndex: m?.operationIndex ?? 0, elapsed: m?.elapsed ?? 0, part: s.item?.operationIds.length ? s.item : null, count: Object.values(s.warehouses).reduce((sum, w) => sum + w.count, 0), warehouseId: s.location?.kind === 'warehouse' ? s.location.id : null }); }
    get log() { return structuredClone(this.journal); }
    get subscriptionCount() { return this.listeners.size; }
    subscribe(callback: (e: CoreEvent) => void) { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; }
    private emit(e: CoreEvent) { const run = this.runId; this.journal.push({ ...structuredClone(e), sequence: ++this.sequence }); if (!this.value.disposed)
        this.actionHints(e); for (const listener of [...this.listeners]) {
        if (run !== this.runId || this.value.disposed)
            break;
        listener(structuredClone(e));
    } }
    private actionHints(e: CoreEvent) { for (const trigger of this.level.eventHints) {
        if (trigger.action !== e.type || e.type === 'configuration-checked' && e.result !== true)
            continue;
        if (trigger.objectId && ![e.objectId, e.machineId, e.itemId, e.warehouseId, e.nodeId, e.operationId].includes(trigger.objectId))
            continue;
        const h = this.level.hints[trigger.hintId];
        if (h.frequency === 'once' && this.shown.has(h.id))
            continue;
        this.shown.add(h.id);
        this.value.hintQueue.push({ ...h, origin: 'event' });
    } this.showNextHint(); }
    private showNextHint() { if (this.value.activeHint)
        return; while (this.value.hintQueue.length) {
        const h = this.value.hintQueue.shift()!;
        this.journal.push({ type: 'hint-shown', nodeId: h.id, message: h.text, sequence: ++this.sequence });
        if (!h.confirm)
            this.value.panelHints.push({ ...h, display: 'panel' });
        if (h.confirm || h.display === 'modal') {
            this.value.activeHint = h;
            return;
        }
    } }
    private clearWait() { this.waitUnsubscribe?.(); this.waitUnsubscribe = null; }
    reset() {
        const run = ++this.runId;
        this.clearWait();
        this.listeners.clear();
        this.shown.clear();
        this.sequence = 0;
        this.journal = [];
        const production = this.level.mode === 'production' ? this.level : null;
        this.value = { item: production ? { ...dimensions(production.blank), blankId: production.blank.id, material: production.blank.material, sections: [], operationIds: [] } : null, location: production ? { kind: 'table', id: production.blank.id } : null, machines: production ? Object.fromEntries(Object.keys(production.machines).map(id => [id, { stage: 'empty', operationIndex: 0, elapsed: 0, itemId: null }])) : {}, warehouses: production ? Object.fromEntries(Object.keys(production.warehouses).map(id => [id, { itemId: null, count: 0 }])) : {}, waitItems: {}, lastMachineId: null, selected: null, target: null, transfer: null, activeNodeId: this.level.entry, intro: false, playing: false, completed: false, disposed: false, goal: '', instruction: '', success: '', checkMessage: '', activeHint: null, hintQueue: [], panelHints: [], error: '' };
        this.emit({ type: 'reset', message: 'Новый запуск: состояние сброшено' });
        if (run === this.runId)
            this.activate();
    }
    dispose() { this.runId++; this.clearWait(); this.listeners.clear(); this.shown.clear(); this.value.disposed = true; this.value.playing = false; this.value.target = null; this.value.activeHint = null; this.value.hintQueue = []; this.value.panelHints = []; for (const m of Object.values(this.value.machines)) {
        if (m.stage === 'processing')
            m.stage = 'loaded';
        m.elapsed = 0;
    } }
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
            case 'hint': {
                const h = this.level.hints[n.id];
                this.value.hintQueue.push({ ...h, origin: 'scenario' });
                this.showNextHint();
                if (!h.confirm)
                    this.advance();
                break;
            }
            case 'task':
                this.value.playing = true;
                this.value.goal = String(n.params.title);
                this.value.instruction = String(n.params.instruction);
                this.advance();
                break;
            case 'check':
                this.checkConfiguration();
                break;
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
    private resolveSource(source: ItemSource): Part | null { const s = this.value; if (!s.item)
        return null; if (source.kind === 'blank')
        return source.id === s.item.blankId ? s.item : null; if (source.kind === 'wait')
        return s.waitItems[source.id] === s.item.blankId ? s.item : null; return s.location?.kind === 'warehouse' && s.location.id === source.id && s.warehouses[source.id]?.itemId === s.item.blankId ? s.item : null; }
    itemIdForOutput(nodeId: string): string | null { if (this.isWelcome || this.value.disposed)
        return null; if (nodeId in this.resources.waits)
        return this.value.waitItems[nodeId] ?? null; return this.value.warehouses[nodeId]?.itemId ?? null; }
    itemFromOutput(nodeId: string): Part | null { return this.itemIdForOutput(nodeId) === this.value.item?.blankId ? structuredClone(this.value.item) : null; }
    private checkConfiguration() {
        const n = this.active();
        if (n?.type !== 'check')
            return;
        const run = this.runId;
        const c = this.level.checks[n.id];
        const data = structuredClone(c);
        let available = true;
        if (c.blankSource) {
            const part = this.resolveSource(c.blankSource);
            if (!part)
                available = false;
            else
                data.actual.blank = { ...dimensions(part), material: part.material };
        }
        let resultPart: Part | null = null;
        if (c.detailSource) {
            resultPart = this.resolveSource(c.detailSource);
            if (!resultPart)
                available = false;
        }
        if (!available) {
            this.waitUnsubscribe = this.subscribe(e => { if (['wait-satisfied', 'part-stored'].includes(e.type)) {
                this.clearWait();
                this.checkConfiguration();
            } });
            this.value.error = 'Проверка ждёт фактическую деталь из завершённого ожидания.';
            return;
        }
        const correct = matchesConfiguration(data) && (!c.resultRequirements || (this.level.mode==='production'&&this.resources.resultMode==='geometry'?matchesFreeResult:matches)(resultPart,c.resultRequirements));
        this.value.error = '';
        this.value.checkMessage = String(correct ? n.params.success : n.params.error);
        this.emit({ type: 'configuration-checked', nodeId: n.id, result: correct, message: this.value.checkMessage });
        if (run === this.runId && !this.value.disposed)
            this.advance(correct ? 'correct' : 'incorrect');
    }
    private checkWait() {
        if (this.isWelcome || this.active()?.type !== 'wait' || this.value.disposed)
            return;
        const id = this.value.activeNodeId!;
        const w = this.resources.waits[id];
        const s = this.value;
        if (s.location?.kind === 'warehouse' && s.location.id === w.warehouseId && s.warehouses[w.warehouseId].count >= w.quantity && s.lastMachineId === w.machineId && (this.resources.resultMode==='geometry'?matchesFreeResult(s.item,w.requirements):suitable(s.item,w.requirements,s.location.id,w.warehouseId))) {
            const run = this.runId;
            s.waitItems[id] = s.item!.blankId;
            this.emit({ type: 'wait-satisfied', nodeId: id, itemId: s.item!.blankId, message: 'Ожидание нашло подходящую фактическую деталь' });
            if (run === this.runId && !s.disposed)
                this.advance();
        }
    }
    private blocked() { return this.value.activeHint?.confirm === true; }
    can(command: Command) {
        const s = this.value;
        if (s.disposed)
            return false;
        if (command === 'continue-hint')
            return !!s.activeHint;
        if (s.completed || this.blocked())
            return false;
        if (command === 'start')
            return s.intro;
        if (this.isWelcome || !s.playing || s.intro)
            return false;
        if (command === 'cancel')
            return s.target !== null;
        if (Object.values(s.machines).some(m => m.stage === 'processing') || s.target)
            return false;
        if (command === 'install')
            return s.location?.kind === 'table' && s.selected === s.item?.blankId;
        if (command === 'take')
            return s.location?.kind === 'warehouse' && s.selected === s.location.id && this.resources.warehouses[s.location.id].mode === 'intermediate' && s.warehouses[s.location.id].count > 0;
        if (command === 'process')
            return !!s.selected && s.location?.kind === 'machine' && s.location.id === s.selected && s.machines[s.selected].stage === 'loaded' && !this.machineCompatibility(this.resources.machines[s.selected]);
        if (command === 'store')
            return s.location?.kind === 'machine' && s.machines[s.location.id].stage === 'finished' && s.selected === s.item?.blankId && this.resources.machines[s.location.id].storeIds.some(id => s.warehouses[id].count < this.resources.warehouses[id].capacity);
        return false;
    }
    get targetIds(): string[] {
        const s = this.value;
        if (this.isWelcome)
            return [];
        if (s.target === 'warehouse' && s.location?.kind === 'machine')
            return this.resources.machines[s.location.id].storeIds.filter(id => s.warehouses[id].count < this.resources.warehouses[id].capacity);
        if (s.target === 'machine')
            return Object.values(this.resources.machines).filter(m => s.machines[m.id].stage === 'empty' && this.resolveSource(m.source) && !this.machineCompatibility(m) && (s.transfer === 'install' ? s.location?.kind === 'table' && m.source.kind === 'blank' : s.location?.kind === 'warehouse' && (m.source.kind === 'warehouse' && m.source.id === s.location.id || m.source.kind === 'wait' && this.resources.waits[m.source.id].warehouseId === s.location.id))).map(m => m.id);
        return [];
    }
    private machineCompatibility(m:MachineDefinition):string|null {
      if(!this.value.item)return 'Фактический предмет ещё не появился.';
      let item=structuredClone(this.value.item);
      for(const op of m.operations.slice(this.value.machines[m.id].operationIndex)){
        const tool=m.operationTools?.[op.id]??m.tool;const errors=operationCompatibility(item,m.kind,tool,[op]);if(errors.length)return errors.join('\n');
        item=applyOperation({...dimensions(item),id:item.blankId,name:'Предмет',material:item.material},item,op);
      }return null;
    }
    command(command: Command) { if (!this.can(command))
        return false; const s = this.value; if (command === 'continue-hint') {
        const h = s.activeHint!;
        s.activeHint = null;
        this.showNextHint();
        if (h.origin === 'scenario' && h.confirm && s.activeNodeId === h.id)
            this.advance();
        return true;
    } if (command === 'start') {
        s.intro = false;
        this.advance();
    } if (command === 'install' || command === 'take') {
        s.target = 'machine';
        s.transfer = command;
    } if (command === 'store')
        s.target = 'warehouse'; if (command === 'cancel') {
        s.target = null;
        s.transfer = null;
    } if (command === 'process') {
        const m = this.currentMachine, r = s.machines[m.id];
        r.stage = 'processing';
        r.elapsed = 0;
        this.emit({ type: 'processing-started', objectId: m.id, machineId: m.id, operationId: this.currentOperation.id,toolId:this.currentTool.id, itemId: s.item!.blankId, message: `Обработка: ${this.currentOperation.seconds} с` });
    } return true; }
    click(id: string) {
        const s = this.value;
        if (this.isWelcome || s.disposed || s.completed || !s.playing || s.intro || this.blocked() || Object.values(s.machines).some(m => m.stage === 'processing'))
            return false;
        if (s.target === 'machine') {
            const m = this.machine(id);
            if (!m || s.machines[id].stage !== 'empty')
                return false;
            const part = this.resolveSource(m.source);
            const from = s.location;
            const allowed = s.transfer === 'install' ? from?.kind === 'table' && m.source.kind === 'blank' && s.selected === part?.blankId : s.transfer === 'take' && from?.kind === 'warehouse' && s.selected === from.id && this.resources.warehouses[from.id].mode === 'intermediate' && (m.source.kind === 'warehouse' && m.source.id === from.id || m.source.kind === 'wait' && this.resources.waits[m.source.id].warehouseId === from.id);
            if (!part || !allowed)
                return false;
            const error = this.machineCompatibility(m);
            if (error) {
                s.error = error;
                return false;
            }
            // Commit the move atomically; source inventory is unchanged until this point.
            const warehouse = from!.kind === 'warehouse' ? from!.id : null;
            if (warehouse)
                s.warehouses[warehouse] = { itemId: null, count: 0 };
            s.location = { kind: 'machine', id };
            s.machines[id] = { stage: 'loaded', operationIndex: 0, elapsed: 0, itemId: part.blankId };
            s.selected = id;
            s.target = null;
            s.transfer = null;
            s.error = '';
            const run = this.runId;
            if (warehouse)
                this.emit({ type: 'item-retrieved', warehouseId: warehouse, machineId: id, objectId: warehouse, itemId: part.blankId, message: 'Предмет получен со склада и установлен в следующий станок' });
            if (run !== this.runId || this.value.disposed)
                return true;
            this.emit({ type: 'blank-installed', objectId: id, machineId: id, itemId: part.blankId, message: 'Заготовка установлена в станок' });
            return true;
        }
        if (s.target === 'warehouse') {
            const from = s.location;
            if (from?.kind !== 'machine' || s.selected !== s.item?.blankId || s.machines[from.id].stage !== 'finished')
                return false;
            const w = this.warehouse(id);
            if (!w || !this.resources.machines[from.id].storeIds.includes(id) || s.warehouses[id].count >= w.capacity)
                return false;
            s.machines[from.id].itemId = null;
            s.location = { kind: 'warehouse', id };
            s.warehouses[id] = { itemId: s.item!.blankId, count: 1 };
            s.lastMachineId = from.id;
            s.selected = id;
            s.target = null;
            this.emit({ type: 'part-stored', warehouseId: id, machineId: from.id, objectId: id, itemId: s.item!.blankId, part: s.item!, message: 'Готовая деталь поступила на склад' });
            return true;
        }
        if (id === s.item?.blankId && (s.location?.kind === 'table' || s.location?.kind === 'machine' && s.machines[s.location.id].stage === 'finished')) {
            s.selected = id;
            return true;
        }
        if (this.machine(id) || this.warehouse(id)) {
            s.selected = id;
            return true;
        }
        return false;
    }
    tick(delta: number) {
        const run = this.runId;
        const s = this.value;
        if (this.isWelcome || s.disposed || this.blocked() || !Number.isFinite(delta) || delta <= 0)
            return;
        for (const [id, r] of Object.entries(s.machines)) {
            if (r.stage !== 'processing')
                continue;
            const m = this.resources.machines[id], op = m.operations[r.operationIndex], duration = op.seconds * 1000;
            r.elapsed = Math.min(duration, r.elapsed + delta);
            if (r.elapsed === duration) {
                s.item = applyOperation({ ...dimensions(s.item!), id: s.item!.blankId, name: 'Исходная деталь', material: s.item!.material }, s.item, op);
                s.selected = id;
                s.lastMachineId = id;
                const index = r.operationIndex;
                if (index + 1 < m.operations.length) {
                    r.operationIndex++;
                    r.stage = 'loaded';
                    r.elapsed = 0;
                }
                else
                    r.stage = 'finished';
                this.emit({ type: 'processing-finished', objectId: id, machineId: id, itemId: s.item.blankId, operationId: op.id,toolId:(m.operationTools?.[op.id]??m.tool).id, part: s.item, message: `Операция ${index + 1} завершена: ${op.kind === 'turning' ? `Ø${op.diameter} × ${op.length} мм` : `снято ${op.depth} мм`}` });
                if (run !== this.runId || this.value.disposed)
                    return;
            }
        }
    }
    get hint() { const s = this.state; if (s.error)
        return s.error; if (s.activeHint)
        return s.activeHint.text; if (s.completed)
        return s.success; if (s.intro)
        return 'Прочитайте вступление и нажмите «Продолжить».'; if (s.target === 'machine')
        return 'Выберите совместимый станок на карте или отмените выбор цели.'; if (s.target === 'warehouse')
        return 'Выберите подходящий склад на карте или отмените выбор цели.'; if (this.isWelcome)
        return 'Следуйте тексту вступления.'; if (s.stage === 'stored')
        return this.currentWarehouse.mode === 'intermediate' ? 'Выберите промежуточный склад и нажмите «Взять заготовку».' : 'Деталь на складе не соответствует требованиям завершения.'; if (s.stage === 'table')
        return s.selected === s.item?.blankId ? 'Нажмите «Установить в станок».' : 'Выберите заготовку на столе.'; if (s.stage === 'loaded')
        return 'Выберите загруженный станок и обработайте очередную операцию.'; if (s.stage === 'processing')
        return 'Дождитесь завершения обработки.'; return s.selected === s.item?.blankId ? 'Нажмите «Отправить на склад».' : 'Выберите готовую деталь в станке.'; }
}
