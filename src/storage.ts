import { NODE_TYPES, type Level } from './level';
import { validateLevel } from './validation';
import { migrateV1, type LegacyLevel } from './migration';
import { MAX_JSON_BYTES, MAX_TOTAL_IMAGE_BYTES, validateImageData, decodeImage, type ImageDecoder } from './images';
export const STORAGE_KEY = 'factory-level-v2';
export const LEGACY_STORAGE_KEY = 'factory-level-v1';
interface StorageAdapter {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 10000;
function jsonValue(v: unknown, depth = 0): boolean { return depth < 8 && (typeof v === 'string' && v.length <= MAX_JSON_BYTES || typeof v === 'boolean' || finite(v) || Array.isArray(v) && v.length <= 100 && v.every(x => jsonValue(x, depth + 1)) || object(v) && Object.keys(v).length <= 50 && Object.entries(v).every(([k, x]) => !['__proto__', 'constructor', 'prototype'].includes(k) && jsonValue(x, depth + 1))); }
export function parseLevel(json: string, options: {
    allowIncomplete?: boolean;
} = {}): Level {
    if (new TextEncoder().encode(json).length > MAX_JSON_BYTES)
        throw new Error('Файл слишком большой: максимум 2 МиБ JSON.');
    let v: unknown;
    try {
        v = JSON.parse(json);
    }
    catch {
        throw new Error('Некорректный JSON.');
    }
    if (!object(v) || ![1, 2].includes(Number(v.version)) || !str(v.id) || !str(v.name) || !Array.isArray(v.nodes) || !Array.isArray(v.edges) || !Array.isArray(v.placements) || !object(v.grid) || !finite(v.grid.width) || !finite(v.grid.height))
        throw new Error('Некорректный формат уровня или версия.');
    if (v.version !== 1 && v.version !== 2)
        throw new Error('Неизвестная версия уровня.');
    if (v.nodes.length > 100 || v.edges.length > 200 || v.placements.length > 100)
        throw new Error('Слишком много объектов.');
    const types = v.version === 1 ? ['start', 'intro', 'blank', 'tool', 'turning', 'lathe', 'warehouse', 'task', 'wait', 'finish'] : NODE_TYPES;
    for (const n of v.nodes) {
        if (!object(n) || !str(n.id) || !types.includes(n.type as never) || !object(n.position) || !finite(n.position.x) || !finite(n.position.y) || !object(n.params) || !jsonValue(n.params))
            throw new Error('Некорректные данные ноды.');
        if (n.size !== undefined && (!object(n.size) || !finite(n.size.width) || !finite(n.size.height) || n.size.width < 220 || n.size.height < 160 || n.size.width > 900 || n.size.height > 900))
            throw new Error('Некорректный размер ноды редактора.');
    }
    for (const e of v.edges)
        if (!object(e) || !['id', 'source', 'sourceHandle', 'target', 'targetHandle'].every(k => str(e[k])))
            throw new Error('Некорректные данные связи.');
    for (const p of v.placements)
        if (!object(p) || !str(p.nodeId) || !finite(p.x) || !finite(p.y))
            throw new Error('Некорректное размещение.');
    if(new Set(v.nodes.map(n=>(n as {id:string}).id)).size!==v.nodes.length)throw new Error('Идентификаторы нод должны быть уникальными до миграции.');
    const level = v.version === 1 ? migrateV1(v as unknown as LegacyLevel) : v as unknown as Level;
    if (!Number.isInteger(level.grid.width) || !Number.isInteger(level.grid.height) || level.grid.width < 1 || level.grid.height < 1 || level.grid.width > 8 || level.grid.height > 8)
        throw new Error('Размер сетки: целые числа от 1 до 8.');
    if (new Set(level.nodes.map(n => n.id)).size !== level.nodes.length || new Set(level.edges.map(e => e.id)).size !== level.edges.length)
        throw new Error('Идентификаторы нод и связей должны быть уникальными.');
    let total = 0;
    for (const n of level.nodes) {
        if (n.type === 'intro' && n.params.image) {
            if (typeof n.params.image !== 'string')
                throw new Error('Некорректное изображение.');
            total += validateImageData(n.params.image).bytes;
        }
    }
    if (total > MAX_TOTAL_IMAGE_BYTES)
        throw new Error('Изображения уровня: максимум 1 МиБ суммарно.');
    if (!options.allowIncomplete) {
        const errors = validateLevel(level);
        if (errors.length)
            throw new Error(errors.map(e => e.message).join('\n'));
    }
    return { version: 2, id: level.id, name: level.name, nodes: level.nodes.map(n => ({ id: n.id, type: n.type, position: { ...n.position }, params: structuredClone(n.params), ...(n.size ? { size: { ...n.size } } : {}) })), edges: level.edges.map(e => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })), grid: { ...level.grid }, placements: level.placements.map(p => ({ nodeId: p.nodeId, x: p.x, y: p.y })) };
}
// Browser entry points use this before installing a project, so corrupt raster payloads cannot enter it.
export async function checkLevelImages(level: Level, decoder?: ImageDecoder): Promise<void> { for (const n of level.nodes)
    if (n.type === 'intro' && n.params.image)
        await decodeImage(String(n.params.image), decoder); }
export async function parseLevelWithImages(json: string, decoder?: ImageDecoder): Promise<Level> { const level = parseLevel(json); await checkLevelImages(level, decoder); return level; }
export function serializeLevel(level: Level): string { return JSON.stringify(level, null, 2); }
function write(storage: StorageAdapter, level: Level, allowIncomplete: boolean) { const json = serializeLevel(level); parseLevel(json, { allowIncomplete }); try {
    storage.setItem(STORAGE_KEY, json);
}
catch {
    throw new Error('Недостаточно места в localStorage или сохранение запрещено. Текущий проект сохранён в редакторе; экспортируйте JSON.');
} }
export function saveLevel(storage: StorageAdapter, level: Level) { write(storage, level, false); }
export function saveDraft(storage: StorageAdapter, level: Level) { write(storage, level, true); }
export function loadLevel(storage: StorageAdapter): Level | null { const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY); return raw ? parseLevel(raw, { allowIncomplete: true }) : null; }
