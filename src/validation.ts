import { registry, portPair, sourceNode, operations, sections, TOOLS, type Level, type LevelNode, type Params, type OperationSpec } from './level';
import { validateImageData, MAX_TOTAL_IMAGE_BYTES } from './imageData';
export interface Issue {
    nodeId?: string;
    message: string;
}
const positive = (p: Params, key: string) => typeof p[key] === 'number' && Number.isFinite(p[key]) && Number(p[key]) > 0;
export function operationErrors(ops: unknown): string[] {
    if (!Array.isArray(ops) || !ops.length || ops.length > 20)
        return ['Техпроцесс должен содержать от 1 до 20 операций.'];
    const ids = new Set<string>();
    const errors: string[] = [];
    for (const value of ops) {
        const o = value as OperationSpec;
        if (!o || typeof o !== 'object') {
            errors.push('Некорректная операция.');
            continue;
        }
        if (typeof o.id !== 'string' || !o.id || ids.has(o.id))
            errors.push('Операции требуют уникальные стабильные ID.');
        ids.add(o.id);
        if (typeof o.seconds !== 'number' || !Number.isFinite(o.seconds * 1000) || o.seconds <= 0)
            errors.push('Время операции: требуется положительное число.');
        if (o.kind === 'turning') {
            if (!positive(o as unknown as Params, 'diameter') || !positive(o as unknown as Params, 'length'))
                errors.push('Размеры участка: требуется положительное число.');
        }
        else if (o.kind === 'milling') {
            if (!positive(o as unknown as Params, 'depth'))
                errors.push('Глубина снятия: требуется положительное число.');
        }
        else
            errors.push('Поддерживаются только продольное точение и фрезерование верхней плоскости.');
    }
    return errors;
}
export function validateLevel(level: Level): Issue[] {
    const issues: Issue[] = [];
    const add = (message: string, nodeId?: string) => issues.push({ message, nodeId });
    if (level.version !== 2)
        add('Требуется формат v2 после миграции.');
    if (!level.name.trim())
        add('Укажите название уровня.');
    const ids = new Set<string>();
    let imageBytes = 0;
    for (const node of level.nodes) {
        if (ids.has(node.id))
            add('Идентификатор ноды повторяется.', node.id);
        ids.add(node.id);
        const def = registry[node.type];
        if (!def) {
            add('Неизвестный тип ноды.', node.id);
            continue;
        }
        for (const p of def.parameters) {
            if (p.when && !p.when(node.params))
                continue;
            // Configuration requirements not enabled are editor defaults, not production constraints.
            if (node.type === 'check' && p.key.startsWith('expected') && (p.key === 'expectedMaterial' || p.key === 'expectedShape') && node.params.checkBlank !== true)
                continue;
            const v = node.params[p.key];
            if (p.type === 'number') {
                if (!positive(node.params, p.key))
                    add(`${p.label}: требуется положительное число.`, node.id);
            }
            else if (p.type === 'boolean') {
                if (typeof v !== 'boolean')
                    add(`${p.label}: требуется флаг.`, node.id);
            }
            else if (typeof v !== 'string' || (!p.optional && !v.trim()))
                add(`${p.label}: заполните текст.`, node.id);
            else if (p.type === 'select' && !((node.type === 'tool' && p.key === 'kind' ? TOOLS[node.params.category as keyof typeof TOOLS] : p.options) ?? []).some(o => o.value === v))
                add(`${p.label}: неизвестное значение.`, node.id);
        }
        if (node.type === 'intro' && node.params.image) {
            try {
                imageBytes += validateImageData(String(node.params.image)).bytes;
            }
            catch (e) {
                add((e as Error).message, node.id);
            }
        }
        if (node.type === 'process')
            for (const m of operationErrors(node.params.operations))
                add(m, node.id);
        if (node.type === 'check' && node.params.checkProcess === true)
            for (const m of operationErrors(node.params.expectedOperations))
                add(`Требования проверки: ${m}`, node.id);
        if (node.type === 'warehouse' && !Number.isInteger(node.params.capacity))
            add('Вместимость должна быть целым числом.', node.id);
        if (node.type === 'wait' && node.params.quantity !== 1)
            add('На первом этапе требуемое количество — 1.', node.id);
        if (node.type === 'part') {
            if (!Array.isArray(node.params.sections))
                add('Укажите список требуемых участков.', node.id);
            for (const s of sections(node))
                if (!s || !positive(s as unknown as Params, 'diameter') || !positive(s as unknown as Params, 'length'))
                    add('Участки детали: положительные диаметр и длина.', node.id);
            if (node.params.shape === 'block' && sections(node).length)
                add('Брусок не имеет цилиндрических участков.', node.id);
            if (node.params.shape === 'cylinder' && sections(node).reduce((sum, s) => sum + Number(s?.length), 0) > Number(node.params.length) + 1e-6)
                add('Суммарная длина требуемых участков превышает длину детали.', node.id);
        }
    }
    if (imageBytes > MAX_TOTAL_IMAGE_BYTES)
        add('Суммарный размер изображений превышает 1 МиБ.');
    const one = (kind: string) => level.nodes.find(n => n.type === kind);
    const count = (kind: string) => level.nodes.filter(n => n.type === kind).length;
    if (count('start') !== 1)
        add('Требуется ровно одна нода «Начало уровня».');
    if (!count('finish'))
        add('Требуется завершение уровня.');
    const production = count('task') > 0 || count('wait') > 0;
    for (const kind of ['blank', 'tool', 'process', 'lathe', 'warehouse', 'part'])
        if (production ? count(kind) !== 1 : count(kind) > 1)
            add(`На первом этапе ${production ? 'требуется ровно один' : 'разрешён не более чем один'} объект «${registry[kind as keyof typeof registry].title}».`);
    if (production && (!count('task') || !count('wait')))
        add('Производственный сценарий требует задание и ожидание детали.');
    const edgeIds = new Set<string>(), incoming = new Map<string, number>(), outgoing = new Map<string, number>();
    for (const e of level.edges) {
        if (edgeIds.has(e.id))
            add('Идентификатор связи повторяется.', e.target);
        edgeIds.add(e.id);
        const pair = portPair(level, e);
        if (!pair) {
            add('Связь ссылается на отсутствующую ноду или порт.', e.target);
            continue;
        }
        if (pair.input.type !== pair.output.type)
            add('Несовместимые порты данных/выполнения.', e.target);
        const key = `${e.target}:${e.targetHandle}`;
        incoming.set(key, (incoming.get(key) ?? 0) + 1);
        if ((incoming.get(key) ?? 0) > 1 && !pair.input.multiple)
            add('В один вход нельзя подключить несколько связей.', e.target);
        if (pair.output.type === 'execution') {
            const key = `${e.source}:${e.sourceHandle}`;
            outgoing.set(key, (outgoing.get(key) ?? 0) + 1);
            if ((outgoing.get(key) ?? 0) > 1)
                add('Параллельные ветви выполнения не поддерживаются.', e.source);
        }
    }
    for (const n of level.nodes) {
        const def = registry[n.type];
        if (!def)
            continue;
        for (const p of def.inputs) {
            const checkRequired = n.type === 'check' && n.params[`check${p.id[0].toUpperCase()}${p.id.slice(1)}`] === true;
            if ((p.required || checkRequired) && !incoming.has(`${n.id}:${p.id}`))
                add(`Не подключён вход «${p.label}».`, n.id);
        }
        for (const p of def.outputs.filter(p => p.type === 'execution'))
            if (!outgoing.has(`${n.id}:${p.id}`))
                add(`Не подключён выход выполнения «${p.label}».`, n.id);
    }
    const visited = new Set<string>(), stack = new Set<string>();
    function visit(id: string) { if (stack.has(id)) {
        add('Циклы не поддерживаются.', id);
        return;
    } if (visited.has(id))
        return; visited.add(id); stack.add(id); for (const e of level.edges.filter(e => e.source === id))
        if (ids.has(e.target))
            visit(e.target); stack.delete(id); }
    for (const n of level.nodes)
        visit(n.id);
    // Check every execution path: merges are allowed only as alternatives, never concurrent execution.
    const reachable = new Set<string>();
    const pathStack = new Set<string>();
    const memo = new Set<string>();
    function scenario(id: string, hasTask: boolean, hasWait: boolean) {
        const n = level.nodes.find(n => n.id === id);
        if (!n || pathStack.has(id))
            return;
        reachable.add(id);
        const key = `${id}:${hasTask}:${hasWait}`;
        if (memo.has(key))
            return;
        memo.add(key);
        pathStack.add(id);
        if (n.type === 'wait' && !hasTask)
            add('Ожидание требует ранее активированного задания на каждом пути.', id);
        if (n.type === 'task') {
            if (hasTask)
                add('Повторный производственный этап на одном пути не поддерживается.', id);
            hasTask = true;
        }
        if (n.type === 'wait')
            hasWait = true;
        if (n.type === 'finish' && hasTask && !hasWait)
            add('Производственный путь должен пройти ожидание перед завершением.', id);
        const next = level.edges.filter(e => e.source === id && portPair(level, e)?.output.type === 'execution');
        if (n.type !== 'finish' && !next.length)
            add('Путь сценария должен достигать завершения.', id);
        for (const e of next)
            scenario(e.target, hasTask, hasWait);
        pathStack.delete(id);
    }
    if (one('start'))
        scenario(one('start')!.id, false, false);
    for (const n of level.nodes.filter(n => registry[n.type]?.inputs.some(p => p.type === 'execution') || n.type === 'start'))
        if (!reachable.has(n.id))
            add('Нода сценария не достижима от начала уровня.', n.id);
    for (const m of level.nodes.filter(n => n.type === 'lathe')) {
        const b = sourceNode(level, m, 'blank'), t = sourceNode(level, m, 'tool'), p = sourceNode(level, m, 'process');
        if (!b || !p)
            continue;
        const ops = operations(p);
        if (m.params.kind === 'lathe') {
            if (b.params.shape !== 'cylinder' || t?.params.category !== 'turning' || t?.params.kind !== 'passing' || ops.some(o => o.kind !== 'turning'))
                add('Токарный станок поддерживает цилиндр, проходной резец и продольное точение.', m.id);
            let total = 0;
            for (const o of ops)
                if (o.kind === 'turning') {
                    total += o.length;
                    if (o.diameter >= Number(b.params.diameter))
                        add('Конечный диаметр должен быть меньше диаметра заготовки.', p.id);
                }
            if (total > Number(b.params.length) + 1e-6)
                add('Суммарная длина участков операций превышает длину заготовки.', p.id);
        }
        else if (m.params.kind === 'mill') {
            if (b.params.shape !== 'block' || t?.params.category !== 'milling' || !['end', 'face'].includes(String(t?.params.kind)) || ops.some(o => o.kind !== 'milling'))
                add('Фрезерный станок поддерживает брусок, концевую/торцевую фрезу и снятие верхней плоскости.', m.id);
            const depth = ops.reduce((sum, o) => sum + (o.kind === 'milling' ? o.depth : 0), 0);
            if (depth >= Number(b.params.height))
                add('Суммарная глубина снятия должна оставлять положительную высоту бруска.', p.id);
        }
    }
    for (const w of level.nodes.filter(n => n.type === 'wait'))
        if (sourceNode(level, sourceNode(level, w, 'part'), 'machine')?.id !== one('lathe')?.id)
            add('Полученная деталь должна ссылаться на единственный станок уровня.', w.id);
    // Node position/size belong to editor storage; production validation deliberately ignores them.
    const { width, height } = level.grid;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8 || height > 8)
        add('Размер сетки: целые числа от 1 до 8.');
    const occupied = new Set<string>(), placed = new Set<string>();
    for (const p of level.placements) {
        const n = level.nodes.find(n => n.id === p.nodeId);
        if (!n || !['blank', 'lathe', 'warehouse'].includes(n.type))
            add('Размещение ссылается на отсутствующий или неподходящий объект.', p.nodeId);
        if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= width || p.y >= height)
            add('Объект находится за границами карты.', p.nodeId);
        const key = `${p.x},${p.y}`;
        if (occupied.has(key))
            add('На клетке уже находится другой объект.', p.nodeId);
        occupied.add(key);
        if (placed.has(p.nodeId))
            add('Объект размещён несколько раз.', p.nodeId);
        placed.add(p.nodeId);
    }
    for (const n of level.nodes.filter(n => ['blank', 'lathe', 'warehouse'].includes(n.type)))
        if (!placed.has(n.id))
            add('Разместите объект на вкладке «Карта».', n.id);
    return issues;
}
