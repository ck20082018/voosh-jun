import {lazy,Suspense,useCallback,useEffect,useMemo,useReducer,useRef,useState} from 'react';
import type {Edge,ReactFlowInstance} from '@xyflow/react';
import {registry,NODE_TYPES,exampleLevel,welcomeLevel,twoOperationsLevel,intermediateLevel,locatedPlacements,millingLevel,checkLevel,emptyLevel,deleteNodes,placeObject,type Level,type NodeKind,type Params} from './level';
import {validateLevel,type Issue} from './validation';
import {compileLevel} from './compiler';
import {FactoryCore,type Command} from './core';
import {loadLevel,saveDraft,parseLevelWithImages,checkLevelImages,serializeLevel} from './storage';
const Workshop=lazy(()=>import('./Workshop').then(module=>({default:module.Workshop})));
function SceneLoading(){return <div className="scene-loading">Загрузка цеха…</div>;}

import {addEditorNode,type EditorNode} from './editorFlow';
import {useEditorHistory} from './useEditorHistory';
import {PlanningCore} from './planning';
import {PlanningPlayer} from './PlanningPlayer';
import {PartPreview} from './PartPreview';
import {toyAxleLevel} from './playerLevel';
import {ungroup,setGroupMember} from './groups';
import {catalogIds} from './level';
import {GraphEditor} from './GraphEditor';
import {NodeProperties} from './NodeProperties';
import {dimensionText} from './manufacturing';
import {MapSettings} from './MapSettings';
import {togglePoint,movePoint,type MapChange} from './map';
import {Icon} from './ui/Icon';
import {MAX_JSON_BYTES} from './images';
function initialProject():{level:Level;notice:string}{try{return {level:loadLevel(localStorage)??exampleLevel(),notice:''};}catch(error){return {level:exampleLevel(),notice:`Сохранение не загружено: ${message(error)}`};}}
function message(error:unknown){return error instanceof Error?error.message:String(error);}
export function EditorApp(){
  const [initial]=useState(initialProject);
  const history=useEditorHistory(initial.level);const {level,setLevel}=history;
  const [undoRevision,setUndoRevision]=useState(0);
  const [notice,setNotice]=useState(initial.notice);
  const [imagesReady,setImagesReady]=useState(!initial.level.nodes.some(n=>n.type==='intro'&&n.params.image));
  useEffect(()=>{let alive=true;checkLevelImages(initial.level).then(()=>{if(alive)setImagesReady(true);}).catch(e=>{if(alive)setNotice(`Сохранение не загружено: ${message(e)}. Исходные данные остаются в localStorage.`);});return()=>{alive=false;};},[initial]);
  const [selected,setSelected]=useState<string|null>(null);
  const [focusNodeId,setFocusNodeId]=useState<string|null>(null);
  const [addType,setAddType]=useState<NodeKind>('blank');
  const [graphRevision,setGraphRevision]=useState(0);
  const [tab,setTab]=useState<'graph'|'map'>('graph');
  const [checked,setChecked]=useState(false);
  const [mapMode,setMapMode]=useState<'objects'|'points'|'move'>('objects');
  const [movingPoint,setMovingPoint]=useState<string|null>(null);
  const [run,setRun]=useState<{core:FactoryCore|PlanningCore;level:Level;test:boolean}|null>(null);
  const importInput=useRef<HTMLInputElement>(null);
  const flow=useRef<ReactFlowInstance<EditorNode,Edge>|null>(null);
  const errors=useMemo(()=>validateLevel(level),[level]);
  const node=level.nodes.find(n=>n.id===selected);
  const setFlowInstance=useCallback((instance:ReactFlowInstance<EditorNode,Edge>|null)=>{flow.current=instance;},[]);
  function addNode(type:NodeKind,position?:{x:number;y:number}){
    history.end();
    const bounds=document.querySelector('.flow-host')?.getBoundingClientRect();
    const center=bounds&&tab==='graph'&&flow.current?flow.current.screenToFlowPosition({x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2}):{x:315,y:240};
    const desired=position??{x:center.x-115,y:center.y-70};
    const id=crypto.randomUUID();
    setLevel(current=>addEditorNode(current,type,id,desired));
    setSelected(id);setFocusNodeId(id);setTab('graph');setNotice(`Добавлена нода «${registry[type].title}». Настройте параметры справа и соедините порты.`);
  }
  function start(test:boolean){setChecked(true);if(errors.length){setNotice('Исправьте ошибки перед запуском.');return;}try{const snapshot=structuredClone(level);document.documentElement.scrollTop=0;document.body.scrollTop=0;setRun({core:snapshot.productionMode==='player'?new PlanningCore(snapshot):new FactoryCore(compileLevel(snapshot)),level:snapshot,test});setNotice('');}catch(error){setNotice(message(error));}}
  function focusIssue(issue:Issue){if(!issue.nodeId)return;setSelected(issue.nodeId);setTab('graph');const n=level.nodes.find(n=>n.id===issue.nodeId);if(n)flow.current?.setCenter(n.position.x+115,n.position.y+60,{zoom:1,duration:300});}
  function mapChange(result:MapChange){if(result.error)setNotice(result.error);else {setLevel(result.level);setNotice('');}}
  function replace(next:Level){setMovingPoint(null);setMapMode('objects');history.reset(next);setSelected(null);setFocusNodeId(null);setGraphRevision(value=>value+1);setTab('graph');setChecked(false);setNotice('');}
  function exportJSON(){
    const url=URL.createObjectURL(new Blob([serializeLevel(level)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`${level.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`;a.click();URL.revokeObjectURL(url);setNotice('JSON экспортирован.');
  }
  function updateParams(patch:Params){if(!node)return;if('image' in patch)history.end();const id=node.id;setLevel(current=>({...current,nodes:current.nodes.map(n=>n.id===id?{...n,params:{...n.params,...patch}}:n)}));}
  function undoEdit(){if(!history.canUndo)return;history.undo();setSelected(null);setFocusNodeId(null);setMovingPoint(null);setChecked(false);setUndoRevision(value=>value+1);setNotice('Изменение отменено.');}
  useEffect(()=>{
    if(run||!imagesReady)return;
    function keyDown(event:KeyboardEvent){
      const target=event.target;
      if(event.defaultPrevented||event.isComposing||event.altKey||event.shiftKey||!(event.metaKey||event.ctrlKey)||!(event.code==='KeyZ'||event.key.toLowerCase()==='z'))return;
      if(target instanceof Element&&target.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"]'))return;
      event.preventDefault();undoEdit();
    }
    window.addEventListener('keydown',keyDown);return()=>window.removeEventListener('keydown',keyDown);
  },[run,imagesReady,history.canUndo,history.undo]);
  if(!imagesReady)return <main><p>{notice||'Проверка изображений сохранения…'}</p><button onClick={()=>{history.reset(exampleLevel());setImagesReady(true);}}>Открыть пример (сохранение остаётся в браузере)</button></main>;
  if(run){const onExit=()=>{run.core.dispose();setRun(null);};return run.core instanceof PlanningCore?<PlanningPlayer core={run.core} level={run.level} onExit={onExit} renderRuntime={(core,scene,planning,onChange)=><Player core={core} level={scene} test={run.test} onExit={onExit} planning={planning} onPlanChange={onChange}/>}/>:<Player core={run.core} level={run.level} test={run.test} onExit={onExit}/>;}
  return <main className="admin-app theme-paper" onInputCapture={event=>{if((event.target as Element).matches('input:not([type=checkbox]):not([type=file]),textarea'))history.beginField();}} onClickCapture={event=>{if((event.target as Element).closest('button'))history.end();}} onChangeCapture={event=>{if((event.target as Element).matches('select,input[type=checkbox],input[type=file]'))history.end();}} onFocusCapture={event=>{if(event.target.matches('input:not([type=checkbox]):not([type=file]),textarea'))history.begin();}} onBlurCapture={event=>{if(event.target.matches('input,textarea'))history.end();}}>
    <header className="app-header"><div><span className="eyebrow">Для организаторов</span><h1 className="t-h2">Редактор заданий</h1><p className="muted">Граф сценария, карта цеха, проверка и тестовый запуск.</p></div><div className="mode-tabs"><button className="active">Администратор</button><button onClick={()=>start(false)}>Игрок ↗</button></div></header>
    <div className="toolbar"><input className="level-name" aria-label="Название уровня" value={level.name} onChange={e=>setLevel({...level,name:e.target.value})} /><label>Режим производства<select aria-label="Режим производства" value={level.productionMode} onChange={e=>setLevel({...level,productionMode:e.target.value as Level['productionMode']})}><option value="ready">Готовый план</option><option value="player">План игрока</option></select></label><div className="toolbar-actions">
      <button disabled={!history.canUndo} title="Cmd+Z / Ctrl+Z" onClick={undoEdit}>Отменить</button><button onClick={()=>replace(emptyLevel())}>Новый уровень</button><button onClick={()=>replace(exampleLevel())}>Пример</button><button onClick={()=>replace(toyAxleLevel())}>Ось: план игрока</button><button onClick={()=>replace(welcomeLevel())}>Приветствие</button><button onClick={()=>replace(twoOperationsLevel())}>2 операции</button><button onClick={()=>replace(intermediateLevel())}>Два станка</button><button onClick={()=>replace(millingLevel())}>Фрезерный пример</button><button onClick={()=>replace(checkLevel())}>Проверка выбора</button><div className="add-node-control"><select aria-label="Тип новой ноды" value={addType} onChange={e=>setAddType(e.target.value as NodeKind)}>{NODE_TYPES.map(type=><option key={type} value={type}>{registry[type].title}</option>)}</select><button onClick={()=>addNode(addType)}>+ Добавить ноду</button></div>
      <button onClick={()=>{try{saveDraft(localStorage,level);setNotice(errors.length?'Черновик сохранён. Можно продолжить создание после перезагрузки.':'Уровень сохранён в этом браузере.');}catch(e){setChecked(true);setNotice(`Не удалось сохранить: ${message(e)}`);}}}>Сохранить</button>
      <button onClick={exportJSON}>Экспорт JSON</button><button onClick={()=>importInput.current?.click()}>Импорт JSON</button>
      <button onClick={()=>{setChecked(true);setNotice(errors.length?`Найдено ошибок: ${errors.length}`:'Уровень корректен. Можно запускать.');}}>Проверить</button><button className="primary" onClick={()=>start(true)}>▶ Протестировать</button>
    </div><input hidden ref={importInput} type="file" accept="application/json,.json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>MAX_JSON_BYTES)throw new Error('Максимальный размер файла — 2 МиБ.');const next=await parseLevelWithImages(await file.text());replace(next);setNotice('Уровень импортирован.');}catch(error){setNotice(`Импорт отклонён. Текущий уровень сохранён. ${message(error)}`);}}} /></div>
    {notice&&<div className="notice" role="status"><span>{notice}</span><button aria-label="Закрыть сообщение" onClick={()=>setNotice('')}>×</button></div>}
    <div className="editor-layout">
      <aside className="library"><h2>Библиотека нод</h2><p className="muted">Нажмите «+» или перетащите тип в граф</p>
        {NODE_TYPES.map(type=><button className="library-item" key={type} draggable onDragStart={event=>{event.dataTransfer.setData('application/x-factory-node',type);event.dataTransfer.effectAllowed='copy';}} onClick={()=>addNode(type)}><span className={`type-icon ${registry[type].inputs.some(p=>p.type==='execution')||type==='start'?'gold':''}`}><Icon name={type==='start'?'play':'layers'} size={14}/></span><span>{registry[type].title}</span><span className="plus">+</span></button>)}
        {tab==='map'&&<section className="map-library"><h2>Объекты карты</h2><p className="muted">Выберите объект, затем свободную клетку</p>{level.nodes.filter(n=>['blank','lathe','warehouse','table'].includes(n.type)&&!(level.productionMode==='player'&&catalogIds(level).has(n.id))).map(n=>{
          const placement=locatedPlacements(level).find(p=>p.nodeId===n.id);
          return <button key={n.id} className={`map-object ${selected===n.id?'active':''}`} onClick={()=>setSelected(n.id)}><strong>{String(n.params.name)}</strong><small>{placement?`Клетка ${placement.x+1}, ${placement.y+1}`:'Не размещён'}</small></button>;
        })}</section>}
        <div className="library-help"><strong>Два вида связей</strong><p><i className="line gold" /> Выполнение: порядок шагов</p><p><i className="line blue" /> Данные: ссылки на объекты</p><small>Связи не перемещают предметы. Все действия выполняет игрок.</small></div>
      </aside>
      <section className="editor-workspace"><div className="workspace-tabs"><button className={tab==='graph'?'active':''} onClick={()=>setTab('graph')}>Граф сценария</button><button className={tab==='map'?'active':''} onClick={()=>setTab('map')}>Карта</button>{tab==='graph'&&<button onClick={()=>{void flow.current?.fitView({padding:.15,duration:250});}}>Показать все ноды</button>}<span>{tab==='graph'?`${level.nodes.length} нод · ${level.edges.length} связей · тяните за заголовок`:'Одна клетка — один объект'}</span></div>
      {tab==='graph'?<GraphEditor key={`${level.id}:${graphRevision}`} level={level} selected={selected} focusNodeId={focusNodeId} setLevel={setLevel} setSelected={setSelected} onInit={setFlowInstance} onAdd={addNode} onNotice={setNotice} onEditStart={history.begin} onEditEnd={history.end} resetToken={undoRevision}/>
:<div className="map-host"><div><button onClick={()=>{setMapMode('objects');setMovingPoint(null);}}>Размещать объекты</button><button onClick={()=>{setMapMode('points');setMovingPoint(null);}}>Отмечать точки</button><button onClick={()=>{setMapMode('move');setMovingPoint(null);}}>Перенести точку</button><button onClick={()=>{const map=level.nodes.find(n=>n.type==='map');if(map)setSelected(map.id);else setNotice('Добавьте ноду «Карта».');}}>Настройки карты</button><span role="status">{mapMode==='objects'?'Выберите объект и разрешённую точку':mapMode==='points'?'Клик добавляет или снимает свободную точку':movingPoint?'Выберите новую свободную клетку':'Выберите свободную точку для переноса'}</span></div><Suspense fallback={<SceneLoading/>}><Workshop level={level} selected={selected} onCell={(x,y)=>{
        history.end();
        if(mapMode==='points'){if(!level.nodes.some(n=>n.type==='map')){setNotice('Добавьте ноду «Карта».');return;}mapChange(togglePoint(level,x,y));return;}
        if(mapMode==='move'){if(movingPoint){const result=movePoint(level,movingPoint,x,y);mapChange(result);if(!result.error)setMovingPoint(null);}else {const point=level.grid.points.find(p=>p.x===x&&p.y===y);if(!point){setNotice('Выберите существующую свободную точку.');return;}if(level.placements.some(p=>p.pointId===point.id)){setNotice('Точка занята. Сначала переместите или снимите объект.');return;}setMovingPoint(point.id);}return;}
        if(!node||!['blank','lathe','warehouse','table'].includes(node.type)){setNotice('Выберите заготовку, станок или склад слева.');return;}
        const next=placeObject(level,node.id,x,y);if(next){setLevel(next);setNotice('');}else setNotice('Выберите разрешённую свободную точку карты.');
      }}/></Suspense><div className="map-caption">Клетки нумеруются с 1. Позиции объектов независимы от позиций нод.</div></div>}
      {checked&&<div className={`validation-panel ${errors.length?'invalid':'valid'}`}><strong>{errors.length?`Ошибки уровня (${errors.length})`:'✓ Уровень корректен'}</strong>{errors.map((issue,i)=><button key={i} onClick={()=>focusIssue(issue)}><b>{String(level.nodes.find(n=>n.id===issue.nodeId)?.params.name??(issue.nodeId?registry[level.nodes.find(n=>n.id===issue.nodeId)?.type??'start'].title:'Уровень'))}</b> · {issue.message}</button>)}</div>}
      </section>
      <aside className="properties"><h2>Свойства</h2>{node?<><span className="eyebrow">{registry[node.type].title}</span><code className="node-id">ID: {node.id}</code>{node.type==='map'&&<MapSettings level={level} onChange={mapChange}/>}<NodeProperties key={`${level.id}:${graphRevision}:${undoRevision}:${node.id}`} node={node} level={level} onPatch={updateParams} onNotice={setNotice}/>
        {registry[node.type].parameters.length===0&&node.type!=='process'&&node.type!=='map'&&node.type!=='catalog'&&<p className="muted">У этой ноды нет параметров.</p>}
        <label>Группа<select aria-label="Группа ноды" value={node.groupId??''} onChange={e=>setLevel(current=>setGroupMember(current,node.id,e.target.value||null))}><option value="">Без группы</option>{level.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{['blank','lathe','warehouse','table'].includes(node.type)&&!(level.productionMode==='player'&&catalogIds(level).has(node.id))&&<div className="placement-info"><strong>Размещение на карте</strong><p>{level.placements.find(p=>p.nodeId===node.id)?(()=>{const p=locatedPlacements(level).find(p=>p.nodeId===node.id)!;return `Клетка ${p.x+1}, ${p.y+1}`;})():'Объект не размещён'}</p><button onClick={()=>setTab('map')}>Перейти к карте</button><button onClick={()=>setLevel({...level,placements:level.placements.filter(p=>p.nodeId!==node.id)})}>Убрать с карты</button></div>}
        <button className="danger" onClick={()=>{if(node.type==='map'&&level.placements.length){setNotice('Нельзя удалить карту с размещёнными объектами. Сначала снимите объекты.');return;}setLevel(deleteNodes(level,[node.id]));setSelected(null);}}>Удалить ноду</button><p className="muted">Связи и размещение этой ноды будут удалены вместе с ней.</p>
      </>:level.groups.some(g=>g.id===selected)?<>{level.groups.filter(g=>g.id===selected).map(group=><section key={group.id}><label>Название группы<input aria-label="Название группы" value={group.name} onChange={e=>setLevel({...level,groups:level.groups.map(g=>g.id===group.id?{...g,name:e.target.value}:g)})}/></label><label>Цвет группы<input aria-label="Цвет группы" type="color" value={group.color} onChange={e=>setLevel({...level,groups:level.groups.map(g=>g.id===group.id?{...g,color:e.target.value}:g)})}/></label><p>Тяните заголовок, чтобы переместить всю группу. Рамка меняет размеры через угловые маркеры. Принадлежность задаётся в свойствах каждой ноды.</p><button onClick={()=>{setLevel(ungroup(level,group.id));setSelected(null);}}>Разгруппировать</button></section>)}</>:<div className="empty-properties"><span>◇</span><p>Выберите ноду, чтобы изменить её параметры.</p></div>}

      </aside>
    </div><div className="editor-footer">Готовый план или план игрока · группы организуют граф и не меняют сценарий · без сервера</div>
  </main>;
}
export function Player({core,level,test,onExit,planning,onPlanChange}:{core:FactoryCore;level:Level;test:boolean;onExit:()=>void;planning?:PlanningCore;onPlanChange?:()=>void}){
  const [,refresh]=useReducer(x=>x+1,0);const update=useCallback(()=>refresh(),[]);
  const [sceneRevision,setSceneRevision]=useState(0);
  useEffect(()=>()=>core.dispose(),[core]);
  const s=core.state;const assessment=planning?.assessment;
  const reset=()=>{if(planning){planning.reset();onPlanChange?.();}else{core.reset();setSceneRevision(value=>value+1);refresh();}};
  if(core.isWelcome)return <WelcomePlayer core={core} level={level} test={test} onExit={onExit} update={update}/>;
  const op=core.currentOperation;const machine=core.currentMachine;const warehouse=core.currentWarehouse;
  const active=level.nodes.find(n=>n.id===s.activeNodeId);
  const selectedName=s.selected===core.resources.blank.id?(s.stage==='finished'?core.currentPartName:core.resources.blank.name):s.selected===machine.id?machine.name:s.selected===warehouse.id?warehouse.name:core.resources.warehouses[s.selected??'']?.name??core.resources.machines[s.selected??'']?.name??'Выберите объект';
  function command(c:Command){core.command(c);refresh();}
  return <main className="player-app"><header className="app-header"><div className="brand"><span className="brand-icon">▧</span><div><h1>{level.name}</h1><p>{test?'Тестирование уровня · отдельный запуск':'Учебный завод · режим игрока'}</p></div></div><div className="player-header-actions"><button onClick={reset}>Начать заново</button><button onClick={onExit}>{test?'← Вернуться в редактор':'← Администратор'}</button></div></header>
    <div className="player-layout"><section className="player-workshop"><div className="scene-top"><span>ИЗОМЕТРИЧЕСКИЙ ЦЕХ</span><span>Стол → станок → склад</span></div><Suspense fallback={<SceneLoading/>}><Workshop key={sceneRevision} level={level} core={core} onUpdate={update}/></Suspense><div className="scene-bottom">Перетаскивайте деталь между объектами. Нажмите на станок или склад, чтобы открыть действия. Подходящие цели подсвечиваются голубым.</div></section><aside className="player-panel"><span className="eyebrow">ТЕКУЩАЯ ЦЕЛЬ</span><h2>{s.goal||'Подготовка к работе'}</h2><p>{s.instruction||'Познакомьтесь с задачей во вступлении.'}</p>{s.checkMessage&&<p role="status">{s.checkMessage}</p>}<div className="next-action" role="status" aria-live="polite"><span>СЛЕДУЮЩЕЕ ДЕЙСТВИЕ</span><p>{core.hint}</p></div><div className="selection-panel"><h3>{selectedName}</h3>
      {s.selected===core.resources.blank.id&&<p className="dimensions">{core.resources.blank.material} · {dimensionText(s.part??core.resources.blank)}{s.part?.sections.map((section,i)=><span key={i}><br/>Участок {i+1}: Ø{section.diameter} × {section.length} мм</span>)}</p>}
      {s.selected===machine.id&&<p className="dimensions">{core.currentTool.name}<br/>{op.kind==='turning'?`Точение: Ø${op.diameter} × ${op.length} мм`:`Фрезерование: снять ${op.depth} мм`}<br/>Длительность: {op.seconds} с</p>}
    </div><HintPanels core={core} update={update}/><div className="processing"><div><span>Обработка</span><b>{Math.floor(s.elapsed/(op.seconds*1000)*100)}%</b></div><div className="progress" role="progressbar" aria-label="Прогресс обработки" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(s.elapsed/(op.seconds*1000)*100)}><i style={{width:`${s.elapsed/(op.seconds*1000)*100}%`}} /></div></div><div className="warehouse-count"><span>{warehouse.name}<small>Готовые детали</small></span><strong>{s.warehouses[warehouse.id]?.count??0}<small> / {warehouse.capacity}</small></strong></div>
    {assessment&&<section className="result-comparison" aria-label="Сравнение результата"><h3>{assessment.success?'Деталь соответствует заданию':'Деталь не соответствует заданию'}</h3><PartPreview part={assessment.expected} label="Ожидаемый результат"/><PartPreview part={assessment.actual} label="Фактический результат"/>{assessment.differences.map(d=><p key={d.characteristic}>{d.characteristic}: ожидалось {d.expected}; получено {d.actual}.</p>)}<button onClick={()=>{if(planning?.retry())onPlanChange?.();}}>Изменить план и попробовать снова</button></section>}{s.completed&&<div className="success" role="status"><strong>✓ Уровень завершён</strong><p>{s.success}</p><button onClick={reset}>Пройти ещё раз</button></div>}
    </aside></div>
    {test&&<section className="debug-panel"><div><span className="eyebrow">АКТИВНАЯ НОДА</span><strong>{active?registry[active.type].title:'—'}</strong><code>{s.activeNodeId}</code></div><div className="event-log"><h3>Журнал событий</h3>{core.log.map(event=><p key={event.sequence}><span>{String(event.sequence).padStart(2,'0')}</span>{event.message}</p>)}</div></section>}
    {!s.activeHint&&s.intro&&<div className="modal-backdrop"><section className="intro-modal" role="dialog" aria-modal="true" aria-label="Вступление"><IntroContent node={active}/><button className="primary" autoFocus onClick={()=>command('start')}>Продолжить →</button></section></div>}
    <HintModal core={core} update={update}/>
  </main>;
}

function WelcomePlayer({core,level,test,onExit,update}:{core:FactoryCore;level:Level;test:boolean;onExit:()=>void;update:()=>void}){
 const s=core.state,active=level.nodes.find(n=>n.id===s.activeNodeId);
 return <main className="player-app"><header className="app-header"><h1>{level.name}</h1><div><button onClick={()=>{core.reset();update();}}>Начать заново</button><button onClick={onExit}>← Вернуться в редактор</button></div></header><section className="welcome-player"><span className="eyebrow">ЗНАКОМСТВО</span>{s.completed?<><h2>Готово</h2><p>{s.success}</p></>:<IntroContent node={active}/>} {s.checkMessage&&<p role="status">{s.checkMessage}</p>}{!s.activeHint&&s.intro&&<button className="primary" onClick={()=>{core.command('start');update();}}>Продолжить →</button>}{s.completed&&<button onClick={()=>{core.reset();update();}}>Пройти ещё раз</button>}</section><HintPanels core={core} update={update}/><HintModal core={core} update={update}/>{test&&<section className="debug-panel"><div>Активная нода: {active?registry[active.type].title:'—'}</div><div>{core.log.map(event=><p key={event.sequence}>{event.message}</p>)}</div></section>}</main>;
}

function IntroContent({node}:{node:import('./level').LevelNode|undefined}){return <>{node?.params.title&&<h2>{String(node.params.title)}</h2>}{node?.params.image&&<img src={String(node.params.image)} alt={String(node.params.text||'Изображение вступления')} style={{maxWidth:'100%',maxHeight:360,objectFit:'contain'}}/>}{node?.params.text&&<p>{String(node.params.text)}</p>}</>;}

function HintPanels({core,update}:{core:FactoryCore;update:()=>void}){const s=core.state;return <section aria-label="Подсказки">{s.panelHints.map((h,i)=><div key={`${h.id}:${i}`} className="next-action"><strong>{h.title}</strong><p>{h.text}</p></div>)}{s.activeHint?.display==='panel'&&<div className="next-action" role="status"><strong>{s.activeHint.title}</strong><p>{s.activeHint.text}</p><button aria-label="Продолжить подсказку" onClick={()=>{core.command('continue-hint');update();}}>Продолжить</button></div>}</section>;}
function HintModal({core,update}:{core:FactoryCore;update:()=>void}){const h=core.state.activeHint;if(h?.display!=='modal')return null;return <div className="modal-backdrop"><section className="intro-modal" role="dialog" aria-modal="true" aria-label="Подсказка"><h2>{h.title}</h2><p>{h.text}</p><button autoFocus onClick={()=>{core.command('continue-hint');update();}}>{h.confirm?'Продолжить':'Закрыть подсказку'}</button></section></div>;}
