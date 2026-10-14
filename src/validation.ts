import {catalogErrors} from './catalog';
import {groupErrors} from './groups';
import { registry, nodePorts, portsCompatible, portPair, sourceNode, operations, sections, TOOLS, type Level, type LevelNode, type Params, type OperationSpec } from './level';
import { producedPart, incomingPart, operationCompatibility, requirementsMachine, warehouseProducer } from './productionGraph';
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
    if (level.version !== 4)
        add('Требуется формат v4 после миграции.');
    if (!level.name.trim())
        add('Укажите название уровня.');
    for(const message of groupErrors(level))add(message);
    if(!['ready','player'].includes(level.productionMode))add('Выберите режим производства.');
    const player=level.productionMode==='player';if(player)issues.push(...catalogErrors(level));
    const ids = new Set<string>();
    let imageBytes = 0;
    for (const node of level.nodes) {
        if (ids.has(node.id))
            add('Идентификатор ноды повторяется.', node.id);
        ids.add(node.id);
        if(!player&&node.type==='catalog')add('Каталог используется в режиме «План игрока».',node.id);
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
    if (!player&&count('blank') !== (production ? 1 : Math.min(count('blank'), 1)))
        add('Допускается одна физическая заготовка.');
    for (const kind of ['lathe', 'warehouse', 'tool', 'process', 'part'])
        if (!player&&production && !count(kind))
            add(`Производственный уровень требует «${registry[kind as keyof typeof registry].title}».`);
    if (count('map') > 1 || production && count('map') !== 1)
        add('На производственном уровне требуется одна нода «Карта».');
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
        if (!portsCompatible(pair.output, pair.input))
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
        for (const p of nodePorts(n,level).inputs) {
            const checkRequired = n.type === 'check' && n.params[`check${p.id[0].toUpperCase()}${p.id.slice(1)}`] === true;
            const resultRequired = n.type === 'check' && n.params.checkResult === true && ['detail', 'requirements'].includes(p.id);
            if ((p.required || checkRequired || resultRequired) && !incoming.has(`${n.id}:${p.id}`))
                add(`Не подключён вход «${p.label}».`, n.id);
        }
        for (const p of nodePorts(n,level).outputs.filter(p => p.type === 'execution'))
            if (!(n.type === 'hint' && level.edges.some(e => e.target === n.id && e.targetHandle === 'event')) && !outgoing.has(`${n.id}:${p.id}`))
                add(`Не подключён выход выполнения «${p.label}».`, n.id);
    }
    const visited = new Set<string>(), stack = new Set<string>();
    function visit(id: string) {
        if (stack.has(id)) {
            add('Циклы не поддерживаются.', id);
            return;
        }
        if (visited.has(id))
            return;
        visited.add(id);
        stack.add(id);
        for (const e of level.edges.filter(e => e.source === id))
            if (ids.has(e.target))
                visit(e.target);
        stack.delete(id);
    }
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
            hasTask = true;
            hasWait = false;
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
    for (const n of level.nodes.filter(n => (registry[n.type]?.inputs.some(p => p.type === 'execution') || n.type === 'start') && !(n.type === 'hint' && level.edges.some(e => e.target === n.id && e.targetHandle === 'event'))))
        if (!reachable.has(n.id))
            add('Нода сценария не достижима от начала уровня.', n.id);
    for (const m of level.nodes.filter(n => n.type === 'lathe'&&!player)) {
        try {
            const incoming = incomingPart(level, m), process = sourceNode(level, m, 'process'), tool = sourceNode(level, m, 'tool');
            if (process)
                for (const error of operationCompatibility(incoming, String(m.params.kind), { category: String(tool?.params.category ?? (m.params.kind === 'mill' ? 'milling' : 'turning')), kind: String(tool?.params.kind ?? (m.params.kind === 'mill' ? 'face' : 'passing')) }, operations(process)))
                    add(error, m.id);
            producedPart(level, m);
        }
        catch (error) {
            if (!issues.some(e => e.nodeId === m.id && e.message === (error as Error).message))
                add((error as Error).message, m.id);
        }
        if (production && !level.nodes.some(w => w.type === 'wait' && requirementsMachine(level, w)?.id === m.id))
            add('Подключите результат станка к ожиданию и складу.', m.id);
    }
    for (const n of level.nodes) {
        if (n.type === 'hint') {
            const event = level.edges.some(e => e.target === n.id && e.targetHandle === 'event'), exec = level.edges.some(e => e.target === n.id && e.targetHandle === 'in');
            if (event === exec)
                add('Подсказку подключают либо к сценарию, либо к событию, но не к обоим.', n.id);
            if (event && level.edges.some(e => e.source === n.id && portPair(level, e)?.output.type === 'execution'))
                add('Событийная подсказка не имеет продолжения основного сценария.', n.id);
        }
        if (n.type === 'after') {
            const id = String(n.params.objectId ?? '');
            if (id && !level.nodes.some(o => o.id === id) && !level.nodes.filter(o => o.type === 'process').some(p => operations(p).some(o => o.id === id)))
                add('Объект фильтра события отсутствует.', n.id);
        }
    }
    // Validate runtime data dependencies independently of execution edges. A producer must precede its consumer on every path.
    function predecessors(id: string): string[] { return level.edges.filter(e => e.target === id && portPair(level, e)?.output.type === 'execution').map(e => e.source); }
    function dominatedBy(id: string, producer: string, seen = new Set<string>()): boolean { if (id === producer)
        return true; if (seen.has(id))
        return false; const n = level.nodes.find(n => n.id === id); if (!n || n.type === 'start')
        return false; const next = new Set(seen); next.add(id); const prev = predecessors(id); return prev.length > 0 && prev.every(p => dominatedBy(p, producer, next)); }
    for (const w of level.nodes.filter(n => n.type === 'wait')) {
        const m = requirementsMachine(level, w);
        const input = sourceNode(level, m, 'blank');
        if (!input || input.type === 'blank')
            continue;
        const prior = input.type === 'wait' ? input : level.nodes.find(n => n.type === 'wait' && sourceNode(level, n, 'warehouse')?.id === input.id);
        if (!prior || !dominatedBy(w.id, prior.id))
            add('Ожидание предыдущего этапа должно предшествовать потребителю на каждом пути.', w.id);
        if (input.type === 'wait' && sourceNode(level, input, 'warehouse')?.params.mode !== 'intermediate')
            add('Передача фактической детали требует промежуточного склада.', m?.id);
    }
    for (const n of level.nodes.filter(n => n.type === 'check'))
        for (const port of ['blank', 'detail']) {
            if (port === 'blank' && n.params.checkBlank !== true || port === 'detail' && n.params.checkResult !== true)
                continue;
            const input = sourceNode(level, n, port);
            const wait = input?.type === 'wait' ? input : input?.type === 'warehouse' ? level.nodes.find(w => w.type === 'wait' && sourceNode(level, w, 'warehouse')?.id === input.id) : undefined;
            if (wait && !dominatedBy(n.id, wait.id))
                add('Проверка результата должна идти после ожидания, которое выдаёт фактическую деталь.', n.id);
        }
    // One item follows the last successful storage step on each alternative execution path.
    const materialPaths=new Set<string>();
    function itemPath(id:string,lastWait:string|null,stack=new Set<string>()){
      const key=`${id}:${lastWait??''}`;if(stack.has(id)||materialPaths.has(key))return;materialPaths.add(key);
      const node=level.nodes.find(n=>n.id===id);if(!node)return;
      if(node.type==='wait'){
        const machine=requirementsMachine(level,node),input=sourceNode(level,machine,'blank');
        const prior=lastWait?level.nodes.find(n=>n.id===lastWait):undefined;
        if(prior&&requirementsMachine(level,prior)?.id!==machine?.id){
          const sourceWarehouse=sourceNode(level,prior,'warehouse');
          if(input?.type==='blank')add('Следующий станок должен получать фактическую деталь с промежуточного склада или выхода предыдущего ожидания, а не исходную заготовку заново.',machine?.id);
          else if(input?.type==='warehouse'&&input.id!==sourceWarehouse?.id||input?.type==='wait'&&input.id!==prior.id)add('Источник следующего этапа должен ссылаться на последний склад или ожидание этого пути: прежний склад уже пуст.',machine?.id);
        }
        lastWait=node.id;
      }
      const nextStack=new Set(stack);nextStack.add(id);
      for(const e of level.edges.filter(e=>e.source===id&&portPair(level,e)?.output.type==='execution'))itemPath(e.target,lastWait,nextStack);
    }
    if(!player&&one('start'))itemPath(one('start')!.id,null);
    // Node position/size belong to editor storage; production validation deliberately ignores them.
    const { width, height } = level.grid;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8 || height > 8)
        add('Размер сетки: целые числа от 1 до 8.');
    if (!Array.isArray(level.grid.points)) {
        add('Укажите разрешённые точки карты.');
        return issues;
    }
    const pointIds = new Set<string>(), cells = new Set<string>();
    for (const p of level.grid.points) {
        if (pointIds.has(p.id) || cells.has(`${p.x},${p.y}`))
            add('Точки карты должны иметь уникальные ID и клетки.');
        pointIds.add(p.id);
        cells.add(`${p.x},${p.y}`);
        if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= width || p.y >= height)
            add('Точка за границами карты.');
    }
    if (level.grid.points.length > width * height)
        add('Число точек превышает площадь карты.');
    const occupied = new Set<string>(), placed = new Set<string>();
    for (const p of level.placements) {
        const n = level.nodes.find(n => n.id === p.nodeId);
        if (!n || !(player?['table','warehouse']:['blank','lathe','warehouse','table']).includes(n.type))
            add('Размещение ссылается на отсутствующий или неподходящий объект.', p.nodeId);
        if (!pointIds.has(p.pointId))
            add('Размещение допускается только на разрешённой точке.', p.nodeId);
        if (occupied.has(p.pointId))
            add('На точке уже находится другой объект.', p.nodeId);
        occupied.add(p.pointId);
        if (placed.has(p.nodeId))
            add('Объект размещён несколько раз.', p.nodeId);
        placed.add(p.nodeId);
    }
    for (const n of level.nodes.filter(n => (player?['table','warehouse']:['blank','lathe','warehouse','table']).includes(n.type)))
        if (!placed.has(n.id))
            add('Разместите объект на вкладке «Карта».', n.id);
    return issues;
}
