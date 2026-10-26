import {Fragment,useEffect,useId,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import type {NodeKind} from './level';
import {searchNodeTypes,type NodeAddResult} from './nodeSearch';

export function isNodeSearchBackground(target:Element):boolean{
  if(target.closest('.react-flow__node:not(.react-flow__node-frame),.group-heading,.react-flow__resize-control,.react-flow__handle,.react-flow__edge,.react-flow__edgelabel-renderer,.react-flow__panel,.react-flow__controls,.react-flow__minimap,.node-search,button,input,textarea,select,a,[contenteditable],[role="button"]'))return false;
  return !!target.closest('.react-flow__pane,.react-flow__node-frame');
}
interface Props {anchor:{x:number;y:number};host:RefObject<HTMLDivElement|null>;recent:readonly NodeKind[];onAdd:(type:NodeKind)=>NodeAddResult;onClose:()=>void;onExisting:(id:string)=>void}
export function NodeSearch({anchor,host,recent,onAdd,onClose,onExisting}:Props){
  const [query,setQuery]=useState(''),[active,setActive]=useState(0),[error,setError]=useState<Extract<NodeAddResult,{ok:false}>|null>(null);
  const panel=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null),submitted=useRef(false);
  const [position,setPosition]=useState({...anchor,maxHeight:400,maxWidth:360});
  const id=useId(),results=searchNodeTypes(query,recent),selected=results[active];
  useLayoutEffect(()=>{input.current?.focus();},[]);
  useLayoutEffect(()=>{
    const place=()=>{const container=host.current,element=panel.current;if(!container||!element)return;
      const rect=container.getBoundingClientRect();
      const left=Math.max(0,-rect.left),right=Math.min(container.clientWidth,window.innerWidth-rect.left);
      const top=Math.max(0,-rect.top),bottom=Math.min(container.clientHeight,window.innerHeight-rect.top);
      const maxHeight=Math.max(1,Math.min(480,bottom-top-16)),maxWidth=Math.max(1,Math.min(360,right-left-16));
      setPosition({x:Math.max(left+8,Math.min(anchor.x,right-Math.min(element.offsetWidth,maxWidth)-8)),y:Math.max(top+8,Math.min(anchor.y,bottom-Math.min(element.offsetHeight,maxHeight)-8)),maxHeight,maxWidth});};
    place();const observer=new ResizeObserver(place);if(host.current)observer.observe(host.current);if(panel.current)observer.observe(panel.current);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[anchor,host]);
  useEffect(()=>{panel.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({block:'nearest'});},[active,query]);
  useEffect(()=>{const outside=(e:MouseEvent)=>{if(!panel.current?.contains(e.target as Node))onClose();};document.addEventListener('mousedown',outside,true);return()=>document.removeEventListener('mousedown',outside,true);},[onClose]);
  function add(type:NodeKind){
    if(submitted.current)return;submitted.current=true;
    const result=onAdd(type);
    if(result.ok)onClose();else{setError(result);submitted.current=false;input.current?.focus();}
  }
  return <div className="node-search nodrag nopan nowheel" ref={panel} role="dialog" aria-label="Найти ноду" style={{left:position.x,top:position.y,maxHeight:position.maxHeight,maxWidth:position.maxWidth}}
    onMouseDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyUp={e=>e.stopPropagation()} onKeyDown={e=>{
      e.stopPropagation();
      if(e.key==='Escape'){e.preventDefault();onClose();return;}
      if(e.nativeEvent.isComposing)return;
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setActive(i=>results.length?(i+(e.key==='ArrowDown'?1:-1)+results.length)%results.length:0);}
      if(e.key==='Enter'&&!(e.target as Element).closest('button')){e.preventDefault();if(selected&&!e.repeat)add(selected.type);}
    }}>
    <div className="node-search-heading"><strong>Найти ноду</strong><button type="button" aria-label="Закрыть поиск нод" onClick={onClose}>×</button></div>
    <label className="node-search-label" htmlFor={`${id}-input`}>Название, назначение или тип</label>
    <input ref={input} id={`${id}-input`} role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-list`} aria-activedescendant={selected?`${id}-${selected.type}`:undefined} autoComplete="off" value={query} onChange={e=>{setQuery(e.target.value);setActive(0);setError(null);}}/>
    <div className="node-search-results" role="listbox" id={`${id}-list`} aria-label="Типы нод">
      {results.map((r,i)=>{const section=r.recent?'Недавние':r.category;const previous=results[i-1];const previousSection=previous?(previous.recent?'Недавние':previous.category):null;
        return <Fragment key={r.type}>{!query.trim()&&section!==previousSection&&<div className="node-search-category" role="presentation">{section}</div>}
          <button type="button" role="option" id={`${id}-${r.type}`} aria-selected={i===active} tabIndex={-1} className="node-search-result" onClick={()=>add(r.type)}>
            <strong>{r.title}</strong><small>{r.category}</small><span>{r.description}</span>
          </button></Fragment>;})}
    </div>
    {!results.length&&<p role="status">Ничего не найдено. <button onClick={()=>{setQuery('');setActive(0);input.current?.focus();}}>Очистить запрос</button></p>}
    {error&&<div role="alert"><p>{error.message}</p>{error.existingId&&<button onClick={()=>{onExisting(error.existingId!);onClose();}}>Перейти к существующей ноде</button>}</div>}
    <small className="node-search-help">↑ ↓ — выбор · Enter — добавить · Esc — закрыть</small>
  </div>;
}
