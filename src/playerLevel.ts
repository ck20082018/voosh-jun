import { emptyLevel, makeNode, connect, type Level, type NodeKind } from './level';
import { groupNodes } from './groups';
export function toyAxleLevel(): Level {
    let level = emptyLevel();
    level.id = 'toy-car-axle';
    level.name = 'Ось для игрушечной машинки';
    level.productionMode = 'player';
    const add = (type: NodeKind, id: string, x: number, y: number, params: Record<string, string | number | boolean> = {}) => { const node = makeNode(type, id, { x, y }); Object.assign(node.params, params); level.nodes.push(node); return node; };
    add('start', 'start', 0, 0);
    add('intro', 'intro', 280, 0, { title: 'Ось для игрушечной машинки', text: 'Колёса должны свободно вращаться на тонких концах оси. Изготовьте стальную ось длиной 60 мм: оставьте 20 мм диаметром 20 мм, затем сделайте участок Ø12 × 20 мм и участок Ø8 × 20 мм. Выберите подходящую заготовку, станок и инструмент. Размеры проверяются у реальной детали на складе.' });
    add('task', 'task', 560, 0, { title: 'Изготовьте стальную ось', instruction: 'Спланируйте продольное точение двух последовательных участков, установите заготовку, выполните операции и передайте ось на склад.' });
    add('catalog', 'catalog', 280, 360).params = { blankIds: ['steel-small', 'steel-stock', 'aluminium-stock'], machineIds: ['lathe-choice', 'mill-choice'], toolIds: ['passing-choice', 'facing-choice', 'face-choice'], allowedOperations: [{ kind: 'turning', seconds: 2 }, { kind: 'milling', seconds: 3 }] };
    add('blank', 'steel-small', 0, 660, { name: 'Тонкая стальная заготовка', diameter: 10 });
    add('blank', 'steel-stock', 280, 660, { name: 'Стальная заготовка Ø20', diameter: 20 });
    add('blank', 'aluminium-stock', 560, 660, { name: 'Алюминиевая заготовка Ø20', material: 'Алюминий', diameter: 20 });
    add('lathe', 'lathe-choice', 0, 960, { name: 'Токарный станок', kind: 'lathe' });
    add('lathe', 'mill-choice', 280, 960, { name: 'Фрезерный станок', kind: 'mill' });
    add('tool', 'passing-choice', 0, 1260);
    add('tool', 'facing-choice', 280, 1260, { name: 'Подрезной резец', kind: 'facing' });
    add('tool', 'face-choice', 560, 1260, { name: 'Торцевая фреза', category: 'milling', kind: 'face' });
    add('part', 'requirements', 920, 360, { name: 'Стальная ось', diameter: 20, length: 60 }).params.sections = [{ diameter: 12, length: 20 }, { diameter: 8, length: 20 }];
    add('wait', 'wait', 920, 0);
    add('finish', 'finish', 1200, 0, { text: 'Ось соответствует заданию! Колёса игрушечной машинки можно установить.' });
    add('table', 'table', 920, 660);
    add('warehouse', 'warehouse', 1200, 660, { name: 'Склад готовых осей' });
    add('map', 'map', 1200, 960);
    for (const [s, t] of [['start', 'intro'], ['intro', 'task'], ['task', 'wait'], ['wait', 'finish']])
        connect(level, s, 'out', t, 'in');
    connect(level, 'catalog', 'catalog', 'requirements', 'catalog');
    connect(level, 'requirements', 'part', 'wait', 'part');
    connect(level, 'warehouse', 'warehouse', 'wait', 'warehouse');
    level.grid.points = [{ id: 'table-point', x: 0, y: 2 }, { id: 'store-point', x: 4, y: 2 }, { id: 'machine-point', x: 2, y: 2 }, { id: 'machine-alternative', x: 2, y: 0 }];
    level.placements = [{ nodeId: 'table', pointId: 'table-point' }, { nodeId: 'warehouse', pointId: 'store-point' }];
    for (const [i, action, text] of [['install', 'blank-installed', 'Заготовка закреплена. Выполняйте операции по порядку: новый участок начинается после предыдущего.'], ['process', 'processing-finished', 'Участок готов. Если есть следующая операция, запускайте её; после последней выберите ось и склад.'], ['store', 'part-stored', 'Результат изготовленной оси сравнивается с требованиями. При ошибке измените план и попробуйте снова.']]) {
        add('after', `after-${i}`, -580, Number(i === 'install' ? 0 : i === 'process' ? 300 : 600), { action });
        add('hint', `hint-${i}`, -300, Number(i === 'install' ? 0 : i === 'process' ? 300 : 600), { text, confirm: false, frequency: 'each' });
        connect(level, `after-${i}`, 'event', `hint-${i}`, 'event');
    }
    level = groupNodes(level, ['start', 'intro', 'task'], 'intro-group', 'Вступление', '#c9b67f');
    level = groupNodes(level, ['catalog', 'steel-small', 'steel-stock', 'aluminium-stock', 'lathe-choice', 'mill-choice', 'passing-choice', 'facing-choice', 'face-choice'], 'catalog-group', 'Каталог', '#99bfb4');
    level = groupNodes(level, ['requirements', 'wait', 'finish'], 'result-group', 'Проверка результата', '#8daebb');
    return level;
}
