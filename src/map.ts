import { makeNode, type Level, type MapPoint } from './level';
export type MapChange = {
    level: Level;
    error?: undefined;
} | {
    level: Level;
    error: string;
};
const fail = (level: Level, error: string): MapChange => ({ level, error: `${error} Сначала переместите или снимите объекты.` });
export function setMapSize(level: Level, width: number, height: number): MapChange {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8 || height > 8)
        return { level, error: 'Размер карты: целые числа от 1 до 8.' };
    const removed = level.grid.points.filter(p => p.x >= width || p.y >= height);
    if (removed.some(p => level.placements.some(o => o.pointId === p.id)))
        return fail(level, 'Новые размеры затрагивают занятые точки.');
    // Preserve point IDs when a smaller rectangle needs to move free points inward.
    const points = level.grid.points.filter(p => !removed.includes(p));
    const capacity = width * height;
    const wanted = Math.min(level.grid.points.length, capacity);
    for (const old of removed) {
        if (points.length >= wanted)
            break;
        const cell = freeCells(width, height, points)[0];
        if (cell)
            points.push({ ...old, ...cell });
    }
    return { level: { ...level, grid: { width, height, points } } };
}
function freeCells(width: number, height: number, points: MapPoint[]) { const cells: {
    x: number;
    y: number;
}[] = []; for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
        if (!points.some(p => p.x === x && p.y === y))
            cells.push({ x, y }); return cells; }
export function setPointCount(level: Level, count: number): MapChange {
    if (!Number.isInteger(count) || count < 0 || count > level.grid.width * level.grid.height)
        return { level, error: 'Число точек: целое от 0 до площади карты.' };
    const points = [...level.grid.points];
    if (count < points.length) {
        const free = points.filter(p => !level.placements.some(o => o.pointId === p.id));
        if (points.length - count > free.length)
            return fail(level, 'Нельзя удалить занятые точки.');
        const remove = new Set(free.slice().reverse().slice(0, points.length - count).map(p => p.id));
        return { level: { ...level, grid: { ...level.grid, points: points.filter(p => !remove.has(p.id)) } } };
    }
    for (const cell of freeCells(level.grid.width, level.grid.height, points).slice(0, count - points.length))
        points.push({ id: crypto.randomUUID(), ...cell });
    return { level: { ...level, grid: { ...level.grid, points } } };
}
export function togglePoint(level: Level, x: number, y: number): MapChange {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= level.grid.width || y >= level.grid.height)
        return { level, error: 'Клетка находится за границей карты.' };
    const point = level.grid.points.find(p => p.x === x && p.y === y);
    if (point && level.placements.some(o => o.pointId === point.id))
        return fail(level, 'Точка занята.');
    const points = point ? level.grid.points.filter(p => p.id !== point.id) : [...level.grid.points, { id: crypto.randomUUID(), x, y }];
    return { level: { ...level, grid: { ...level.grid, points } } };
}
export function movePoint(level: Level, id: string, x: number, y: number): MapChange {
    const point = level.grid.points.find(p => p.id === id);
    if (!point)
        return { level, error: 'Точка отсутствует.' };
    if (level.placements.some(o => o.pointId === id))
        return fail(level, 'Точка занята.');
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= level.grid.width || y >= level.grid.height || level.grid.points.some(p => p.id !== id && p.x === x && p.y === y))
        return { level, error: 'Выберите свободную клетку карты.' };
    return { level: { ...level, grid: { ...level.grid, points: level.grid.points.map(p => p.id === id ? { ...p, x, y } : p) } } };
}
export function addMap(level: Level, id: string): Level { if (level.nodes.some(n => n.type === 'map'))
    return level; const next = { ...level, nodes: [...level.nodes, makeNode('map', id)] }; return setPointCount(next, Math.min(3, level.grid.width * level.grid.height)).level; }
