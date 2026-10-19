import { sourceNode, registry, type Level, type LevelNode, type AllowedOperation } from './level';
export interface CatalogIssue {
    nodeId?: string;
    message: string;
}
export function catalogReferences(node: LevelNode, key: 'blankIds' | 'machineIds' | 'toolIds'): string[] { return Array.isArray(node.params[key]) ? node.params[key] as string[] : []; }
export function allowedOperations(node: LevelNode): AllowedOperation[] { return Array.isArray(node.params.allowedOperations) ? node.params.allowedOperations as AllowedOperation[] : []; }
export function catalogErrors(level: Level): CatalogIssue[] {
    const issues: CatalogIssue[] = [];
    const add = (message: string, nodeId?: string) => issues.push({ message, nodeId });
    const catalogs = level.nodes.filter(n => n.type === 'catalog');
    if (catalogs.length !== 1) {
        add('Режим «План игрока» требует ровно один каталог.');
        return issues;
    }
    const c = catalogs[0];
    for (const [key, type] of [['blankIds', 'blank'], ['machineIds', 'lathe'], ['toolIds', 'tool']] as const) {
        const ids = catalogReferences(c, key);
        if (ids.length < 1 || ids.length > 5)
            add('Каталог: от 1 до 5 вариантов каждой категории.', c.id);
        if (new Set(ids).size !== ids.length)
            add('Каталог содержит повторную ссылку.', c.id);
        for (const id of ids)
            if (typeof id !== 'string' || !level.nodes.some(n => n.id === id && n.type === type))
                add(`Каталог: отсутствует или неверен вариант «${id}».`, c.id);
        for (const n of level.nodes.filter(n => n.type === type))
            if (!ids.includes(n.id))
                add('Определение варианта не включено в каталог.', n.id);
    }
    const ops = allowedOperations(c);
    if (!ops.length || ops.length > 2 || new Set(ops.map(o => o?.kind)).size !== ops.length)
        add('Укажите уникальный список разрешённых операций.', c.id);
    for (const o of ops)
        if (!o || !['turning', 'milling'].includes(o.kind) || typeof o.seconds !== 'number' || !Number.isFinite(o.seconds * 1000) || o.seconds <= 0)
            add('Доступные операции: точение/фрезерование и положительная длительность.', c.id);
    for (const type of ['table', 'warehouse', 'part', 'task', 'wait'])
        if (level.nodes.filter(n => n.type === type).length !== 1)
            add(`План игрока: требуется один объект «${registry[type as keyof typeof registry].title}».`);
    const part = level.nodes.find(n => n.type === 'part'), w = level.nodes.find(n => n.type === 'wait');
    if (sourceNode(level, part, 'catalog')?.id !== c.id)
        add('Подключите каталог к требованиям полученной детали.', part?.id);
    if (w && sourceNode(level, w, 'part')?.id !== part?.id)
        add('Ожидание должно проверять авторские требования детали.', w.id);
    const warehouse = level.nodes.find(n => n.type === 'warehouse');
    if (warehouse?.params.mode !== 'final')
        add('В свободном плане используется конечный склад.', warehouse?.id);
    if (level.nodes.some(n => n.type === 'process'))
        add('В режиме «План игрока» техпроцесс задаёт игрок, уберите готовый техпроцесс.');
    for (const n of level.nodes.filter(n => n.type === 'check'))
        if (['checkMachine', 'checkTool', 'checkBlank', 'checkProcess'].some(k => n.params[k] === true))
            add('Свободный план оценивается по фактической детали, не по единственному авторскому маршруту.', n.id);
    if (level.placements.some(p => level.nodes.some(n => n.id === p.nodeId && ['blank', 'lathe', 'tool'].includes(n.type))))
        add('Каталожные определения не размещаются как физические объекты.');
    const fixed = new Set(level.placements.map(p => p.pointId));
    if (!level.grid.points.some(p => !fixed.has(p.id)))
        add('Оставьте свободную точку для выбранного станка.');
    return issues;
}
