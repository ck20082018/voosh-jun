import {registry,type NodeKind,type Level} from './level';

export const NODE_RECENTS_KEY='factory-editor-recent-node-types-v1';
export const normalizeNodeQuery=(value:string)=>value.toLocaleLowerCase('ru').replace(/ё/g,'е').trim().replace(/\s+/g,' ');
export interface NodeSearchResult {type:NodeKind;title:string;category:string;description:string;recent:boolean}
export function searchNodeTypes(query:string,recent:readonly NodeKind[]=[]):NodeSearchResult[]{
  const q=normalizeNodeQuery(query),words=q.split(' ');
  return (Object.entries(registry) as [NodeKind,typeof registry[NodeKind]][]).map(([type,d])=>{
    const title=normalizeNodeQuery(d.title),text=normalizeNodeQuery([d.title,d.description,type,...d.synonyms??[]].join(' '));
    const rank=title===q?0:title.startsWith(q)?1:words.every(w=>title.includes(w))?2:3;
    return {type,title:d.title,category:d.category,description:d.description,recent:!q&&recent.includes(type),rank,text};
  }).filter(r=>!q||words.every(w=>r.text.includes(w))).sort((a,b)=>{
    if(q)return a.rank-b.rank||a.title.localeCompare(b.title,'ru');
    if(a.recent||b.recent)return a.recent&&b.recent?recent.indexOf(a.type)-recent.indexOf(b.type):a.recent?-1:1;
    return a.category.localeCompare(b.category,'ru')||a.title.localeCompare(b.title,'ru');
  }).map(({rank:_rank,text:_text,...result})=>result);
}
interface PreferencesStorage {getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void}
const isType=(type:unknown):type is NodeKind=>typeof type==='string'&&Object.hasOwn(registry,type);
export function loadRecentNodeTypes(storage:PreferencesStorage|null):NodeKind[]{
  try{const value:unknown=JSON.parse(storage?.getItem(NODE_RECENTS_KEY)??'[]');return Array.isArray(value)?[...new Set(value.filter(isType))].slice(0,5):[];}catch{return [];}
}
export function rememberNodeType(recent:readonly NodeKind[],type:NodeKind,storage:PreferencesStorage|null):NodeKind[]{
  const next=[type,...recent.filter(t=>t!==type)].slice(0,5);
  try{storage?.setItem(NODE_RECENTS_KEY,JSON.stringify(next));}catch{/* preferences are optional */}
  return next;
}
export function groupAtPoint(level:Level,point:{x:number;y:number}):string|undefined{
  // Overlapping frames are not nested: prefer the smallest enclosing frame.
  return level.groups.filter(g=>point.x>=g.position.x&&point.x<=g.position.x+g.size.width&&point.y>=g.position.y+36&&point.y<=g.position.y+g.size.height)
    .sort((a,b)=>a.size.width*a.size.height-b.size.width*b.size.height)[0]?.id;
}
export type NodeAddResult={ok:true}|{ok:false;message:string;existingId?:string};
