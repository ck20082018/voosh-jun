import {validDrawingDisplay} from './drawing/settings';
import { NODE_TYPES, type Level } from './level';
import { validateLevel } from './validation';
import { migrateV1, migrateV2,migrateV3,type LegacyV3Level, type LegacyV2Level, type LegacyLevel } from './migration';
import { MAX_JSON_BYTES, MAX_TOTAL_IMAGE_BYTES, validateImageData, decodeImage, type ImageDecoder } from './images';
export const STORAGE_KEY = 'factory-level-v4';
export const LEGACY_STORAGE_KEY = 'factory-level-v1';
export const V3_STORAGE_KEY='factory-level-v3';
export const V2_STORAGE_KEY = 'factory-level-v2';
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
    if (!object(v) || ![1, 2, 3, 4].includes(Number(v.version)) || !str(v.id) || !str(v.name) || !Array.isArray(v.nodes) || !Array.isArray(v.edges) || !Array.isArray(v.placements) || !object(v.grid) || !finite(v.grid.width) || !finite(v.grid.height))
        throw new Error('Некорректный формат уровня или версия.');
    if (v.version !== 1 && v.version !== 2 && v.version !== 3 && v.version !== 4)
        throw new Error('Неизвестная версия уровня.');
    if (v.nodes.length > 100 || v.edges.length > 200 || v.placements.length > 100)
        throw new Error('Слишком много объектов.');
    const types = v.version === 1 ? ['start', 'intro', 'blank', 'tool', 'turning', 'lathe', 'warehouse', 'task', 'wait', 'finish'] : v.version === 2 ? NODE_TYPES.filter(t => !['hint', 'after', 'map','catalog','table'].includes(t)) : v.version===3?NODE_TYPES.filter(t=>!['catalog','table'].includes(t)):NODE_TYPES;
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
        if (!object(p) || !str(p.nodeId) || (Number(v.version)>=3 ? !str(p.pointId) : !finite(p.x) || !finite(p.y)))
            throw new Error('Некорректное размещение.');
    if (new Set(v.nodes.map(n => (n as {
        id: string;
    }).id)).size !== v.nodes.length)
        throw new Error('Идентификаторы нод должны быть уникальными до миграции.');
    const level = v.version === 1 ? migrateV3(migrateV2(migrateV1(v as unknown as LegacyLevel))) : v.version === 2 ? migrateV3(migrateV2(v as unknown as LegacyV2Level)):v.version===3?migrateV3(v as unknown as LegacyV3Level):v as unknown as Level;
    if(level.drawing!==undefined&&!validDrawingDisplay(level.drawing))throw new Error('Некорректные настройки чертежа.');
    if(!['ready','player'].includes(level.productionMode)||!Array.isArray(level.groups)||level.groups.length>50)throw new Error('Некорректный режим или группы уровня.');
    for(const g of level.groups)if(!object(g)||g.groupId!==undefined||g.parentId!==undefined||g.collapsed!==undefined||!str(g.id)||!str(g.name)||typeof g.color!=='string'||!/^#[0-9a-f]{6}$/i.test(g.color)||!object(g.position)||!finite(g.position.x)||!finite(g.position.y)||!object(g.size)||!finite(g.size.width)||!finite(g.size.height)||g.size.width<200||g.size.height<140||g.size.width>10000||g.size.height>10000)throw new Error('Некорректная рамка группы.');
    if(new Set(level.groups.map(g=>g.id)).size!==level.groups.length||level.groups.some(g=>level.nodes.some(n=>n.id===g.id))||level.nodes.some(n=>n.groupId!==undefined&&(typeof n.groupId!=='string'||!level.groups.some(g=>g.id===n.groupId))))throw new Error('Некорректная принадлежность к группе.');
    if (!Array.isArray(level.grid.points) || level.grid.points.length > 64 || level.grid.points.some(p => !object(p) || !str(p.id) || !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= level.grid.width || p.y >= level.grid.height) || new Set(level.grid.points.map(p => p.id)).size !== level.grid.points.length || new Set(level.grid.points.map(p => `${p.x},${p.y}`)).size !== level.grid.points.length)
        throw new Error('Некорректные точки карты.');
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
    return { ...(level.drawing?{drawing:structuredClone(level.drawing)}:{}), version: 4,productionMode:level.productionMode,groups:level.groups.map(g=>({id:g.id,name:g.name,color:g.color,position:{...g.position},size:{...g.size}})), id: level.id, name: level.name, nodes: level.nodes.map(n => ({ id: n.id, type: n.type, position: { ...n.position }, params: structuredClone(n.params),...(n.groupId?{groupId:n.groupId}:{}), ...(n.size ? { size: { ...n.size } } : {}) })), edges: level.edges.map(e => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle })), grid: { ...level.grid, points: level.grid.points.map(p => ({ id: p.id, x: p.x, y: p.y })) }, placements: level.placements.map(p => ({ nodeId: p.nodeId, pointId: p.pointId })) };
}
// Browser entry points use this before installing a project, so corrupt raster payloads cannot enter it.
export async function checkLevelImages(level: Level, decoder?: ImageDecoder): Promise<void> {
    for (const n of level.nodes)
        if (n.type === 'intro' && n.params.image)
            await decodeImage(String(n.params.image), decoder);
}
export async function parseLevelWithImages(json: string, decoder?: ImageDecoder): Promise<Level> { const level = parseLevel(json); await checkLevelImages(level, decoder); return level; }
export function serializeLevel(level: Level): string { return JSON.stringify(level, null, 2); }
function write(storage: StorageAdapter, level: Level, allowIncomplete: boolean) {
    const json = serializeLevel(level);
    parseLevel(json, { allowIncomplete });
    try {
        storage.setItem(STORAGE_KEY, json);
    }
    catch {
        throw new Error('Недостаточно места в localStorage или сохранение запрещено. Текущий проект сохранён в редакторе; экспортируйте JSON.');
    }
}
export function saveLevel(storage: StorageAdapter, level: Level) { write(storage, level, false); }
export function saveDraft(storage: StorageAdapter, level: Level) { write(storage, level, true); }
export function loadLevel(storage: StorageAdapter): Level | null { const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(V3_STORAGE_KEY) ?? storage.getItem(V2_STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY); return raw ? parseLevel(raw, { allowIncomplete: true }) : null; }
