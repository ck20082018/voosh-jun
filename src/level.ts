import type {SurfacePass,TrainingStep} from './turningTraining';
export const NODE_TYPES = ['start', 'intro', 'blank', 'tool', 'process', 'lathe', 'part', 'warehouse', 'task', 'wait', 'check', 'finish', 'hint', 'after', 'map', 'catalog', 'table'] as const;
export type NodeKind = typeof NODE_TYPES[number];
export type PortType = 'execution' | 'blank' | 'tool' | 'process' | 'machine' | 'part' | 'warehouse' | 'event' | 'actual-part' | 'catalog';
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
    surfacePass?: SurfacePass;
    training?: TrainingStep;
    diameter: number;
    length: number;
    seconds: number;
} | {
    id: string;
    kind: 'milling';
    depth: number;
    seconds: number;
};
export type AllowedOperation={kind:OperationSpec['kind'];seconds:number};
export type ParamValue = string | number | boolean | OperationSpec[] | Section[] | string[] | AllowedOperation[];
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
    groupId?:string;
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
    pointId: string;
}
export interface MapPoint {
    id: string;
    x: number;
    y: number;
}
export interface LocatedPlacement extends MapPoint {
    nodeId: string;
    pointId: string;
}
export interface NodeGroup {id:string;name:string;color:string;position:{x:number;y:number};size:{width:number;height:number}}
export interface Level {
    version: 4;
    productionMode:'ready'|'player';
    groups:NodeGroup[];
    id: string;
    name: string;
    nodes: LevelNode[];
    edges: LevelEdge[];
    grid: {
        width: number;
        height: number;
        points: MapPoint[];
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
export const TOOLS = { turning: [{ value: 'passing', label: 'Проходной' }, { value: 'facing', label: 'Подрезной / фаска' }, {value:'grooving',label:'Канавочный'}, {value:'drilling',label:'Сверло'}, {value:'boring',label:'Расточной'}, { value: 'cutoff', label: 'Отрезной (операция пока не реализована)' }], milling: [{ value: 'end', label: 'Концевая' }, { value: 'face', label: 'Торцевая' }] } as const;
const cylinder = (p: Params) => p.shape === 'cylinder', block = (p: Params) => p.shape === 'block';
const dimensions: Parameter[] = [select('shape', 'Форма', 'cylinder', SHAPES), num('diameter', 'Диаметр, мм', 20, cylinder), num('length', 'Длина, мм', 60), num('width', 'Ширина, мм', 40, block), num('height', 'Высота, мм', 20, block)];
const checkFlag = (key: string, label: string): Parameter => ({ key, label, type: 'boolean', default: false });
export const registry: Record<NodeKind, NodeDefinition> = {
    start: { title: 'Начало уровня', description: 'Единственная точка входа', parameters: [], inputs: [], outputs: [execOut] },
    intro: { title: 'Вступление', description: 'Изображение и пояснение перед следующим шагом', parameters: [text('title', 'Заголовок', 'Первый валик', true), text('text', 'Подпись', 'Познакомьтесь с заданием.', true, true)], inputs: [execIn], outputs: [execOut] },
    task: { title: 'Задание', description: 'Текст цели и активация производства', parameters: [text('title', 'Заголовок', 'Изготовьте деталь'), text('instruction', 'Текст задания', 'Обработайте заготовку и отправьте деталь на склад.', false, true)], inputs: [execIn], outputs: [execOut] },
    wait: { title: 'Ожидать деталь на складе', description: 'Сравнивает фактическую деталь с независимыми требованиями', parameters: [num('quantity', 'Требуемое количество', 1)], inputs: [execIn, input('warehouse', 'Склад', 'warehouse'), input('part', 'Полученная деталь', 'part')], outputs: [execOut, output('detail', 'Деталь', 'actual-part')] },
    check: { title: 'Проверить выбор', description: 'Проверка заданной графом конфигурации один раз', parameters: [checkFlag('checkResult', 'Проверять фактическую деталь'), checkFlag('checkMachine', 'Проверять станок'), select('expectedMachine', 'Ожидаемый тип станка', 'lathe', MACHINE_TYPES, p => p.checkMachine === true), checkFlag('checkTool', 'Проверять инструмент'), select('expectedTool', 'Ожидаемый инструмент', 'passing', [...TOOLS.turning, ...TOOLS.milling], p => p.checkTool === true), checkFlag('checkBlank', 'Проверять заготовку'), text('expectedMaterial', 'Ожидаемый материал', 'Сталь'), select('expectedShape', 'Ожидаемая форма', 'cylinder', SHAPES), num('expectedDiameter', 'Ожидаемый диаметр, мм', 20, p => p.checkBlank === true && p.expectedShape === 'cylinder'), num('expectedLength', 'Ожидаемая длина, мм', 60, p => p.checkBlank === true), num('expectedWidth', 'Ожидаемая ширина, мм', 40, p => p.checkBlank === true && p.expectedShape === 'block'), num('expectedHeight', 'Ожидаемая высота, мм', 20, p => p.checkBlank === true && p.expectedShape === 'block'), checkFlag('checkProcess', 'Проверять последовательность операций'), text('success', 'Сообщение при успехе', 'Конфигурация подходит.'), text('error', 'Сообщение при ошибке', 'Конфигурация допустима, но не соответствует заданию.')], inputs: [execIn, input('machine', 'Станок', 'machine', false), input('tool', 'Инструмент', 'tool', false), input('blank', 'Заготовка', 'blank', false), input('process', 'Техпроцесс', 'process', false), input('detail', 'Фактическая деталь', 'actual-part', false), input('requirements', 'Требования к детали', 'part', false)], outputs: [output('correct', 'Правильно', 'execution'), output('incorrect', 'Неправильно', 'execution')] },
    finish: { title: 'Завершить уровень', description: 'Завершение выбранного пути один раз', parameters: [text('text', 'Текст результата', 'Уровень завершён.', false, true)], inputs: [execIn], outputs: [] },
    blank: { title: 'Заготовка', description: 'Одна физическая заготовка на столе', parameters: [text('name', 'Название', 'Стальная заготовка'), text('material', 'Материал', 'Сталь'), ...dimensions], inputs: [], outputs: [output('blank', 'Заготовка', 'blank')] },
    tool: { title: 'Инструмент', description: 'Категория и конкретный инструмент', parameters: [text('name', 'Название', 'Проходной резец'), select('category', 'Категория', 'turning', TOOL_CATEGORIES), select('kind', 'Инструмент', 'passing', TOOLS.turning)], inputs: [], outputs: [output('tool', 'Инструмент', 'tool')] },
    process: { title: 'Техпроцесс', description: 'Упорядоченные реализованные операции', parameters: [], inputs: [], outputs: [output('process', 'Техпроцесс', 'process')] },
    lathe: { title: 'Станок', description: 'Один станок с конфигурацией производства', parameters: [text('name', 'Название', 'Токарный станок'), select('kind', 'Тип станка', 'lathe', MACHINE_TYPES)], inputs: [input('blank', 'Заготовка', 'blank'), input('tool', 'Инструмент', 'tool'), input('process', 'Техпроцесс', 'process')], outputs: [output('machine', 'Станок', 'machine')] },
    part: { title: 'Полученная деталь', description: 'Независимые требования, а не фактически изготовленная деталь', parameters: [text('name', 'Название', 'Ступенчатый валик'), text('material', 'Ожидаемый материал', 'Сталь'), ...dimensions], inputs: [input('machine', 'Станок', 'machine'),input('catalog','Каталог','catalog',false)], outputs: [output('part', 'Полученная деталь', 'part')] },
    warehouse: { title: 'Склад', description: 'Хранение готовой детали', parameters: [text('name', 'Название', 'Склад'), num('capacity', 'Вместимость', 1), select('mode', 'Режим склада', 'final', [{ value: 'final', label: 'Конечный' }, { value: 'intermediate', label: 'Промежуточный' }])], inputs: [], outputs: [output('warehouse', 'Склад', 'warehouse'), output('blank', 'Заготовка', 'blank')] },
    hint: { title: 'Подсказка', description: 'Сообщение сценария или успешного действия', parameters: [text('title', 'Заголовок', 'Подсказка'), text('text', 'Текст', 'Продолжайте работу.', false, true), select('display', 'Способ показа', 'panel', [{ value: 'panel', label: 'Небольшая панель' }, { value: 'modal', label: 'Модальное окно' }]), { key: 'confirm', label: 'Подтверждение «Продолжить»', type: 'boolean', default: true }, select('frequency', 'Частота', 'once', [{ value: 'once', label: 'Один раз за попытку' }, { value: 'each', label: 'После каждого действия' }])], inputs: [{ ...execIn, required: false }, input('event', 'После действия', 'event', false)], outputs: [execOut] },
    after: { title: 'После действия', description: 'Событие только успешного действия', parameters: [select('action', 'Действие', 'blank-installed', [{ value: 'blank-installed', label: 'Установка заготовки' }, { value: 'processing-finished', label: 'Завершение операции' }, { value: 'part-stored', label: 'Поступление детали на склад' }, { value: 'item-retrieved', label: 'Получение со склада' }, { value: 'configuration-checked', label: 'Успешная проверка выбора' }]), text('objectId', 'Объект (пусто — любой)', '', true)], inputs: [], outputs: [output('event', 'Событие', 'event')] },
    catalog:{title:'Каталог',description:'Варианты для самостоятельного плана игрока',parameters:[],inputs:[],outputs:[output('catalog','Каталог','catalog')]},
    table:{title:'Стол',description:'Фиксированное место выбранной заготовки',parameters:[text('name','Название','Стол с заготовкой')],inputs:[],outputs:[]},
    map: { title: 'Карта', description: 'Размеры и разрешённые точки размещения', parameters: [], inputs: [], outputs: [] },
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
    if(type==='catalog'){params.blankIds=[];params.machineIds=[];params.toolIds=[];params.allowedOperations=[{kind:'turning',seconds:3}];}
    if (type === 'check')
        params.expectedOperations = [defaultOperation('turning', `${id}-expected-1`)];
    return { id, type, position, params };
}
export function emptyLevel(): Level { return { version: 4,productionMode:'ready',groups:[], id: crypto.randomUUID(), name: 'Новый уровень', nodes: [], edges: [], grid: { width: 5, height: 5, points: [] }, placements: [] }; }
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
    l.nodes.push(makeNode('map', 'map', { x: 0, y: 900 }));
    l.grid.points = [{ id: 'point-blank', x: 0, y: 2 }, { id: 'point-lathe', x: 2, y: 2 }, { id: 'point-warehouse', x: 4, y: 2 }, { id: 'point-free-1', x: 0, y: 0 }, { id: 'point-free-2', x: 1, y: 0 }];
    l.placements = [{ nodeId: 'blank', pointId: 'point-blank' }, { nodeId: 'lathe', pointId: 'point-lathe' }, { nodeId: 'warehouse', pointId: 'point-warehouse' }];
    return l;
}
export function twoOperationsLevel(): Level { const l = exampleLevel(); l.id = 'two-operations'; l.name = 'Два участка валика'; l.nodes.find(n => n.type === 'process')!.params.operations = [defaultOperation('turning', 'op-1'), { id: 'op-2', kind: 'turning', diameter: 8, length: 15, seconds: 2 }]; l.nodes.find(n => n.type === 'part')!.params.sections = [{ diameter: 12, length: 30 }, { diameter: 8, length: 15 }]; return l; }
export function millingLevel(): Level { const l = exampleLevel(); l.id = 'first-plane'; l.name = 'Первая плоскость'; Object.assign(l.nodes.find(n => n.type === 'blank')!.params, { shape: 'block', name: 'Стальной брусок' }); Object.assign(l.nodes.find(n => n.type === 'tool')!.params, { category: 'milling', kind: 'face', name: 'Торцевая фреза' }); Object.assign(l.nodes.find(n => n.type === 'lathe')!.params, { kind: 'mill', name: 'Фрезерный станок' }); l.nodes.find(n => n.type === 'process')!.params.operations = [defaultOperation('milling', 'mill-1')]; Object.assign(l.nodes.find(n => n.type === 'part')!.params, { shape: 'block', height: 15, name: 'Обработанный брусок', sections: [] }); l.nodes.find(n => n.type === 'intro')!.params = { title: 'Фрезерование плоскости', text: 'Снимите 5 мм с верхней плоскости бруска 60 × 40 × 20 мм.', image: '' }; return l; }
export function welcomeLevel(): Level { const l = emptyLevel(); l.name = 'Приветствие'; l.nodes = [makeNode('start', 'start'), makeNode('intro', 'intro', { x: 280, y: 0 }), makeNode('finish', 'finish', { x: 560, y: 0 })]; l.nodes[1].params = { title: 'Добро пожаловать!', text: 'Познакомьтесь с учебной мастерской. Оборудование не требуется.', image: '' }; l.nodes[2].params.text = 'Знакомство завершено.'; connect(l, 'start', 'out', 'intro', 'in'); connect(l, 'intro', 'out', 'finish', 'in'); return l; }
export function checkLevel(): Level {
    const l = exampleLevel();
    l.id = 'check-configuration';
    l.name = 'Проверка конфигурации';
    const check = makeNode('check', 'check', { x: 550, y: -300 });
    Object.assign(check.params, { checkMachine: true, checkTool: true, checkBlank: true, checkProcess: true });
    l.nodes.push(check, makeNode('intro', 'explanation', { x: 830, y: -300 }), makeNode('finish', 'incorrect-finish', { x: 1110, y: -300 }));
    Object.assign(l.nodes.find(n => n.id === 'explanation')!.params, { title: 'Проверьте требования', text: 'Конфигурация физически допустима, но не подходит по заданию.' });
    l.nodes.find(n => n.id === 'incorrect-finish')!.params.text = 'Изучите требования и измените конфигурацию в редакторе.';
    l.edges = l.edges.filter(e => e.source !== 'intro');
    connect(l, 'intro', 'out', 'check', 'in');
    connect(l, 'check', 'correct', 'task', 'in');
    connect(l, 'check', 'incorrect', 'explanation', 'in');
    connect(l, 'explanation', 'out', 'incorrect-finish', 'in');
    for (const [s, p] of [['lathe', 'machine'], ['tool', 'tool'], ['blank', 'blank'], ['process', 'process']])
        connect(l, s, p, 'check', p);
    return l;
}
export function portPair(level: Level, edge: Omit<LevelEdge, 'id'>): {
    output: Port;
    input: Port;
} | null {
    const s = level.nodes.find(n => n.id === edge.source), t = level.nodes.find(n => n.id === edge.target);
    if (!s || !t || !registry[s.type] || !registry[t.type])
        return null;
    const output = nodePorts(s,level).outputs.find(p => p.id === edge.sourceHandle), input = nodePorts(t,level).inputs.find(p => p.id === edge.targetHandle);
    return output && input ? { output, input } : null;
}
export function compatible(level: Level, edge: Omit<LevelEdge, 'id'>): boolean { const p = portPair(level, edge); return !!p && portsCompatible(p.output, p.input) && edge.source !== edge.target && (!!p.input.multiple || !level.edges.some(e => e.target === edge.target && e.targetHandle === edge.targetHandle)); }
export function sourceNode(level: Level, target: LevelNode | undefined, port: string): LevelNode | undefined { return level.nodes.find(n => n.id === level.edges.find(e => e.target === target?.id && e.targetHandle === port)?.source); }
export function deleteNodes(level: Level, ids: string[]): Level { if (level.nodes.some(n => ids.includes(n.id) && n.type === 'map') && level.placements.some(p => !ids.includes(p.nodeId)))
    return level; return { ...level, nodes: level.nodes.filter(n => !ids.includes(n.id)), edges: level.edges.filter(e => !ids.includes(e.source) && !ids.includes(e.target)), placements: level.placements.filter(p => !ids.includes(p.nodeId)) }; }
export function catalogIds(level:Level):Set<string>{return new Set(level.nodes.filter(n=>n.type==='catalog').flatMap(n=>['blankIds','machineIds','toolIds'].flatMap(k=>Array.isArray(n.params[k])?n.params[k] as string[]:[])));}
export function nodePorts(node:LevelNode,level?:Level):Pick<NodeDefinition,'inputs'|'outputs'>{
 const d=registry[node.type];let inputs=d.inputs;
 if(level?.productionMode==='player'){
  if(node.type==='lathe'&&catalogIds(level).has(node.id))inputs=[];
  if(node.type==='part')inputs=d.inputs.filter(p=>p.id!=='machine').map(p=>p.id==='catalog'?{...p,required:true}:p);
 }else if(node.type==='part')inputs=d.inputs.filter(p=>p.id!=='catalog');
 return {inputs,outputs:d.outputs.filter(p=>!(node.type==='warehouse'&&p.id==='blank'&&node.params.mode!=='intermediate'))};
}
export function portsCompatible(output: Port, input: Port): boolean { return output.type === input.type || output.type === 'actual-part' && input.type === 'blank'; }
export function locatedPlacements(level: Pick<Level, 'grid' | 'placements'>): LocatedPlacement[] { return level.placements.flatMap(p => { const point = level.grid.points.find(point => point.id === p.pointId); return point ? [{ ...point, pointId: point.id, nodeId: p.nodeId }] : []; }); }
export function placeObject(level: Level, nodeId: string, x: number, y: number): Level | null {
    if(level.productionMode==='player'&&catalogIds(level).has(nodeId))return null;
    const point = level.grid.points.find(p => p.x === x && p.y === y);
    if (!point || !level.nodes.some(n => n.id === nodeId && ['blank', 'lathe', 'warehouse', 'table'].includes(n.type)) || level.placements.some(p => p.nodeId !== nodeId && p.pointId === point.id))
        return null;
    return { ...level, placements: [...level.placements.filter(p => p.nodeId !== nodeId), { nodeId, pointId: point.id }] };
}
export function intermediateLevel(): Level {
    const l = exampleLevel();
    l.id = 'intermediate-shaft';
    l.name = 'Два станка и промежуточный склад';
    l.grid.width = 7;
    const store = l.nodes.find(n => n.id === 'warehouse')!;
    store.params.mode = 'intermediate';
    store.params.name = 'Промежуточный склад';
    const machine = makeNode('lathe', 'lathe-2', { x: 900, y: 350 }), process = makeNode('process', 'process-2', { x: 600, y: 650 }), part = makeNode('part', 'part-2', { x: 1200, y: 350 }), final = makeNode('warehouse', 'final-store', { x: 1200, y: 650 }), wait = makeNode('wait', 'wait-2', { x: 1100, y: 0 });
    machine.params.name = 'Второй токарный станок';
    process.params.operations = [{ id: 'second-section', kind: 'turning', diameter: 8, length: 15, seconds: 2 }];
    part.params.sections = [{ diameter: 12, length: 30 }, { diameter: 8, length: 15 }];
    final.params.name = 'Конечный склад';
    l.nodes.push(machine, process, part, final, wait);
    l.nodes.find(n => n.id === 'finish')!.position = { x: 1400, y: 0 };
    l.edges = l.edges.filter(e => e.source !== 'wait');
    connect(l, 'wait', 'out', 'wait-2', 'in');
    connect(l, 'wait-2', 'out', 'finish', 'in');
    connect(l, 'warehouse', 'blank', 'lathe-2', 'blank');
    connect(l, 'tool', 'tool', 'lathe-2', 'tool');
    connect(l, 'process-2', 'process', 'lathe-2', 'process');
    connect(l, 'lathe-2', 'machine', 'part-2', 'machine');
    connect(l, 'part-2', 'part', 'wait-2', 'part');
    connect(l, 'final-store', 'warehouse', 'wait-2', 'warehouse');
    l.grid.points.push({ id: 'point-lathe-2', x: 4, y: 0 }, { id: 'point-final', x: 6, y: 2 });
    l.placements.push({ nodeId: 'lathe-2', pointId: 'point-lathe-2' }, { nodeId: 'final-store', pointId: 'point-final' });
    for (const [id, action, text] of [['installed-hint', 'blank-installed', 'Заготовка установлена. Нажмите «Обработать».'], ['processed-hint', 'processing-finished', 'Участок готов. Выберите деталь и отправьте её на промежуточный склад.']]) {
        const after = makeNode('after', `${id}-event`, { x: -300, y: l.nodes.length * 40 }), hint = makeNode('hint', id, { x: -20, y: l.nodes.length * 40 });
        Object.assign(after.params, { action, objectId: 'lathe' });
        Object.assign(hint.params, { text, display: 'panel', confirm: true });
        l.nodes.push(after, hint);
        connect(l, after.id, 'event', hint.id, 'event');
    }
    return l;
}
