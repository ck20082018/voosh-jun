import {NODE_TYPES, type Level} from './level';
import {validateLevel} from './validation';
export const STORAGE_KEY='factory-level-v1';
interface StorageAdapter { getItem(key:string):string|null;setItem(key:string,value:string):void }
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const str=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=10000;
export function parseLevel(json:string,options:{allowIncomplete?:boolean}={}):Level {
  if(json.length>1_000_000)throw new Error('Файл слишком большой (максимум 1 МБ).');
  const v:unknown=JSON.parse(json);
  if(!object(v)||v.version!==1||!str(v.id)||!str(v.name)||!Array.isArray(v.nodes)||!Array.isArray(v.edges)||!Array.isArray(v.placements)||!object(v.grid)||!finite(v.grid.width)||!finite(v.grid.height))throw new Error('Некорректный формат уровня или версия.');
  if(v.nodes.length>100||v.edges.length>200||v.placements.length>100)throw new Error('Слишком много объектов.');
  for(const n of v.nodes)if(!object(n)||!str(n.id)||!NODE_TYPES.includes(n.type as typeof NODE_TYPES[number])||!object(n.position)||!finite(n.position.x)||!finite(n.position.y)||!object(n.params)||Object.values(n.params).some(p=>typeof p!=='string'&&!finite(p)))throw new Error('Некорректные данные ноды.');
  for(const n of v.nodes)if(object(n)&&n.size!==undefined&&(!object(n.size)||!finite(n.size.width)||!finite(n.size.height)||n.size.width<220||n.size.height<160||n.size.width>900||n.size.height>900))throw new Error('Некорректный размер ноды.');
  for(const e of v.edges)if(!object(e)||!['id','source','sourceHandle','target','targetHandle'].every(k=>str(e[k])))throw new Error('Некорректные данные связи.');
  for(const p of v.placements)if(!object(p)||!str(p.nodeId)||!finite(p.x)||!finite(p.y))throw new Error('Некорректное размещение.');
  const level=v as unknown as Level;
  if(!Number.isInteger(level.grid.width)||!Number.isInteger(level.grid.height)||level.grid.width<1||level.grid.height<1||level.grid.width>8||level.grid.height>8)throw new Error('Размер сетки: целые числа от 1 до 8.');
  const nodeIds=new Set(level.nodes.map(node=>node.id)),edgeIds=new Set(level.edges.map(edge=>edge.id));
  if(nodeIds.size!==level.nodes.length||edgeIds.size!==level.edges.length)throw new Error('Идентификаторы нод и связей должны быть уникальными.');
  if(!options.allowIncomplete){const errors=validateLevel(level);if(errors.length)throw new Error(errors.map(e=>e.message).join('\n'));}
  // Rebuild only definition fields; imported runtime state and unknown fields are discarded.
  return {version:1,id:level.id,name:level.name,nodes:level.nodes.map(n=>({id:n.id,type:n.type,position:{...n.position},params:{...n.params},...(n.size?{size:{...n.size}}:{})})),edges:level.edges.map(e=>({id:e.id,source:e.source,sourceHandle:e.sourceHandle,target:e.target,targetHandle:e.targetHandle})),grid:{...level.grid},placements:level.placements.map(p=>({nodeId:p.nodeId,x:p.x,y:p.y}))};
}
export function serializeLevel(level:Level):string {return JSON.stringify(level,null,2);}
export function saveLevel(storage:StorageAdapter,level:Level):void {
  const json=serializeLevel(level);parseLevel(json);storage.setItem(STORAGE_KEY,json);
}
export function saveDraft(storage:StorageAdapter,level:Level):void {const json=serializeLevel(level);parseLevel(json,{allowIncomplete:true});storage.setItem(STORAGE_KEY,json);}
export function loadLevel(storage:StorageAdapter):Level|null {const raw=storage.getItem(STORAGE_KEY);return raw?parseLevel(raw,{allowIncomplete:true}):null;}
