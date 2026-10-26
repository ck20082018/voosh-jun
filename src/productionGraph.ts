import {blankPart} from './manufacturing';
import {findTurningTool} from './turningTools';
import { sourceNode, operations, type Level, type LevelNode, type OperationSpec } from './level';
import { dimensions, applyOperation, near, type Blank, type Part } from './manufacturing';
export type ItemSource = {
    kind: 'blank' | 'warehouse' | 'wait';
    id: string;
};
export function itemSource(node: LevelNode): ItemSource {
    if (node.type === 'blank')
        return { kind: 'blank', id: node.id };
    if (node.type === 'warehouse' && node.params.mode === 'intermediate')
        return { kind: 'warehouse', id: node.id };
    if (node.type === 'wait')
        return { kind: 'wait', id: node.id };
    throw new Error('Исходный предмет: подключите заготовку, промежуточный склад или фактическую деталь ожидания.');
}
export function requirementsMachine(level: Level, wait: LevelNode) { return sourceNode(level, sourceNode(level, wait, 'part'), 'machine'); }
export function warehouseProducer(level: Level, id: string): LevelNode {
    const machines = level.nodes.filter(n => n.type === 'wait' && sourceNode(level, n, 'warehouse')?.id === id).map(w => requirementsMachine(level, w)).filter((m): m is LevelNode => !!m);
    const ids = new Set(machines.map(m => m.id));
    if (ids.size !== 1)
        throw new Error('Промежуточный склад должен иметь одного определённого производящего станка через ожидание.');
    return machines[0];
}
export function incomingPart(level: Level, machine: LevelNode, stack = new Set<string>()): Part {
    const node = sourceNode(level, machine, 'blank');
    if (!node)
        throw new Error('Не подключена исходная заготовка станка.');
    if (node.type === 'blank')
        return blankPart({...dimensions(node.params),id:node.id,name:String(node.params.name),material:String(node.params.material),...(node.params.initialBoreDiameter!==undefined?{initialBoreDiameter:Number(node.params.initialBoreDiameter)}:{})});
    const source = itemSource(node);
    const producer = source.kind === 'wait' ? requirementsMachine(level, node) : warehouseProducer(level, node.id);
    if (!producer)
        throw new Error('Источник детали не связан с производящим станком.');
    return producedPart(level, producer, stack);
}
export function operationCompatibility(part: Part, kind: string, tool: {
    category: string;
    kind: string;
}, ops: readonly OperationSpec[]): string[] {
    const errors: string[] = [];
    if(ops.some(o=>o.kind==='turning'&&o.surfacePass)){
      let current=structuredClone(part);
      for(const op of ops){
        if(op.kind!=='turning'||!op.surfacePass||kind!=='lathe'||tool.category!=='turning'||tool.kind!==(op.surfacePass.toolId?findTurningTool(op.surfacePass.toolId)?.kind:op.surfacePass.target.kind==='face'?'facing':'passing')&&ops.length===1)return ['Несовместимый инструмент или станок для поверхностной операции.'];
        if(op.surfacePass.load>100)return ['Перегрузка: уменьшите режимы до запуска.'];
        try{current=applyOperation({...dimensions(current),id:current.blankId,name:'Деталь',material:current.material},current,op);}catch(e){return [(e as Error).message];}
      }return [];
    }
    if (kind === 'lathe') {
        if (part.shape !== 'cylinder' || tool.category !== 'turning' || tool.kind !== 'passing' || ops.some(o => o.kind !== 'turning'))
            return ['Токарный станок поддерживает цилиндр, проходной резец и продольное точение.'];
        const used = part.sections.reduce((s, o) => s + o.length, 0);
        let total = used;
        for (const op of ops)
            if (op.kind === 'turning') {
                total += op.length;
                if (op.diameter >= part.diameter || near(op.diameter, part.diameter))
                    errors.push('Конечный диаметр должен быть меньше диаметра необработанного участка фактической заготовки.');
            }
        if (total > part.length + 1e-6)
            errors.push('Суммарная длина участков операций превышает оставшуюся длину заготовки. Повторная обработка участка не поддерживается.');
    }
    else if (kind === 'mill') {
        if (part.shape !== 'block' || tool.category !== 'milling' || !['end', 'face'].includes(tool.kind) || ops.some(o => o.kind !== 'milling'))
            return ['Фрезерный станок поддерживает брусок, концевую/торцевую фрезу и снятие верхней плоскости.'];
        const depth = ops.reduce((s, o) => s + (o.kind === 'milling' ? o.depth : 0), 0);
        if (depth >= part.height)
            errors.push('Суммарная глубина снятия должна оставлять положительную фактическую высоту бруска.');
    }
    else
        errors.push('Неизвестный тип станка.');
    return errors;
}
export function producedPart(level: Level, machine: LevelNode, stack = new Set<string>()): Part {
    if (stack.has(machine.id))
        throw new Error('Циклы технической зависимости станков и складов не поддерживаются.');
    const next = new Set(stack);
    next.add(machine.id);
    let part = incomingPart(level, machine, next);
    const tool = sourceNode(level, machine, 'tool'), process = sourceNode(level, machine, 'process');
    if (!tool || !process)
        throw new Error('Подключите инструмент и техпроцесс к станку.');
    const ops = operations(process);
    const errors = operationCompatibility(part, String(machine.params.kind), { category: String(tool.params.category), kind: String(tool.params.kind) }, ops);
    if (errors.length)
        throw new Error(errors.join('\n'));
    const blank: Blank = { ...dimensions(part), id: part.blankId, name: 'Исходная деталь', material: part.material };
    for (const op of ops)
        part = applyOperation(blank, part, op);
    return part;
}
