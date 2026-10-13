import { sourceNode, operations, sections, type Level, type LevelNode, type OperationSpec } from './level';
import { validateLevel } from './validation';
import { dimensions, type ConfigurationCheck, type Blank, type Requirements } from './manufacturing';
export type Operation = OperationSpec;
interface Scenario {
    id: string;
    name: string;
    grid: Level['grid'];
    placements: Level['placements'];
    scenario: Pick<LevelNode,'id'|'type'|'params'>[];
    entry: string;
    next: Record<string, Record<string, string>>;
    checks: Record<string, ConfigurationCheck>;
}
export interface ProductionLevel extends Scenario {
    mode: 'production';
    blank: Blank;
    tool: {
        id: string;
        name: string;
        category: string;
        kind: string;
    };
    machine: {
        id: string;
        name: string;
        kind: 'lathe' | 'mill';
    };
    warehouse: {
        id: string;
        name: string;
        capacity: number;
    };
    operations: OperationSpec[];
    processId: string;
    waits: Record<string, {
        requirements: Requirements;
        warehouseId: string;
        quantity: number;
    }>;
    partName: string;
}
export interface WelcomeLevel extends Scenario {
    mode: 'welcome';
}
export type ExecutableLevel = ProductionLevel | WelcomeLevel;
function configurationCheck(level:Level,node:LevelNode):ConfigurationCheck {
    const source=(port:string)=>sourceNode(level,node,port);
    const p=node.params;
    const actual:ConfigurationCheck['actual']={};
    const expected:ConfigurationCheck['expected']={};
    if(p.checkMachine===true){actual.machineKind=String(source('machine')!.params.kind);expected.machineKind=String(p.expectedMachine);}
    if(p.checkTool===true){actual.toolKind=String(source('tool')!.params.kind);expected.toolKind=String(p.expectedTool);}
    if(p.checkBlank===true){const blank=source('blank')!;actual.blank={...dimensions(blank.params),material:String(blank.params.material)};expected.blank={...dimensions(p,'expected'),material:String(p.expectedMaterial)};}
    if(p.checkProcess===true){actual.operations=operations(source('process')!);expected.operations=operations(node,'expectedOperations');}
    return {actual,expected};
}
export function compileLevel(level: Level): ExecutableLevel {
    const errors = validateLevel(level);
    if (errors.length)
        throw new Error(errors.map(e => e.message).join('\n'));
    const d = structuredClone(level);
    const one = (kind: string) => d.nodes.find(n => n.type === kind)!;
    const next: Scenario['next'] = Object.create(null);
    for (const n of d.nodes) {
        next[n.id] = {};
        for (const e of d.edges.filter(e => e.source === n.id && ['out', 'correct', 'incorrect'].includes(e.sourceHandle)))
            next[n.id][e.sourceHandle] = e.target;
    }
    const scenario = d.nodes.filter(n => ['start', 'intro', 'task', 'wait', 'check', 'finish'].includes(n.type)).map(n=>({id:n.id,type:n.type,params:n.params}));
    const base: Scenario = { id: d.id, name: d.name, grid: d.grid, placements: d.placements, scenario, entry: one('start').id, next, checks: Object.fromEntries(d.nodes.filter(n => n.type === 'check').map(n => [n.id, configurationCheck(d, n)])) };
    if (!d.nodes.some(n => n.type === 'task' || n.type === 'wait'))
        return { ...base, mode: 'welcome' };
    const machine = one('lathe'), blank = sourceNode(d, machine, 'blank')!, tool = sourceNode(d, machine, 'tool')!, process = sourceNode(d, machine, 'process')!, warehouse = one('warehouse');
    const waits: ProductionLevel['waits'] = Object.create(null);
    for (const w of d.nodes.filter(n => n.type === 'wait')) {
        const part = sourceNode(d, w, 'part')!;
        waits[w.id] = { warehouseId: sourceNode(d, w, 'warehouse')!.id, quantity: Number(w.params.quantity), requirements: { id: part.id, name: String(part.params.name), material: String(part.params.material), ...dimensions(part.params), sections: structuredClone(sections(part)) } };
    }
    return { ...base, mode: 'production', blank: { id: blank.id, name: String(blank.params.name), material: String(blank.params.material), ...dimensions(blank.params) }, tool: { id: tool.id, name: String(tool.params.name), category: String(tool.params.category), kind: String(tool.params.kind) }, machine: { id: machine.id, name: String(machine.params.name), kind: machine.params.kind as 'lathe' | 'mill' }, warehouse: { id: warehouse.id, name: String(warehouse.params.name), capacity: Number(warehouse.params.capacity) }, operations: operations(process), processId: process.id, waits, partName: String(one('part').params.name) };
}
