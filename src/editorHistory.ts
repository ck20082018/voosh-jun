import type {Level} from './level';
export interface EditorHistory {level:Level;past:Level[];future:Level[];group:number|null}
export function createHistory(level:Level):EditorHistory{return {level:structuredClone(level),past:[],future:[],group:null};}
export function editHistory(history:EditorHistory,next:Level,group:number|null):EditorHistory{
 if(next===history.level||JSON.stringify(next)===JSON.stringify(history.level))return history;
 const joined=group!==null&&group===history.group;
 return {level:next,future:[],past:joined?history.past:[...history.past,structuredClone(history.level)].slice(-50),group};
}
export function undoHistory(history:EditorHistory):EditorHistory{
 const previous=history.past.at(-1);return previous?{level:previous,past:history.past.slice(0,-1),future:[structuredClone(history.level),...history.future].slice(0,50),group:null}:history;
}

export function endHistory(history:EditorHistory):EditorHistory{
 if(history.group===null)return history;
 const previous=history.past.at(-1);
 const unchanged=previous&&JSON.stringify(previous)===JSON.stringify(history.level);
 return {...history,past:unchanged?history.past.slice(0,-1):history.past,group:null};
}

export function redoHistory(history:EditorHistory):EditorHistory{
 const next=history.future[0];return next?{level:next,past:[...history.past,structuredClone(history.level)].slice(-50),future:history.future.slice(1),group:null}:history;
}
