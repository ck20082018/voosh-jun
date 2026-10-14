import { near } from './manufacturing';
import { makeNode, type Level, type LevelNode, type LevelEdge, type OperationSpec } from './level';
export interface LegacyV2Level extends Omit<Level, 'version' | 'grid' | 'placements' | 'productionMode' | 'groups'> {
    version: 2;
    grid: {
        width: number;
        height: number;
    };
    placements: {
        nodeId: string;
        x: number;
        y: number;
    }[];
}
export interface LegacyLevel {
    version: 1;
    id: string;
    name: string;
    nodes: {
        id: string;
        type: string;
        position: {
            x: number;
            y: number;
        };
        params: Record<string, string | number>;
        size?: {
            width: number;
            height: number;
        };
    }[];
    edges: LevelEdge[];
    grid: LegacyV2Level['grid'];
    placements: LegacyV2Level['placements'];
}
export function migrateV1(old: LegacyLevel): LegacyV2Level {
    const fail = (why: string): never => { throw new Error(`Миграция v1 невозможна: ${why}. Старое сохранение не изменено.`); };
    const find = (id: string) => old.nodes.find(n => n.id === id);
    const source = (target: string, port: string) => {
        const links = old.edges.filter(e => e.target === target && e.targetHandle === port);
        if (links.length !== 1)
            return fail(`для ${target}/${port} требуется одна связь`);
        return find(links[0].source) ?? fail('отсутствует нода по ссылке');
    };
    const l: LegacyV2Level = { version: 2, id: old.id, name: old.name, nodes: [], edges: structuredClone(old.edges), grid: { ...old.grid }, placements: structuredClone(old.placements) };
    const machines = old.nodes.filter(n => n.type === 'lathe');
    const production = old.nodes.some(n => n.type === 'task' || n.type === 'wait');
    const processByMachine = new Map<string, {
        id: string;
        blankId: string;
        ops: OperationSpec[];
    }>();
    const used = new Set<string>();
    for (const machine of machines) {
        const last = source(machine.id, 'operation');
        let current = last;
        const ops: OperationSpec[] = [];
        const chain = new Set<string>();
        let blankId = '';
        while (current) {
            if (current.type !== 'turning' || chain.has(current.id))
                fail('некорректная или циклическая цепочка операций');
            chain.add(current.id);
            used.add(current.id);
            const blank = source(current.id, 'blank');
            if (blank.type !== 'blank' || blankId && blankId !== blank.id)
                fail('операции используют разные заготовки');
            blankId = blank.id;
            ops.unshift({ id: current.id, kind: 'turning', diameter: Number(current.params.diameter), length: Number(current.params.length), seconds: Number(current.params.seconds) });
            const previous = old.edges.filter(e => e.target === current.id && e.targetHandle === 'previous');
            if (previous.length > 1)
                fail('несколько предыдущих операций');
            if (!previous.length)
                break;
            current = find(previous[0].source) ?? fail('предыдущая операция отсутствует');
        }
        processByMachine.set(machine.id, { id: last.id, blankId, ops });
    }
    if (old.nodes.some(n => n.type === 'turning' && !used.has(n.id)))
        fail('операция не включена в станок');
    for (const n of old.nodes) {
        if (n.type === 'turning') {
            const config = [...processByMachine.values()].find(p => p.id === n.id);
            if (!config)
                continue;
            const node = makeNode('process', n.id, n.position);
            node.params.operations = config.ops;
            node.size = n.size ? { ...n.size } : undefined;
            l.nodes.push(node);
            continue;
        }
        if (!['start', 'intro', 'blank', 'tool', 'lathe', 'warehouse', 'task', 'wait', 'finish'].includes(n.type))
            fail(`неизвестный тип ${n.type}`);
        const node = makeNode(n.type as LevelNode['type'], n.id, n.position);
        Object.assign(node.params, n.params);
        if (n.size)
            node.size = { ...n.size };
        if (n.type === 'blank')
            node.params.shape = 'cylinder';
        if (n.type === 'tool') {
            if (n.params.kind !== 'turning')
                fail('неподдерживаемый старый инструмент');
            node.params.category = 'turning';
            node.params.kind = 'passing';
        }
        if (n.type === 'lathe')
            node.params.kind = 'lathe';
        l.nodes.push(node);
    }
    l.edges = l.edges.filter(e => !old.nodes.some(n => n.id === e.target && (n.type === 'turning' || n.type === 'task' && ['machine', 'warehouse'].includes(e.targetHandle))) && !(old.nodes.some(n => n.id === e.source && n.type === 'turning')));
    for (const [id, p] of processByMachine) {
        l.edges.push({ id: `migrate-${id}-blank`, source: p.blankId, sourceHandle: 'blank', target: id, targetHandle: 'blank' }, { id: `migrate-${id}-process`, source: p.id, sourceHandle: 'process', target: id, targetHandle: 'process' });
    }
    for (const wait of old.nodes.filter(n => n.type === 'wait')) {
        const expected = source(wait.id, 'operation');
        const task = old.nodes.find(n => n.type === 'task') ?? fail('отсутствует производственное задание');
        const machine = source(task.id, 'machine');
        const config = processByMachine.get(machine.id) ?? fail('нет техпроцесса');
        if (expected.id !== config.id)
            fail('старое ожидание не соответствует последней операции станка');
        if (source(task.id, 'warehouse').id !== source(wait.id, 'warehouse').id)
            fail('задание и ожидание используют разные склады');
        let id = `${wait.id}-part`;
        while (old.nodes.some(n => n.id === id) || l.nodes.some(n => n.id === id))
            id += '-new';
        const blank = find(config.blankId)!;
        const part = makeNode('part', id, { x: wait.position.x, y: wait.position.y + 260 });
        Object.assign(part.params, { material: String(blank.params.material), diameter: Number(blank.params.diameter), length: Number(blank.params.length), sections: config.ops.map(o => o.kind === 'turning' ? { diameter: o.diameter, length: o.length } : fail('неподдерживаемая операция')) });
        if (near(config.ops.reduce((sum, o) => sum + (o.kind === 'turning' ? o.length : 0), 0), Number(blank.params.length)))
            part.params.diameter = Math.max(...config.ops.map(o => o.kind === 'turning' ? o.diameter : 0));
        l.nodes.push(part);
        l.edges = l.edges.filter(e => !(e.target === wait.id && e.targetHandle === 'operation'));
        l.edges.push({ id: `migrate-${id}-machine`, source: machine.id, sourceHandle: 'machine', target: id, targetHandle: 'machine' }, { id: `migrate-${id}-wait`, source: id, sourceHandle: 'part', target: wait.id, targetHandle: 'part' });
    }
    if (production && machines.length !== 1)
        fail('производственный уровень требует один станок');
    return l;
}
export function migrateV2(old: LegacyV2Level): LegacyV3Level {
    const nodes = structuredClone(old.nodes);
    for (const n of nodes) {
        if (n.type === 'warehouse')
            n.params.mode = 'final';
        if (n.type === 'check')
            n.params.checkResult = false;
    }
    const points: Level['grid']['points'] = [];
    const placements: Level['placements'] = [];
    for (const p of old.placements) {
        let point = points.find(point => point.x === p.x && point.y === p.y);
        if (!point) {
            point = { id: `point-${p.x}-${p.y}`, x: p.x, y: p.y };
            points.push(point);
        }
        placements.push({ nodeId: p.nodeId, pointId: point.id });
    }
    if (nodes.some(n => ['blank', 'lathe', 'warehouse'].includes(n.type))) {
        let id = 'map';
        while (nodes.some(n => n.id === id))
            id += '-migrated';
        nodes.push(makeNode('map', id, { x: 0, y: 900 }));
    }
    return { version: 3, id: old.id, name: old.name, nodes, edges: structuredClone(old.edges), grid: { ...old.grid, points }, placements };
}

export interface LegacyV3Level extends Omit<Level,'version'|'productionMode'|'groups'>{version:3}
export function migrateV3(old:LegacyV3Level):Level{return {...structuredClone(old),version:4,productionMode:'ready',groups:[]};}
