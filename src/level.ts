export const NODE_TYPES = ['start', 'intro', 'blank', 'tool', 'process', 'lathe', 'part', 'warehouse', 'task', 'wait', 'check', 'finish'] as const;
export type NodeKind = typeof NODE_TYPES[number];
export type PortType = 'execution' | 'blank' | 'tool' | 'process' | 'machine' | 'part' | 'warehouse';
export interface Port {
    id: string;
    label: string;
    type: PortType;
    required?: boolean;
    multiple?: boolean;
}
export type Section = {
    diameter: number;
    length: number;
};
export type OperationSpec = {
    id: string;
    kind: 'turning';
    diameter: number;
    length: number;
    seconds: number;
} | {
    id: string;
    kind: 'milling';
    depth: number;
    seconds: number;
};
export type ParamValue = string | number | boolean | OperationSpec[] | Section[];
export type Params = Record<string, ParamValue>;
export interface Parameter {
    key: string;
    label: string;
    type: 'text' | 'number' | 'textarea' | 'select' | 'boolean';
    default: string | number | boolean;
    options?: readonly {
        value: string;
        label: string;
    }[];
    optional?: boolean;
    when?: (p: Params) => boolean;
}
export interface NodeDefinition {
    title: string;
    description: string;
    parameters: Parameter[];
    inputs: Port[];
    outputs: Port[];
}
export interface LevelNode {
    id: string;
    type: NodeKind;
    position: {
        x: number;
        y: number;
    };
    params: Params;
    size?: {
        width: number;
        height: number;
    };
}
export interface LevelEdge {
    id: string;
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
}
export interface Placement {
    nodeId: string;
    x: number;
    y: number;
}
export interface Level {
    version: 2;
    id: string;
    name: string;
    nodes: LevelNode[];
    edges: LevelEdge[];
    grid: {
        width: number;
        height: number;
    };
    placements: Placement[];
}
const execIn: Port = { id: 'in', label: 'Выполнение', type: 'execution', required: true, multiple: true };
const execOut: Port = { id: 'out', label: 'Далее', type: 'execution' };
const input = (id: string, label: string, type: PortType, required = true): Port => ({ id, label, type, required });
const output = (id: string, label: string, type: PortType): Port => ({ id, label, type });
const text = (key: string, label: string, value: string, optional = false, multiline = false): Parameter => ({ key, label, type: multiline ? 'textarea' : 'text', default: value, optional });
const num = (key: string, label: string, value: number, when?: (p: Params) => boolean): Parameter => ({ key, label, type: 'number', default: value, when });
const select = (key: string, label: string, value: string, options: readonly {
    value: string;
    label: string;
}[], when?: (p: Params) => boolean): Parameter => ({ key, label, type: 'select', default: value, options, when });
export const SHAPES = [{ value: 'cylinder', label: 'Цилиндр' }, { value: 'block', label: 'Прямоугольный брусок' }] as const;
export const MACHINE_TYPES = [{ value: 'lathe', label: 'Токарный' }, { value: 'mill', label: 'Фрезерный' }] as const;
export const TOOL_CATEGORIES = [{ value: 'turning', label: 'Токарные резцы' }, { value: 'milling', label: 'Фрезы' }] as const;
export const TOOLS = { turning: [{ value: 'passing', label: 'Проходной' }, { value: 'facing', label: 'Подрезной (операция пока не реализована)' }, { value: 'cutoff', label: 'Отрезной (операция пока не реализована)' }], milling: [{ value: 'end', label: 'Концевая' }, { value: 'face', label: 'Торцевая' }] } as const;
const cylinder = (p: Params) => p.shape === 'cylinder', block = (p: Params) => p.shape === 'block';
const dimensions: Parameter[] = [select('shape', 'Форма', 'cylinder', SHAPES), num('diameter', 'Диаметр, мм', 20, cylinder), num('length', 'Длина, мм', 60), num('width', 'Ширина, мм', 40, block), num('height', 'Высота, мм', 20, block)];
const checkFlag = (key: string, label: string): Parameter => ({ key, label, type: 'boolean', default: false });
export const registry: Record<NodeKind, NodeDefinition> = {
    start: { title: 'Начало уровня', description: 'Единственная точка входа', parameters: [], inputs: [], outputs: [execOut] },
    intro: { title: 'Вступление', description: 'Изображение и пояснение перед следующим шагом', parameters: [text('title', 'Заголовок', 'Первый валик', true), text('text', 'Подпись', 'Познакомьтесь с заданием.', true, true)], inputs: [execIn], outputs: [execOut] },
    task: { title: 'Задание', description: 'Текст цели и активация производства', parameters: [text('title', 'Заголовок', 'Изготовьте деталь'), text('instruction', 'Текст задания', 'Обработайте заготовку и отправьте деталь на склад.', false, true)], inputs: [execIn], outputs: [execOut] },
    wait: { title: 'Ожидать деталь на складе', description: 'Сравнивает фактическую деталь с независимыми требованиями', parameters: [num('quantity', 'Требуемое количество', 1)], inputs: [execIn, input('warehouse', 'Склад', 'warehouse'), input('part', 'Полученная деталь', 'part')], outputs: [execOut] },
    check: { title: 'Проверить выбор', description: 'Проверка заданной графом конфигурации один раз', parameters: [checkFlag('checkMachine', 'Проверять станок'), select('expectedMachine', 'Ожидаемый тип станка', 'lathe', MACHINE_TYPES, p => p.checkMachine === true), checkFlag('checkTool', 'Проверять инструмент'), select('expectedTool', 'Ожидаемый инструмент', 'passing', [...TOOLS.turning, ...TOOLS.milling], p => p.checkTool === true), checkFlag('checkBlank', 'Проверять заготовку'), text('expectedMaterial', 'Ожидаемый материал', 'Сталь'), select('expectedShape', 'Ожидаемая форма', 'cylinder', SHAPES), num('expectedDiameter', 'Ожидаемый диаметр, мм', 20, p => p.checkBlank === true && p.expectedShape === 'cylinder'), num('expectedLength', 'Ожидаемая длина, мм', 60, p => p.checkBlank === true), num('expectedWidth', 'Ожидаемая ширина, мм', 40, p => p.checkBlank === true && p.expectedShape === 'block'), num('expectedHeight', 'Ожидаемая высота, мм', 20, p => p.checkBlank === true && p.expectedShape === 'block'), checkFlag('checkProcess', 'Проверять последовательность операций'), text('success', 'Сообщение при успехе', 'Конфигурация подходит.'), text('error', 'Сообщение при ошибке', 'Конфигурация допустима, но не соответствует заданию.')], inputs: [execIn, input('machine', 'Станок', 'machine', false), input('tool', 'Инструмент', 'tool', false), input('blank', 'Заготовка', 'blank', false), input('process', 'Техпроцесс', 'process', false)], outputs: [output('correct', 'Правильно', 'execution'), output('incorrect', 'Неправильно', 'execution')] },
    finish: { title: 'Завершить уровень', description: 'Завершение выбранного пути один раз', parameters: [text('text', 'Текст результата', 'Уровень завершён.', false, true)], inputs: [execIn], outputs: [] },
    blank: { title: 'Заготовка', description: 'Одна физическая заготовка на столе', parameters: [text('name', 'Название', 'Стальная заготовка'), text('material', 'Материал', 'Сталь'), ...dimensions], inputs: [], outputs: [output('blank', 'Заготовка', 'blank')] },
    tool: { title: 'Инструмент', description: 'Категория и конкретный инструмент', parameters: [text('name', 'Название', 'Проходной резец'), select('category', 'Категория', 'turning', TOOL_CATEGORIES), select('kind', 'Инструмент', 'passing', TOOLS.turning)], inputs: [], outputs: [output('tool', 'Инструмент', 'tool')] },
    process: { title: 'Техпроцесс', description: 'Упорядоченные реализованные операции', parameters: [], inputs: [], outputs: [output('process', 'Техпроцесс', 'process')] },
    lathe: { title: 'Станок', description: 'Один станок с конфигурацией производства', parameters: [text('name', 'Название', 'Токарный станок'), select('kind', 'Тип станка', 'lathe', MACHINE_TYPES)], inputs: [input('blank', 'Заготовка', 'blank'), input('tool', 'Инструмент', 'tool'), input('process', 'Техпроцесс', 'process')], outputs: [output('machine', 'Станок', 'machine')] },
    part: { title: 'Полученная деталь', description: 'Независимые требования, а не фактически изготовленная деталь', parameters: [text('name', 'Название', 'Ступенчатый валик'), text('material', 'Ожидаемый материал', 'Сталь'), ...dimensions], inputs: [input('machine', 'Станок', 'machine')], outputs: [output('part', 'Полученная деталь', 'part')] },
    warehouse: { title: 'Склад', description: 'Хранение готовой детали', parameters: [text('name', 'Название', 'Склад'), num('capacity', 'Вместимость', 1)], inputs: [], outputs: [output('warehouse', 'Склад', 'warehouse')] },
};
export function defaultOperation(kind: OperationSpec['kind'] = 'turning', id: string = crypto.randomUUID()): OperationSpec { return kind === 'turning' ? { id, kind, diameter: 12, length: 30, seconds: 3 } : { id, kind, depth: 5, seconds: 3 }; }
export function operations(node: LevelNode, key = 'operations'): OperationSpec[] { return Array.isArray(node.params[key]) ? node.params[key] as OperationSpec[] : []; }
export function sections(node: LevelNode): Section[] { return Array.isArray(node.params.sections) ? node.params.sections as Section[] : []; }
export function makeNode(type: NodeKind, id: string, position = { x: 0, y: 0 }): LevelNode {
    const params: Params = Object.fromEntries(registry[type].parameters.map(p => [p.key, p.default]));
    if (type === 'intro')
        params.image = '';
    if (type === 'process')
        params.operations = [defaultOperation('turning', `${id}-1`)];
    if (type === 'part')
        params.sections = [{ diameter: 12, length: 30 }];
    if (type === 'check')
        params.expectedOperations = [defaultOperation('turning', `${id}-expected-1`)];
    return { id, type, position, params };
}
export function emptyLevel(): Level { return { version: 2, id: crypto.randomUUID(), name: 'Новый уровень', nodes: [], edges: [], grid: { width: 5, height: 5 }, placements: [] }; }
export function connect(level: Level, s: string, sh: string, t: string, th: string) { level.edges.push({ id: `${s}-${sh}-${t}-${th}`, source: s, sourceHandle: sh, target: t, targetHandle: th }); }
export function exampleLevel(): Level {
    const l = emptyLevel();
    l.id = 'first-shaft';
    l.name = 'Первый валик';
    const types: NodeKind[] = ['start', 'intro', 'task', 'wait', 'finish', 'blank', 'tool', 'process', 'lathe', 'part', 'warehouse'];
    l.nodes = types.map((type, i) => makeNode(type, type, { x: (i % 5) * 280, y: Math.floor(i / 5) * 300 }));
    l.nodes.find(n => n.type === 'finish')!.params.text = 'Отлично! Подходящая деталь находится на складе.';
    for (const [s, t] of [['start', 'intro'], ['intro', 'task'], ['task', 'wait'], ['wait', 'finish']])
        connect(l, s, 'out', t, 'in');
    connect(l, 'blank', 'blank', 'lathe', 'blank');
    connect(l, 'tool', 'tool', 'lathe', 'tool');
    connect(l, 'process', 'process', 'lathe', 'process');
    connect(l, 'lathe', 'machine', 'part', 'machine');
    connect(l, 'part', 'part', 'wait', 'part');
    connect(l, 'warehouse', 'warehouse', 'wait', 'warehouse');
    l.placements = [{ nodeId: 'blank', x: 0, y: 2 }, { nodeId: 'lathe', x: 2, y: 2 }, { nodeId: 'warehouse', x: 4, y: 2 }];
    return l;
}
export function twoOperationsLevel(): Level { const l = exampleLevel(); l.id = 'two-operations'; l.name = 'Два участка валика'; l.nodes.find(n => n.type === 'process')!.params.operations = [defaultOperation('turning', 'op-1'), { id: 'op-2', kind: 'turning', diameter: 8, length: 15, seconds: 2 }]; l.nodes.find(n => n.type === 'part')!.params.sections = [{ diameter: 12, length: 30 }, { diameter: 8, length: 15 }]; return l; }
export function millingLevel(): Level { const l = exampleLevel(); l.id = 'first-plane'; l.name = 'Первая плоскость'; Object.assign(l.nodes.find(n => n.type === 'blank')!.params, { shape: 'block', name: 'Стальной брусок' }); Object.assign(l.nodes.find(n => n.type === 'tool')!.params, { category: 'milling', kind: 'face', name: 'Торцевая фреза' }); Object.assign(l.nodes.find(n => n.type === 'lathe')!.params, { kind: 'mill', name: 'Фрезерный станок' }); l.nodes.find(n => n.type === 'process')!.params.operations = [defaultOperation('milling', 'mill-1')]; Object.assign(l.nodes.find(n => n.type === 'part')!.params, { shape: 'block', height: 15, name: 'Обработанный брусок', sections: [] }); l.nodes.find(n => n.type === 'intro')!.params = { title: 'Фрезерование плоскости', text: 'Снимите 5 мм с верхней плоскости бруска 60 × 40 × 20 мм.', image: '' }; return l; }
export function welcomeLevel(): Level { const l = emptyLevel(); l.name = 'Приветствие'; l.nodes = [makeNode('start', 'start'), makeNode('intro', 'intro', { x: 280, y: 0 }), makeNode('finish', 'finish', { x: 560, y: 0 })]; l.nodes[1].params = { title: 'Добро пожаловать!', text: 'Познакомьтесь с учебной мастерской. Оборудование не требуется.', image: '' }; l.nodes[2].params.text = 'Знакомство завершено.'; connect(l, 'start', 'out', 'intro', 'in'); connect(l, 'intro', 'out', 'finish', 'in'); return l; }
export function checkLevel(): Level { const l = exampleLevel(); l.id = 'check-configuration'; l.name = 'Проверка конфигурации'; const check = makeNode('check', 'check', { x: 550, y: -300 }); Object.assign(check.params, { checkMachine: true, checkTool: true, checkBlank: true, checkProcess: true }); l.nodes.push(check, makeNode('intro', 'explanation', { x: 830, y: -300 }), makeNode('finish', 'incorrect-finish', { x: 1110, y: -300 })); Object.assign(l.nodes.find(n => n.id === 'explanation')!.params, { title: 'Проверьте требования', text: 'Конфигурация физически допустима, но не подходит по заданию.' }); l.nodes.find(n => n.id === 'incorrect-finish')!.params.text = 'Изучите требования и измените конфигурацию в редакторе.'; l.edges = l.edges.filter(e => e.source !== 'intro'); connect(l, 'intro', 'out', 'check', 'in'); connect(l, 'check', 'correct', 'task', 'in'); connect(l, 'check', 'incorrect', 'explanation', 'in'); connect(l, 'explanation', 'out', 'incorrect-finish', 'in'); for (const [s, p] of [['lathe', 'machine'], ['tool', 'tool'], ['blank', 'blank'], ['process', 'process']])
    connect(l, s, p, 'check', p); return l; }
