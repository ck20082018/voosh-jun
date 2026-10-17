import {lazy,Suspense,useCallback,useMemo,useRef,useState} from 'react';
import type {Edge,ReactFlowInstance} from '@xyflow/react';
import {registry,NODE_TYPES,exampleLevel,welcomeLevel,twoOperationsLevel,emptyLevel,deleteNodes,placeObject,type Level,type NodeKind} from './level';
import {validateLevel,type Issue} from './validation';
import {compileLevel} from './compiler';
import {loadLevel,saveDraft,parseLevel,serializeLevel} from './storage';
const Workshop=lazy(()=>import('./Workshop').then(module=>({default:module.Workshop})));
function SceneLoading(){return <div className="scene-loading">Загрузка цеха…</div>;}

import {addEditorNode,type FlowNode} from './editorFlow';
import {GraphEditor} from './GraphEditor';
import {MissionScreen} from './screens/MissionScreen';
import {Icon} from './ui/Icon';
function initialProject():{level:Level;notice:string}{try{return {level:loadLevel(localStorage)??exampleLevel(),notice:''};}catch(error){return {level:exampleLevel(),notice:`Сохранение не загружено: ${message(error)}`};}}
function message(error:unknown){return error instanceof Error?error.message:String(error);}
export function EditorApp(){
  const [initial]=useState(initialProject);
  const [level,setLevel]=useState<Level>(initial.level);
  const [notice,setNotice]=useState(initial.notice);
  const [selected,setSelected]=useState<string|null>(null);
  const [focusNodeId,setFocusNodeId]=useState<string|null>(null);
  const [addType,setAddType]=useState<NodeKind>('blank');
  const [graphRevision,setGraphRevision]=useState(0);
  const [tab,setTab]=useState<'graph'|'map'>('graph');
  const [checked,setChecked]=useState(false);
  const [run,setRun]=useState<{level:Level;nonce:number}|null>(null);
  const importInput=useRef<HTMLInputElement>(null);
  const flow=useRef<ReactFlowInstance<FlowNode,Edge>|null>(null);
  const errors=useMemo(()=>validateLevel(level),[level]);
  const node=level.nodes.find(n=>n.id===selected);
  const setFlowInstance=useCallback((instance:ReactFlowInstance<FlowNode,Edge>|null)=>{flow.current=instance;},[]);
  function addNode(type:NodeKind,position?:{x:number;y:number}){
    const bounds=document.querySelector('.flow-host')?.getBoundingClientRect();
    const center=bounds&&tab==='graph'&&flow.current?flow.current.screenToFlowPosition({x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2}):{x:315,y:240};
    const desired=position??{x:center.x-115,y:center.y-70};
    const id=crypto.randomUUID();
    setLevel(current=>addEditorNode(current,type,id,desired));
    setSelected(id);setFocusNodeId(id);setTab('graph');setNotice(`Добавлена нода «${registry[type].title}». Настройте параметры справа и соедините порты.`);
  }
  function start(){setChecked(true);if(errors.length){setNotice('Исправьте ошибки перед запуском.');return;}try{compileLevel(structuredClone(level));setRun({level:structuredClone(level),nonce:Date.now()});setNotice('');}catch(error){setNotice(message(error));}}
  function focusIssue(issue:Issue){if(!issue.nodeId)return;setSelected(issue.nodeId);setTab('graph');const n=level.nodes.find(n=>n.id===issue.nodeId);if(n)flow.current?.setCenter(n.position.x+115,n.position.y+60,{zoom:1,duration:300});}
  function replace(next:Level){setLevel(next);setSelected(null);setFocusNodeId(null);setGraphRevision(value=>value+1);setTab('graph');setChecked(false);setNotice('');}
  function exportJSON(){
    const url=URL.createObjectURL(new Blob([serializeLevel(level)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`${level.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`;a.click();URL.revokeObjectURL(url);setNotice('JSON экспортирован.');
  }
  function updateParameter(key:string,value:string|number){if(!node)return;setLevel({...level,nodes:level.nodes.map(n=>n.id===node.id?{...n,params:{...n.params,[key]:value}}:n)});}
  if(run)return <MissionScreen key={run.nonce} level={run.level} mode="test" title={run.level.name} eyebrow="Тестовый запуск" onExit={()=>setRun(null)} />;
  return <main className="admin-app theme-paper">
    <header className="app-header"><div><span className="eyebrow">Для организаторов</span><h1 className="t-h2">Редактор заданий</h1><p className="muted">Граф сценария, карта цеха, проверка и тестовый запуск. Сохранение, импорт и экспорт выполняются локально.</p></div></header>
    <div className="toolbar"><input className="level-name" aria-label="Название уровня" value={level.name} onChange={e=>setLevel({...level,name:e.target.value})} /><div className="toolbar-actions">
      <button onClick={()=>replace(emptyLevel())}>Новый уровень</button><button onClick={()=>replace(exampleLevel())}>Пример</button><button onClick={()=>replace(welcomeLevel())}>Приветствие</button><button onClick={()=>replace(twoOperationsLevel())}>2 операции</button><div className="add-node-control"><select aria-label="Тип новой ноды" value={addType} onChange={e=>setAddType(e.target.value as NodeKind)}>{NODE_TYPES.map(type=><option key={type} value={type}>{registry[type].title}</option>)}</select><button onClick={()=>addNode(addType)}>+ Добавить ноду</button></div>
      <button onClick={()=>{try{saveDraft(localStorage,level);setNotice(errors.length?'Черновик сохранён. Можно продолжить создание после перезагрузки.':'Уровень сохранён в этом браузере.');}catch(e){setChecked(true);setNotice(`Не удалось сохранить: ${message(e)}`);}}}>Сохранить</button>
      <button onClick={exportJSON}>Экспорт JSON</button><button onClick={()=>importInput.current?.click()}>Импорт JSON</button>
      <button onClick={()=>{setChecked(true);setNotice(errors.length?`Найдено ошибок: ${errors.length}`:'Уровень корректен. Можно запускать.');}}>Проверить</button><button className="primary" onClick={start}><Icon name="play" size={14}/> Протестировать</button>
    </div><input hidden ref={importInput} type="file" accept="application/json,.json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>1_000_000)throw new Error('Максимальный размер файла — 1 МБ.');const next=parseLevel(await file.text());replace(next);setNotice('Уровень импортирован.');}catch(error){setNotice(`Импорт отклонён. Текущий уровень сохранён. ${message(error)}`);}}} /></div>
    {notice&&<div className="notice" role="status"><span>{notice}</span><button aria-label="Закрыть сообщение" onClick={()=>setNotice('')}>×</button></div>}
    <div className="editor-layout">
      <aside className="library"><h2>Библиотека нод</h2><p className="muted">Нажмите «+» или перетащите тип в граф</p>
        {NODE_TYPES.map(type=><button className="library-item" key={type} draggable onDragStart={event=>{event.dataTransfer.setData('application/x-factory-node',type);event.dataTransfer.effectAllowed='copy';}} onClick={()=>addNode(type)}><span className={`type-icon ${registry[type].inputs.some(p=>p.type==='execution')||type==='start'?'gold':''}`}><Icon name={type==='start'?'play':'layers'} size={14}/></span><span>{registry[type].title}</span><span className="plus">+</span></button>)}
        {tab==='map'&&<section className="map-library"><h2>Объекты карты</h2><p className="muted">Выберите объект, затем свободную клетку</p>{level.nodes.filter(n=>['blank','lathe','warehouse'].includes(n.type)).map(n=>{
          const placement=level.placements.find(p=>p.nodeId===n.id);
          return <button key={n.id} className={`map-object ${selected===n.id?'active':''}`} onClick={()=>setSelected(n.id)}><strong>{String(n.params.name)}</strong><small>{placement?`Клетка ${placement.x+1}, ${placement.y+1}`:'Не размещён'}</small></button>;
        })}</section>}
        <div className="library-help"><strong>Два вида связей</strong><p><i className="line gold" /> Выполнение: порядок шагов</p><p><i className="line blue" /> Данные: ссылки на объекты</p><small>Связи не перемещают предметы. Все действия выполняет игрок.</small></div>
      </aside>
      <section className="editor-workspace"><div className="workspace-tabs"><button className={tab==='graph'?'active':''} onClick={()=>setTab('graph')}>Граф сценария</button><button className={tab==='map'?'active':''} onClick={()=>setTab('map')}>Карта</button>{tab==='graph'&&<button onClick={()=>{void flow.current?.fitView({padding:.15,duration:250});}}>Показать все ноды</button>}<span>{tab==='graph'?`${level.nodes.length} нод · ${level.edges.length} связей · тяните за заголовок`:'Одна клетка — один объект'}</span></div>
      {tab==='graph'?<GraphEditor key={`${level.id}:${graphRevision}`} level={level} selected={selected} focusNodeId={focusNodeId} setLevel={setLevel} setSelected={setSelected} onInit={setFlowInstance} onAdd={addNode} onNotice={setNotice}/>
:<div className="map-host"><Suspense fallback={<SceneLoading/>}><Workshop level={level} selected={selected} onCell={(x,y)=>{
        if(!node||!['blank','lathe','warehouse'].includes(node.type)){setNotice('Выберите заготовку, станок или склад слева.');return;}
        const next=placeObject(level,node.id,x,y);if(next){setLevel(next);setNotice('');}else setNotice('Клетка занята или находится за границами карты.');
      }}/></Suspense><div className="map-caption">Клетки нумеруются с 1. Позиции объектов независимы от позиций нод.</div></div>}
      {checked&&<div className={`validation-panel ${errors.length?'invalid':'valid'}`}><strong>{errors.length?`Ошибки уровня (${errors.length})`:<><Icon name="checkCircle" size={16}/> Уровень корректен</>}</strong>{errors.map((issue,i)=><button key={i} onClick={()=>focusIssue(issue)}><b>{level.nodes.find(n=>n.id===issue.nodeId)?.params.name??(issue.nodeId?registry[level.nodes.find(n=>n.id===issue.nodeId)?.type??'start'].title:'Уровень')}</b> · {issue.message}</button>)}</div>}
      </section>
      <aside className="properties"><h2>Свойства</h2>{node?<><span className="eyebrow">{registry[node.type].title}</span><code className="node-id">ID: {node.id}</code><div className="size-controls"><strong>Размер ноды</strong>{(['width','height'] as const).map(key=><label key={key}>{key==='width'?'Ширина ноды':'Высота ноды'}<input type="number" min={key==='width'?220:160} max={900} value={node.size?.[key]??(key==='width'?230:200)} onChange={e=>{const size={width:node.size?.width??230,height:node.size?.height??200,[key]:Math.max(key==='width'?220:160,Math.min(900,Number(e.target.value)||200))};setLevel(current=>({...current,nodes:current.nodes.map(n=>n.id===node.id?{...n,size}:n)}));}} /></label>)}</div>{registry[node.type].parameters.map(parameter=><label key={parameter.key}>{parameter.label}{parameter.type==='textarea'?<textarea value={node.params[parameter.key]??''} onChange={e=>updateParameter(parameter.key,e.target.value)} />:parameter.type==='tool'?<select value={node.params[parameter.key]} onChange={e=>updateParameter(parameter.key,e.target.value)}><option value="turning">Проходной токарный резец</option></select>:<input type={parameter.type==='number'?'number':'text'} step="any" value={node.params[parameter.key]??''} onChange={e=>updateParameter(parameter.key,parameter.type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value)} />}</label>)}
        {registry[node.type].parameters.length===0&&<p className="muted">У этой ноды нет параметров.</p>}
        {['blank','lathe','warehouse'].includes(node.type)&&<div className="placement-info"><strong>Размещение на карте</strong><p>{level.placements.find(p=>p.nodeId===node.id)?(()=>{const p=level.placements.find(p=>p.nodeId===node.id)!;return `Клетка ${p.x+1}, ${p.y+1}`;})():'Объект не размещён'}</p><button onClick={()=>setTab('map')}>Перейти к карте</button><button onClick={()=>setLevel({...level,placements:level.placements.filter(p=>p.nodeId!==node.id)})}>Убрать с карты</button></div>}
        <button className="danger" onClick={()=>{setLevel(deleteNodes(level,[node.id]));setSelected(null);}}>Удалить ноду</button><p className="muted">Связи и размещение этой ноды будут удалены вместе с ней.</p>
      </>:<div className="empty-properties"><span><Icon name="layers" size={34}/></span><p>Выберите ноду, чтобы изменить её параметры.</p></div>}
      {tab==='map'&&<div className="grid-properties"><h3>Сетка карты</h3>{(['width','height'] as const).map(k=><label key={k}>{k==='width'?'Ширина':'Высота'}<input type="number" min={1} max={8} value={level.grid[k]} onChange={e=>setLevel({...level,grid:{...level.grid,[k]:Math.max(1,Math.min(8,Math.trunc(Number(e.target.value)||1)))}})} /></label>)}</div>}
      </aside>
    </div><div className="editor-footer">Первая версия: один стол, один станок, один склад · последовательный сценарий · без сервера</div>
  </main>;
}
