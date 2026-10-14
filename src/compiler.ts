import { sourceNode, operations, sections, type Level, type LevelNode, type OperationSpec } from './level';
import { validateLevel } from './validation';
import { dimensions, type ConfigurationCheck, type Blank, type Requirements } from './manufacturing';
import { itemSource, type ItemSource } from './productionGraph';
export type Operation = OperationSpec;
export interface CompiledCheck extends ConfigurationCheck {
    blankSource?: ItemSource;
    detailSource?: ItemSource;
    resultRequirements?: Requirements;
}
interface Scenario {
    id: string;
    name: string;
    grid: Level['grid'];
    placements: Level['placements'];
    scenario: Pick<LevelNode, 'id' | 'type' | 'params'>[];
    entry: string;
    next: Record<string, Record<string, string>>;
    checks: Record<string, CompiledCheck>;
    hints: Record<string, HintDefinition>;
    eventHints: EventHint[];
}
export interface HintDefinition {
    id: string;
    title: string;
    text: string;
    display: 'panel' | 'modal';
    confirm: boolean;
    frequency: 'once' | 'each';
}
export interface EventHint {
    hintId: string;
    action: string;
    objectId: string;
}
export interface MachineDefinition {
    id: string;
    name: string;
    kind: 'lathe' | 'mill';
    source: ItemSource;
    tool: {
        id: string;
        name: string;
        category: string;
        kind: string;
    };
    operationTools?:Record<string,MachineDefinition['tool']>;
    operations: OperationSpec[];
    processId: string;
    storeIds: string[];
}
export interface WarehouseDefinition {
    id: string;
    name: string;
    capacity: number;
    mode: 'final' | 'intermediate';
}
export interface ProductionLevel extends Scenario {
    mode: 'production';
    resultMode?:'strict'|'geometry';
    blank: Blank;
    machines: Record<string, MachineDefinition>;
    warehouses: Record<string, WarehouseDefinition>;
    waits: Record<string, {
        requirements: Requirements;
        warehouseId: string;
        quantity: number;
        machineId: string;
    }>;
    // Initial configuration aliases keep consumers of the previous single-stage API readable.
    tool: MachineDefinition['tool'];
    machine: MachineDefinition;
    warehouse: WarehouseDefinition;
    operations: OperationSpec[];
    processId: string;
    partName: string;
}
export interface WelcomeLevel extends Scenario {
    mode: 'welcome';
}
export type ExecutableLevel = ProductionLevel | WelcomeLevel;
function requirement(n: LevelNode): Requirements { return { id: n.id, name: String(n.params.name), material: String(n.params.material), ...dimensions(n.params), sections: structuredClone(sections(n)) }; }
function configurationCheck(level: Level, node: LevelNode): CompiledCheck {
    const source = (port: string) => sourceNode(level, node, port);
    const p = node.params;
    const actual: ConfigurationCheck['actual'] = {}, expected: ConfigurationCheck['expected'] = {};
    const c: CompiledCheck = { actual, expected };
    if (p.checkMachine === true) {
        actual.machineKind = String(source('machine')!.params.kind);
        expected.machineKind = String(p.expectedMachine);
    }
    if (p.checkTool === true) {
        actual.toolKind = String(source('tool')!.params.kind);
        expected.toolKind = String(p.expectedTool);
    }
    if (p.checkBlank === true) {
        const n = source('blank')!;
        if (n.type === 'blank')
            actual.blank = { ...dimensions(n.params), material: String(n.params.material) };
        else
            c.blankSource = itemSource(n);
        expected.blank = { ...dimensions(p, 'expected'), material: String(p.expectedMaterial) };
    }
    if (p.checkProcess === true) {
        actual.operations = operations(source('process')!);
        expected.operations = operations(node, 'expectedOperations');
    }
    if (p.checkResult === true) {
        c.detailSource = itemSource(source('detail')!);
        c.resultRequirements = requirement(source('requirements')!);
    }
    return c;
}
export function compileLevel(level: Level): ExecutableLevel {
    if(level.productionMode==='player')throw new Error('Для плана игрока создайте PlanningCore; готовое производство ещё не выбрано.');
    const errors = validateLevel(level);
    if (errors.length)
        throw new Error(errors.map(e => e.message).join('\n'));
    const d = structuredClone(level);
    const one = (kind: string) => d.nodes.find(n => n.type === kind)!;
    const next: Scenario['next'] = Object.create(null);
    for (const n of d.nodes) {
        next[n.id] = Object.create(null);
        for (const e of d.edges.filter(e => e.source === n.id && ['out', 'correct', 'incorrect'].includes(e.sourceHandle)))
            next[n.id][e.sourceHandle] = e.target;
    }
    const hints = Object.fromEntries(d.nodes.filter(n => n.type === 'hint').map(n => [n.id, { id: n.id, title: String(n.params.title), text: String(n.params.text), display: n.params.display as 'panel' | 'modal', confirm: n.params.confirm === true, frequency: n.params.frequency as 'once' | 'each' }]));
    const eventHints = d.edges.filter(e => e.targetHandle === 'event' && d.nodes.find(n => n.id === e.target)?.type === 'hint').map(e => { const n = d.nodes.find(n => n.id === e.source)!; return { hintId: e.target, action: String(n.params.action), objectId: String(n.params.objectId) }; });
    const scenario = d.nodes.filter(n => ['start', 'intro', 'task', 'wait', 'check', 'finish', 'hint'].includes(n.type) && !(n.type === 'hint' && d.edges.some(e => e.target === n.id && e.targetHandle === 'event'))).map(n => ({ id: n.id, type: n.type, params: n.params }));
    const base: Scenario = { id: d.id, name: d.name, grid: d.grid, placements: d.placements, scenario, entry: one('start').id, next, checks: Object.fromEntries(d.nodes.filter(n => n.type === 'check').map(n => [n.id, configurationCheck(d, n)])), hints, eventHints };
    if (!d.nodes.some(n => n.type === 'task' || n.type === 'wait'))
        return { ...base, mode: 'welcome' };
    const waits: ProductionLevel['waits'] = Object.create(null);
    for (const w of d.nodes.filter(n => n.type === 'wait')) {
        const p = sourceNode(d, w, 'part')!;
        waits[w.id] = { requirements: requirement(p), warehouseId: sourceNode(d, w, 'warehouse')!.id, quantity: Number(w.params.quantity), machineId: sourceNode(d, p, 'machine')!.id };
    }
    const machines: ProductionLevel['machines'] = Object.create(null);
    for (const m of d.nodes.filter(n => n.type === 'lathe')) {
        const t = sourceNode(d, m, 'tool')!, p = sourceNode(d, m, 'process')!;
        machines[m.id] = { id: m.id, name: String(m.params.name), kind: m.params.kind as 'lathe' | 'mill', source: itemSource(sourceNode(d, m, 'blank')!), tool: { id: t.id, name: String(t.params.name), category: String(t.params.category), kind: String(t.params.kind) }, operations: operations(p), processId: p.id, storeIds: [...new Set(Object.values(waits).filter(w => w.machineId === m.id).map(w => w.warehouseId))] };
    }
    const warehouses = Object.fromEntries(d.nodes.filter(n => n.type === 'warehouse').map(n => [n.id, { id: n.id, name: String(n.params.name), capacity: Number(n.params.capacity), mode: n.params.mode as 'final' | 'intermediate' }]));
    const b = one('blank');
    const machine = Object.values(machines).find(m => m.source.kind === 'blank') ?? Object.values(machines)[0];
    const warehouse = warehouses[machine.storeIds[0]] ?? Object.values(warehouses)[0];
    return { ...base, mode: 'production', blank: { id: b.id, name: String(b.params.name), material: String(b.params.material), ...dimensions(b.params) }, machines, warehouses, waits, machine, warehouse, tool: machine.tool, operations: machine.operations, processId: machine.processId, partName: String(one('part').params.name) };
}
