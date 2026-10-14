import type { Level, NodeGroup } from './level';
// Both group.position and node.position are absolute graph coordinates in the saved definition.
export function groupNodes(level: Level, ids: string[], id: string = crypto.randomUUID(), name = 'Новая группа', color = '#99bfb4'): Level {
    const nodes = level.nodes.filter(n => ids.includes(n.id));
    if (level.groups.length >= 50 || nodes.length < 2 || nodes.some(n => n.groupId) || level.groups.some(g => g.id === id) || level.nodes.some(n => n.id === id))
        return level;
    const x = Math.min(...nodes.map(n => n.position.x)) - 30, y = Math.min(...nodes.map(n => n.position.y)) - 50;
    const width = Math.max(...nodes.map(n => n.position.x + (n.size?.width ?? 230))) - x + 30, height = Math.max(...nodes.map(n => n.position.y + (n.size?.height ?? 200))) - y + 30;
    const group: NodeGroup = { id, name, color, position: { x, y }, size: { width, height } };
    return { ...level, groups: [...level.groups, group], nodes: level.nodes.map(n => ids.includes(n.id) ? { ...n, groupId: id } : n) };
}
export function moveGroup(level: Level, id: string, position: {
    x: number;
    y: number;
}): Level {
    const group = level.groups.find(g => g.id === id);
    if (!group)
        return level;
    const dx = position.x - group.position.x, dy = position.y - group.position.y;
    return { ...level, groups: level.groups.map(g => g.id === id ? { ...g, position: { ...position } } : g), nodes: level.nodes.map(n => n.groupId === id ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n) };
}
export function setGroupMember(level: Level, nodeId: string, groupId: string | null): Level {
    if (groupId && !level.groups.some(g => g.id === groupId))
        return level;
    return { ...level, nodes: level.nodes.map(n => { if (n.id !== nodeId)
            return n; const { groupId: _old, ...rest } = n; return groupId ? { ...rest, groupId } : rest; }) };
}
export function ungroup(level: Level, id: string): Level { return { ...level, groups: level.groups.filter(g => g.id !== id), nodes: level.nodes.map(n => n.groupId === id ? (({ groupId: _old, ...rest }) => rest)(n) : n) }; }
export function groupErrors(level: Level): string[] {
    const errors: string[] = [];
    if (level.groups.length > 50)
        errors.push('Не больше 50 групп в уровне.');
    const ids = new Set<string>();
    for (const g of level.groups) {
        if (('groupId' in g) || ('parentId' in g) || ('collapsed' in g))
            errors.push('Вложенные и свёрнутые группы не поддерживаются.');
        if (ids.has(g.id) || level.nodes.some(n => n.id === g.id))
            errors.push('ID группы должен быть уникальным и отличаться от ID нод.');
        ids.add(g.id);
        if (!g.name.trim() || !/^#[0-9a-f]{6}$/i.test(g.color) || !Number.isFinite(g.position.x) || !Number.isFinite(g.position.y) || !Number.isFinite(g.size.width) || !Number.isFinite(g.size.height) || g.size.width < 200 || g.size.height < 140 || g.size.width > 10000 || g.size.height > 10000)
            errors.push('Группа: название, цвет #RRGGBB и корректная рамка обязательны.');
    }
    for (const n of level.nodes)
        if (n.groupId && !ids.has(n.groupId))
            errors.push('Нода ссылается на отсутствующую группу.');
    return errors;
}
