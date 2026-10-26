import {useCallback,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import type {Level} from './level';
import {createHistory,editHistory,undoHistory,redoHistory,endHistory} from './editorHistory';
export function useEditorHistory(initial:Level){
 const [history,setHistory]=useState(()=>createHistory(initial));
 const group=useRef<number|null>(null),sequence=useRef(0);
 const begin=useCallback(()=>{group.current=++sequence.current;},[]);
 const beginField=useCallback(()=>{if(group.current===null)group.current=++sequence.current;},[]);
 const end=useCallback(()=>{group.current=null;setHistory(endHistory);},[]);
 const setLevel:Dispatch<SetStateAction<Level>>=useCallback(update=>{
  const transaction=group.current;
  setHistory(current=>editHistory(current,typeof update==='function'?update(current.level):update,transaction));
 },[]);
 const undo=useCallback(()=>{group.current=null;setHistory(undoHistory);},[]);
 const redo=useCallback(()=>{group.current=null;setHistory(redoHistory);},[]);
 const reset=useCallback((level:Level)=>{group.current=null;setHistory(createHistory(level));},[]);
 return {level:history.level,setLevel,undo,redo,reset,begin,beginField,end,canUndo:history.past.length>0,canRedo:history.future.length>0};
}
