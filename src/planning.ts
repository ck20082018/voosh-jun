import {checkTrainingPlan,type TurningLesson} from './turningTraining';
import { makeNode, defaultOperation, catalogIds, type Level, type OperationSpec } from './level';
import { catalogReferences, allowedOperations } from './catalog';
import { validateLevel, operationErrors } from './validation';
import { compileLevel, type MachineDefinition } from './compiler';
import { FactoryCore } from './core';
import { applyOperation, dimensions, dimensionText, matchesFreeResult, type Part, type Requirements } from './manufacturing';
import { operationCompatibility } from './productionGraph';
export type PlayerOperation = (Omit<Extract<OperationSpec, {
    kind: 'turning';
}>, 'seconds'> & {
    toolId: string | null;
}) | (Omit<Extract<OperationSpec, {
    kind: 'milling';
}>, 'seconds'> & {
    toolId: string | null;
});
export interface PlayerPlan {
    blankId: string | null;
    machineId: string | null;
    pointId: string | null;
    operations: PlayerOperation[];
}
export interface PlanPreview {
    errors: string[];
    warnings: string[];
    part: Part | null;
    operations: OperationSpec[];
    tools: Record<string, MachineDefinition['tool']>;
}
export function blankPlan(): PlayerPlan { return { blankId: null, machineId: null, pointId: null, operations: [] }; }
export function checkPlayerPlan(level: Level, plan: PlayerPlan): PlanPreview {
    const errors: string[] = [], warnings: string[] = [];
    const catalog = level.nodes.find(n => n.type === 'catalog')!;
    const variant = (key: 'blankIds' | 'machineIds', id: string | null) => id && catalogReferences(catalog, key).includes(id) ? level.nodes.find(n => n.id === id) : undefined;
    const blank = variant('blankIds', plan.blankId), machine = variant('machineIds', plan.machineId);
    if (!blank)
        errors.push('Выберите заготовку из каталога.');
    if (!machine)
        errors.push('Выберите станок из каталога.');
    const point = level.grid.points.find(p => p.id === plan.pointId);
    if (!point || level.placements.some(p => p.pointId === point.id))
        errors.push('Разместите станок на разрешённой свободной точке.');
    if (plan.operations.length < 1 || plan.operations.length > 20)
        errors.push('Добавьте от 1 до 20 операций.');
    const ids = new Set<string>();
    const operations: OperationSpec[] = [], tools: PlanPreview['tools'] = Object.create(null);
    let part: Part | null = blank ? { ...dimensions(blank.params), blankId: blank.id, material: String(blank.params.material), sections: [], operationIds: [] } : null;
    for (const [index, op] of plan.operations.entries()) {
        const prefix = `Операция ${index + 1}: `;
        const rule = allowedOperations(catalog).find(r => r.kind === op.kind);
        if (!rule) {
            errors.push(prefix + 'этот тип операции не разрешён автором.');
            continue;
        }
        if (!op.id || ids.has(op.id))
            errors.push(prefix + 'ID должен быть уникальным.');
        ids.add(op.id);
        const spec: OperationSpec = op.kind === 'turning' ? { id: op.id, kind: op.kind, diameter: op.diameter, length: op.length, seconds: rule.seconds } : { id: op.id, kind: op.kind, depth: op.depth, seconds: rule.seconds };
        const numerical = operationErrors([spec]);
        errors.push(...numerical.map(e => prefix + e));
        const tool = op.toolId && catalogReferences(catalog, 'toolIds').includes(op.toolId) ? level.nodes.find(n => n.id === op.toolId) : undefined;
        if (!tool) {
            errors.push(prefix + 'выберите инструмент из каталога.');
            continue;
        }
        const description: MachineDefinition['tool'] = { id: tool.id, name: String(tool.params.name), category: String(tool.params.category), kind: String(tool.params.kind) };
        tools[op.id] = description;
        operations.push(spec);
        if (!part || !machine || numerical.length)
            continue;
        if (op.kind === 'turning' && machine.params.kind !== 'lathe') {
            errors.push(prefix + 'для этой операции нужен токарный станок.');
            continue;
        }
        if (op.kind === 'milling' && machine.params.kind !== 'mill') {
            errors.push(prefix + 'для этой операции нужен фрезерный станок.');
            continue;
        }
        const incompatible = operationCompatibility(part, String(machine.params.kind), description, [spec]);
        if (incompatible.length) {
            errors.push(...incompatible.map(e => prefix + e));
            continue;
        }
        part = applyOperation({ ...dimensions(part), id: part.blankId, name: String(blank!.params.name), material: part.material }, part, spec);
    }
    if (plan.operations.some(o => o.kind === 'turning'))
        warnings.push('Точение добавляет отдельные участки по порядку, а не повторно обрабатывает прежний участок.');
    return { errors, warnings, part: errors.length ? null : part, operations, tools };
}
export function planScene(level: Level, plan: PlayerPlan): Level {
    const scene = structuredClone(level);
    const ids = catalogIds(level);
    scene.nodes = scene.nodes.filter(n => !ids.has(n.id) && n.type !== 'catalog');
    scene.groups = [];
    scene.nodes = scene.nodes.map(({ groupId: _group, ...node }) => node);
    const blank = level.nodes.find(n => n.id === plan.blankId && ids.has(n.id));
    const table = scene.nodes.find(n => n.type === 'table');
    if (blank && table) {
        table.type = 'blank';
        table.params = { ...blank.params, name: String(level.nodes.find(n => n.type === 'table')!.params.name) };
    }
    const machine = level.nodes.find(n => n.id === plan.machineId && ids.has(n.id));
    if (machine && plan.pointId) {
        scene.nodes.push({ ...structuredClone(machine), id: 'planning-machine', groupId: undefined });
        scene.placements.push({ nodeId: 'planning-machine', pointId: plan.pointId });
    }
    return scene;
}
function materialize(level: Level, plan: PlayerPlan, preview: PlanPreview, attempt: number): {
    level: Level;
    blankId: string;
    machineId: string;
} {
    const out = structuredClone(level);
    const ids = catalogIds(level);
    const table = level.nodes.find(n => n.type === 'table')!;
    const selectedBlank = level.nodes.find(n => n.id === plan.blankId)!, selectedMachine = level.nodes.find(n => n.id === plan.machineId)!;
    const used = new Set(level.nodes.map(n => n.id));
    const fresh = (base: string) => { let id = base; let suffix = 0; while (used.has(id))
        id = `${base}-${++suffix}`; used.add(id); return id; };
    const blankId = fresh(`attempt-${attempt}-blank`), machineId = fresh(`attempt-${attempt}-machine`), processId = fresh(`attempt-${attempt}-process`);
    const remove = new Set([...ids, ...level.nodes.filter(n => n.type === 'catalog' || n.type === 'table').map(n => n.id)]);
    for (const after of level.nodes.filter(n => n.type === 'after')) {
        const id = String(after.params.objectId ?? '');
        if (ids.has(id) && ![plan.blankId, plan.machineId, ...plan.operations.map(o => o.toolId)].includes(id)) {
            remove.add(after.id);
            for (const e of level.edges.filter(e => e.source === after.id && e.sourceHandle === 'event'))
                remove.add(e.target);
        }
    }
    out.nodes = out.nodes.filter(n => !remove.has(n.id));
    out.edges = out.edges.filter(e => !remove.has(e.source) && !remove.has(e.target) && e.targetHandle !== 'catalog');
    out.placements = out.placements.filter(p => p.nodeId !== table.id);
    out.groups = [];
    out.productionMode = 'ready';
    const raw = { ...structuredClone(selectedBlank), id: blankId };
    const station = { ...structuredClone(selectedMachine), id: machineId };
    const process = makeNode('process', processId);
    process.params.operations = structuredClone(preview.operations);
    const firstTool = Object.values(preview.tools)[0];
    const toolId = fresh(`attempt-${attempt}-tool`);
    const tool = makeNode('tool', toolId);
    Object.assign(tool.params, { name: firstTool.name, category: firstTool.category, kind: firstTool.kind });
    out.nodes.push(raw, station, process, tool);
    out.nodes = out.nodes.map(({ groupId: _group, ...n }) => n);
    out.placements.push({ nodeId: blankId, pointId: level.placements.find(p => p.nodeId === table.id)!.pointId }, { nodeId: machineId, pointId: plan.pointId! });
    const part = out.nodes.find(n => n.type === 'part')!;
    for (const [s, sh, t, th] of [[blankId, 'blank', machineId, 'blank'], [toolId, 'tool', machineId, 'tool'], [processId, 'process', machineId, 'process'], [machineId, 'machine', part.id, 'machine']])
        out.edges.push({ id: `runtime-${s}-${sh}-${t}-${th}`, source: s, sourceHandle: sh, target: t, targetHandle: th });
    for (const n of out.nodes.filter(n => n.type === 'after')) {
        if (n.params.objectId === plan.blankId)
            n.params.objectId = blankId;
        if (n.params.objectId === plan.machineId)
            n.params.objectId = machineId;
    }
    return { level: out, blankId, machineId };
}
export interface Assessment {
    success: boolean;
    expected: Requirements;
    actual: Part;
    differences: {
        characteristic: string;
        expected: string;
        actual: string;
    }[];
}
export class PlanningCore {
    private readonly author: Level;
    private draft = blankPlan();
    private frozen: PlayerPlan | null = null;
    private engine: FactoryCore | null = null;
    private scene: Level | null = null;
    private attempt = 0;
    private disposed = false;
    constructor(level: Level, readonly training?:TurningLesson) { const issues = validateLevel(level); if (level.productionMode !== 'player' || issues.length)
        throw new Error(issues.map(e => e.message).join('\n') || 'Требуется режим «План игрока».'); this.author = structuredClone(level); }
    get definition(): Level { return structuredClone(this.author); }
    get plan(): PlayerPlan { return structuredClone(this.draft); }
    get fixedPlan(): PlayerPlan | null { return structuredClone(this.frozen); }
    get runtime(): FactoryCore | null { return this.engine; }
    get runtimeLevel(): Level | null { return this.scene ? structuredClone(this.scene) : null; }
    get editing() { return !this.disposed && !this.engine; }
    get preview(): PlanPreview { return this.training?checkTrainingPlan(this.author,this.draft,this.training):checkPlayerPlan(this.author, this.draft); }
    get mapScene(): Level { return planScene(this.author, this.draft); }
    setPlan(plan: PlayerPlan): boolean {
        if (!this.editing || !plan || !Array.isArray(plan.operations) || plan.operations.length > 20)
            return false;
        const c = this.author.nodes.find(n => n.type === 'catalog')!;
        for (const [key, id] of [['blankIds', plan.blankId], ['machineIds', plan.machineId]] as const)
            if (id !== null && !catalogReferences(c, key).includes(id))
                return false;
        if (plan.pointId !== null && (!this.author.grid.points.some(p => p.id === plan.pointId) || this.author.placements.some(p => p.pointId === plan.pointId)))
            return false;
        if (plan.operations.some(o => !o || !allowedOperations(c).some(r => r.kind === o.kind) || o.toolId !== null && !catalogReferences(c, 'toolIds').includes(o.toolId) || typeof o.id !== 'string' || !o.id || o.kind === 'turning' && (!Number.isFinite(o.diameter) || !Number.isFinite(o.length)) || o.kind === 'milling' && !Number.isFinite(o.depth)) || new Set(plan.operations.map(o => o.id)).size !== plan.operations.length)
            return false;
        this.draft = structuredClone(plan);
        return true;
    }
    chooseBlank(id: string) { return this.setPlan({ ...this.plan, blankId: id }); }
    chooseMachine(id: string) { return this.setPlan({ ...this.plan, machineId: id }); }
    placeMachine(pointId: string) { return this.setPlan({ ...this.plan, pointId }); }
    addOperation(kind: OperationSpec['kind']) { const { seconds: _seconds, ...op } = defaultOperation(kind); return this.setPlan({ ...this.plan, operations: [...this.plan.operations, { ...op, toolId: null }] }); }
    startManufacturing(): boolean {
        if (!this.editing)
            return false;
        const preview = this.preview;
        if (preview.errors.length)
            return false;
        if(this.training&&checkTrainingPlan(this.author,this.draft,this.training).maxLoad>100)return false;
        const plan = this.plan, materialized = materialize(this.author, plan, preview, ++this.attempt);
        const compiled = compileLevel(materialized.level);
        if (compiled.mode !== 'production')
            return false;
        compiled.resultMode = 'geometry';
        if(this.training)for(const wait of Object.values(compiled.waits)){
          wait.requirements.geometry=structuredClone(this.training.requirements);
          wait.requirements.minQuality=this.training.minQuality;
          wait.requirements.maxLastCutDepth=this.training.minQuality? .25:undefined;
        }
        const m = compiled.machines[materialized.machineId];
        m.operationTools = structuredClone(preview.tools);
        const runtime = new FactoryCore(compiled);
        this.frozen = structuredClone(plan);
        this.scene = materialized.level;
        this.engine = runtime;
        return true;
    }
    get assessment(): Assessment | null {
        if (!this.engine || this.engine.state.stage !== 'stored' || !this.engine.state.item)
            return null;
        const expected = Object.values(this.engine.resources.waits)[0].requirements, actual = this.engine.state.item;
        const success = matchesFreeResult(actual, expected);
        const differences: Assessment['differences'] = [];
        if (actual.material !== expected.material)
            differences.push({ characteristic: 'Материал', expected: expected.material, actual: actual.material });
        if (actual.shape !== expected.shape)
            differences.push({ characteristic: 'Форма', expected: expected.shape === 'cylinder' ? 'Цилиндр' : 'Брусок', actual: actual.shape === 'cylinder' ? 'Цилиндр' : 'Брусок' });
        if(expected.minQuality!==undefined&&(actual.surfaceQuality??0)<expected.minQuality)
            differences.push({characteristic:'Качество последнего реального прохода',expected:`не ниже ${expected.minQuality}/100`,actual:`${(actual.surfaceQuality??0).toFixed(0)}/100`});
        if(expected.maxLastCutDepth!==undefined&&(actual.lastCutDepth??Infinity)>expected.maxLastCutDepth)
            differences.push({characteristic:'Снятие чистовым проходом по радиусу',expected:`не более ${expected.maxLastCutDepth} мм`,actual:`${actual.lastCutDepth??'не было резания'} мм`});
        if (!matchesFreeResult({ ...actual, material: expected.material }, {...expected,minQuality:undefined,maxLastCutDepth:undefined}))
            differences.push({ characteristic: 'Размеры и участки', expected: dimensionText(expected) + '; ' + expected.sections.map(s => `Ø${s.diameter} × ${s.length}`).join(', '), actual: dimensionText(actual) + '; ' + actual.sections.map(s => `Ø${s.diameter} × ${s.length}`).join(', ') });
        return { success, expected: structuredClone(expected), actual: structuredClone(actual), differences };
    }
    retry(): boolean { if (this.disposed || !this.engine || this.engine.state.stage !== 'stored')
        return false; this.engine.dispose(); this.engine = null; this.scene = null; this.frozen = null; return true; }
    reset() { if (this.disposed)
        return; this.engine?.dispose(); this.engine = null; this.scene = null; this.frozen = null; this.draft = blankPlan(); }
    dispose() { this.disposed = true; this.engine?.dispose(); }
}