export function portPair(level: Level, edge: Omit<LevelEdge, 'id'>): {
    output: Port;
    input: Port;
} | null { const s = level.nodes.find(n => n.id === edge.source), t = level.nodes.find(n => n.id === edge.target); if (!s || !t || !registry[s.type] || !registry[t.type])
    return null; const output = registry[s.type].outputs.find(p => p.id === edge.sourceHandle), input = registry[t.type].inputs.find(p => p.id === edge.targetHandle); return output && input ? { output, input } : null; }
export function compatible(level: Level, edge: Omit<LevelEdge, 'id'>): boolean { const p = portPair(level, edge); return !!p && p.output.type === p.input.type && edge.source !== edge.target && (!!p.input.multiple || !level.edges.some(e => e.target === edge.target && e.targetHandle === edge.targetHandle)); }
export function sourceNode(level: Level, target: LevelNode | undefined, port: string): LevelNode | undefined { return level.nodes.find(n => n.id === level.edges.find(e => e.target === target?.id && e.targetHandle === port)?.source); }
export function deleteNodes(level: Level, ids: string[]): Level { return { ...level, nodes: level.nodes.filter(n => !ids.includes(n.id)), edges: level.edges.filter(e => !ids.includes(e.source) && !ids.includes(e.target)), placements: level.placements.filter(p => !ids.includes(p.nodeId)) }; }
export function placeObject(level: Level, nodeId: string, x: number, y: number): Level | null { if (!level.nodes.some(n => n.id === nodeId && ['blank', 'lathe', 'warehouse'].includes(n.type)) || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= level.grid.width || y >= level.grid.height || level.placements.some(p => p.nodeId !== nodeId && p.x === x && p.y === y))
    return null; return { ...level, placements: [...level.placements.filter(p => p.nodeId !== nodeId), { nodeId, x, y }] }; }
