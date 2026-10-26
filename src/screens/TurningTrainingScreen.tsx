import {THREAD_CATALOG,threadRecipe,threadDepth,threadMotion,threadLabel,minimumWall} from '../threading';
import {ThreadLesson,LearningRecap} from './ThreadLesson';
import {findTurningTool,toolFor,TURNING_TOOLS,OPERATION_NAMES,type TrainingTarget} from '../turningTools';
import {geometryOf} from '../manufacturing';
import {initialTrainingPart,turningToolPosition} from '../turningTraining';
import {ToolLesson} from './TurningToolLesson';
import {drawingDimensions,operationDrawingRegion,type DrawingSelection} from '../drawingGeometry';
import {useEffect,useReducer,useRef,useState} from 'react';
import type {Level} from '../level';
import {PlanningCore,type PlayerOperation} from '../planning';
import {MissionSession} from '../platform/session';
import {checkTrainingPlan,initialTrainingPlan,settingRule,type TurningLesson,type TrainingStep,type CuttingSettings} from '../turningTraining';
import {PartWorkview,TurningBlueprint,RadiusLesson} from './TurningWorkview';
import {RuntimeHints} from './MissionPanels';
import {Button} from '../ui/primitives';
import './turning-training.css';
function learnerPlan(lesson:TurningLesson){const p=initialTrainingPlan(lesson);if(['turning-3','turning-11','turning-12','turning-14','turning-15'].includes(lesson.id))p.operations=[];else if(Number(lesson.id.split('-')[1])>=7)p.operations=p.operations.map(o=>({...o,toolId:null}));if(lesson.id==='turning-15')p.blankId=null;return p;}
export function TurningTrainingScreen({level,lesson,onExit,onStarted,onFinished}:{level:Level;lesson:TurningLesson;onExit:()=>void;onStarted:()=>void;onFinished:(s:MissionSession)=>void}){
 const [core]=useState(()=>{const c=new PlanningCore(level,lesson);c.setPlan(learnerPlan(lesson));return c;});
 const [,refresh]=useReducer(x=>x+1,0);
 const [stage,setStage]=useState<'intro'|'probe'|'settings'|'runtime'>('intro');
 const [session,setSession]=useState<MissionSession|null>(null);
 const [paused,setPaused]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(false),[help,setHelp]=useState(false);
 const [tool,setTool]=useState({z:60,x:14}),[jogged,setJogged]=useState(false);
 const [selection,setSelection]=useState<DrawingSelection|null>(null);
 const drawingRef=useRef<HTMLDivElement>(null);
 const finished=useRef(false);
 function region(step:TrainingStep){const selected=operationDrawingRegion(step.target,60);const d=drawingDimensions(lesson.requirements,lesson.drawing).find(d=>d.surface===selected.surface&&d.z0===selected.z0&&d.z1===selected.z1);return d??selected;}
 useEffect(()=>()=>{session?.detach();},[session]);
 useEffect(()=>()=>core.dispose(),[core]);
 const explanation=String(level.nodes.find(n=>n.type==='intro')?.params.text??lesson.explanation);
 const plan=core.plan,checked=checkTrainingPlan(level,plan,lesson);
 const probeTarget=lesson.learningKey==='thread-inner'?lesson.targets.find(t=>t.kind==='thread')!:lesson.targets[0];
 const raw=initialTrainingPart(lesson);
 const axisProbe=['drill','bore'].includes(probeTarget.kind)||probeTarget.kind==='thread'&&probeTarget.surface==='inner';
 const isFinal=lesson.id==='turning-15';
 const newLesson=Number(lesson.id.split('-')[1])>=7;
 const learningKey=lesson.learningKey?`turning-tool-learned-${lesson.learningKey}`:`turning-learned-${lesson.id}`;
 const allowed=lesson.allowedKinds??[...new Set(lesson.targets.map(t=>t.kind))];
 const needsProbe=()=>!newLesson||!!lesson.learningKey&&!known();
 const markExplanation=()=>{try{localStorage.setItem(learningKey,'yes');}catch{/* explanation remains available */}};
 const known=()=>{try{return localStorage.getItem(learningKey)==='yes';}catch{return false;}};
 function edit(ops:PlayerOperation[]){if(core.setPlan({...core.plan,operations:ops})){setPreview(false);setError('');refresh();}}
 function update(i:number,step:TrainingStep){if(step.target.kind==='thread')step={...step,settings:{...step.settings,feed:step.target.pitch}};setSelection(region(step));edit(plan.operations.map((o,j)=>j===i&&o.kind==='turning'?{...o,training:step}:o));}
 function start(){try{if(!core.startManufacturing()){setError(checked.warnings[0]??checked.errors.join(' '));return;}const s=new MissionSession(core.runtime!,'training',{coaching:true,evaluationProfile:'turning-learning'});while(s.state.intro)s.command('start');s.click(s.core.resources.blank.id);s.command('install');s.click(s.core.resources.machine.id);setSession(s);setPaused(false);setStage('runtime');}catch(e){setError((e as Error).message);}}
 useEffect(()=>{
  if(!session||stage!=='runtime')return;
  let last=performance.now();
  const id=setInterval(()=>{
   const now=performance.now(),delta=Math.min(250,now-last);last=now;
   if(paused||document.hidden||session.ended)return;
   const s=session.state,r=session.core.resources;
   if(s.stage==='loaded'){session.click(r.machine.id);if(!session.command('process')){setError(session.blockedReason('process'));setPaused(true);}}
   session.tick(delta);
   if(session.state.stage==='finished'){session.click(r.blank.id);session.command('store');session.click(r.warehouse.id);}
   refresh();
  },40);return()=>clearInterval(id);
 },[session,stage,paused]);
 const runtime=session?.state,pass=session&&!session.ended?session.core.currentOperation?.kind==='turning'?session.core.currentOperation.surfacePass:undefined:undefined;
 const actualGeometry=runtime?.item?geometryOf(runtime.item):null;
 const stockLength=runtime?.item?.length??60;
 const position=pass?turningToolPosition(pass.target,session!.progress,pass.removedDepth,stockLength,actualGeometry?.ok?actualGeometry.value.spans.at(-1)!.outer1:10):{z:stockLength,x:12};
 const movingZ=position.z,movingX=position.x;
 const remainingWall=actualGeometry?.ok?minimumWall(actualGeometry.value):10;
 return <main className="page turning-training"><header className="page-head"><div><span className="eyebrow">Школа точения · {lesson.id.replace('turning-','')} из 15</span><h1 className="t-h1">{lesson.title}</h1></div><Button onClick={onExit}>К карте</Button></header>
 <section className="surface turning-card"><h2>Заказ</h2><p>Сталь Ø{lesson.stockDiameter??20} × 60 мм. {lesson.initialBoreDiameter?`Исходное сквозное отверстие Ø${lesson.initialBoreDiameter} мм. `:''}Патрон занимает Z0–10; доступ со свободного торца. {lesson.setup?.axialClearanceDiameter?`Осевой просвет патрона Ø${lesson.setup.axialClearanceDiameter} мм, выход до ${lesson.setup.exitClearance} мм. Внутренняя обработка в зоне закрепления разрешена только внутри просвета.`:'В сплошную зону патрона входить нельзя.'}</p><div ref={drawingRef}><TurningBlueprint material={lesson.material} geometry={lesson.requirements} title="Чертёж заказа" display={lesson.drawing} selection={selection} onSelect={setSelection}/></div>{lesson.minQuality&&<p>Чистовой проход должен реально снимать не более 0,25 мм по радиусу. Качество не ниже {lesson.minQuality}/100.</p>}</section>
 {stage==='intro'&&<section className="surface turning-card"><h2>{known()?'Повторное прохождение':'Короткое объяснение'}</h2>{!known()&&<p>{explanation}</p>}<p>Подсказки и размышления не штрафуются. Сначала попробуйте перемещение при остановленном шпинделе.</p><Button variant="primary" onClick={()=>{onStarted();if(needsProbe()){setTool({z:newLesson?65:60,x:axisProbe?0:14});setStage('probe');}else{markExplanation();setStage('settings');}}}>{needsProbe()?'Начать безопасную пробу':'Перейти к настройкам'}</Button><Button onClick={()=>setHelp(!help)}>Повторить объяснение</Button></section>}
 {help&&<aside className="surface turning-card" role="note">{explanation}</aside>}
 {stage==='probe'&&<section className="surface turning-card"><h2>Безопасная проба · шпиндель остановлен</h2>{newLesson?<>{lesson.targets.some(t=>t.kind==='thread')?<ThreadLesson/>:<ToolLesson kind={lesson.targets[0].kind}/>}</>:<RadiusLesson/>}<PartWorkview part={raw} title="Проба без резания" toolZ={tool.z} toolX={tool.x} toolKind={probeTarget.kind==='drill'?'drill':axisProbe?'bore':undefined}/><p>{newLesson&&axisProbe?'Подведите инструмент вдоль Z по оси перед свободным торцом. В пробе он остаётся вне детали.':'Подведите резец по Z и X вне наружной поверхности.'} Деталь не меняется, резание и вход в патрон запрещены.</p>{(newLesson&&axisProbe?[['Z −',-1,0],['Z +',1,0]]:[['Z −',-5,0],['Z +',5,0],['X −',0,-1],['X +',0,1]]).map(([name,z,x])=><Button key={String(name)} onClick={()=>{setTool(t=>({z:Math.max(newLesson?60:10,Math.min(newLesson?70:60,t.z+Number(z))),x:newLesson&&axisProbe?0:Math.max(11,Math.min(20,t.x+Number(x)))}));setJogged(true);}}>{String(name)}</Button>)}<p>Z={tool.z} мм; X (радиус)={tool.x} мм.</p><Button disabled={!jogged} variant="primary" onClick={()=>{markExplanation();setStage('settings');}}>Перейти к настройкам</Button></section>}
 {stage==='settings'&&<section className="surface turning-card"><h2>План и настройки проходов</h2><p>Целевые размеры задают итоговую поверхность; глубина задаёт снятие за один проход. В первых двух заданиях размеры фиксированы автором.</p>
 {lesson.blankChoices&&<label>Заготовка<select aria-label="Заготовка" value={plan.blankId??''} onChange={e=>{core.chooseBlank(e.target.value);setPreview(false);refresh();}}><option value="">Выберите заготовку</option>{lesson.blankChoices.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
 {isFinal&&<LearningRecap/>}
 {plan.operations.map((o,i)=>{if(o.kind!=='turning'||!o.training)return null;const step=o.training;return <fieldset key={o.id} onFocus={()=>setSelection(region(step))}><legend>Операция {i+1}</legend><Button onClick={()=>{setSelection(region(step));drawingRef.current?.scrollIntoView({block:'start',behavior:'smooth'});}}>К связанному размеру {i+1}</Button><label>Инструмент<select aria-label={`Инструмент операции ${i+1}`} value={o.toolId??''} onChange={e=>{const t=findTurningTool(e.target.value);edit(plan.operations.map((op,j)=>j===i&&op.kind==='turning'?{...op,toolId:e.target.value||null,training:{...step,target:step.target.kind==='drill'&&t?.diameter?{...step.target,diameter:t.diameter}:step.target}}:op));}}><option value="">Выберите инструмент</option>{TURNING_TOOLS.filter(t=>(lesson.toolIds??['passing-choice','facing-choice']).includes(t.id)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 <label>Операция<select aria-label={`Вид операции ${i+1}`} disabled={lesson.fixedTargets||allowed.length===1} value={step.target.kind} onChange={e=>{const target=defaultTarget(e.target.value as TrainingTarget['kind'],lesson);update(i,{target,settings:{...step.settings,feed:target.kind==='thread'?target.pitch:.08,depth:target.kind==='thread'?.15:1}});}}>{allowed.map(k=><option key={k} value={k}>{OPERATION_NAMES[k]}</option>)}</select></label>
 {Object.entries(step.target).filter(([k,v])=>typeof v==='number'&&!(step.target.kind==='chamfer'&&k==='radialDepth')&&!(step.target.kind==='groove'&&k==='z1')&&!(step.target.kind==='thread'&&['pitch','depth','phase'].includes(k))).map(([key,v])=><label key={key}>{({z0:'Начало Z от патрона, мм',z1:'Конец Z от патрона, мм',diameter:step.target.kind==='drill'?'Диаметр выбранного сверла, мм':'Целевой диаметр, мм',length:'Конечная длина, мм',axialLength:'Размер фаски 45°, мм',depth:'Глубина от свободного торца до плоского дна, мм (включая выход для сквозного)'} as Record<string,string>)[key]}<input aria-label={`${key} операции ${i+1}`} disabled={lesson.fixedTargets||(step.target.kind==='drill'||step.target.kind==='thread')&&key==='diameter'} type="number" min="0" max="100" step="0.1" value={Number(v)} onChange={e=>{const value=Number(e.target.value);update(i,{...step,target:{...step.target,[key]:value,...(step.target.kind==='chamfer'&&key==='axialLength'?{radialDepth:value}:{})}});}}/></label>)}
 {step.target.kind==='thread'&&<><label>Размер и шаг по чертежу<select aria-label={`Резьба операции ${i+1}`} value={`${step.target.diameter}:${step.target.pitch}`} onChange={e=>{const [diameter,pitch]=e.target.value.split(':').map(Number);if(step.target.kind==='thread'){const target={...step.target,diameter,pitch};update(i,{...step,target:{...target,depth:threadDepth(target)}});}}}>{THREAD_CATALOG.map(r=><option key={r.pitch} value={`${r.diameter}:${r.pitch}`}>M{r.diameter}×{r.pitch}</option>)}</select></label><p>Правая, один заход. Подача = шаг {step.target.pitch} мм/об: независимая подача заблокирована. Установленная глубина — максимум снятия за проход (до 0,2 мм); полный учебный профиль требует {threadDepth(step.target)} мм. Подвод и выход — по {threadRecipe(step.target)?.runout} мм, без уступа. Все проходы синхронизированы относительно Z=0.</p><ThreadLesson pitch={step.target.pitch}/></>}
 {step.target.kind==='groove'&&<label>Ширина канавки, мм<input aria-label={`width операции ${i+1}`} type="number" min="2" step=".1" value={step.target.z1-step.target.z0} onChange={e=>{if(step.target.kind==='groove')update(i,{...step,target:{...step.target,z1:step.target.z0+Number(e.target.value)}});}}/></label>}
 {step.target.kind==='drill'&&<p>Упрощённое сверло с плоским дном, без конусной вершины. Глубина отверстия {Math.min(60,step.target.depth)} мм; выход {Math.max(0,step.target.depth-60)} мм. Подача — осевое движение сверла за оборот; радиальные проходы не применяются.</p>}
 {(['rpm','feed','depth'] as const).filter(key=>key!=='depth'||!['drill','chamfer'].includes(step.target.kind)).map(key=>{const r=settingRule(lesson,key,step.target.kind),labels={rpm:'Обороты, об/мин',feed:'Подача, мм/об',depth:step.target.kind==='drill'?'Радиальная глубина не применяется · фиксированный служебный параметр':step.target.kind==='chamfer'?'Фаска выполняется за один проход':step.target.kind==='face'?'Снятие по Z за подрезку, мм':'Глубина по радиусу за проход, мм'};return <label key={key}>{labels[key]} {step.settings[key]}{r.positions?<><input aria-label={`${key} операции ${i+1}`} disabled={!r.enabled||step.target.kind==='drill'||step.target.kind==='chamfer'||key==='feed'&&step.target.kind==='thread'} type="range" min="0" max={r.positions.length-1} step="1" value={r.positions.indexOf(step.settings[key])} onChange={e=>update(i,{...step,settings:{...step.settings,[key]:r.positions![Number(e.target.value)]}})}/><span>Малая {r.positions[0]} · средняя {r.positions[1]} · большая {r.positions[2]}</span></>:<input aria-label={`${key} операции ${i+1}`} disabled={!r.enabled||step.target.kind==='drill'||step.target.kind==='chamfer'||key==='feed'&&step.target.kind==='thread'} type="number" min={r.min} max={r.max} step={key==='rpm'?50:.01} value={step.settings[key]} onChange={e=>update(i,{...step,settings:{...step.settings,[key]:Number(e.target.value)}})}/>}</label>;})}
 {!lesson.fixedTargets&&<div><Button disabled={i===0} onClick={()=>{const ops=[...plan.operations];[ops[i],ops[i-1]]=[ops[i-1],ops[i]];edit(ops);}}>Выше {i+1}</Button><Button onClick={()=>edit(plan.operations.filter((_,j)=>i!==j))}>Удалить {i+1}</Button></div>}</fieldset>;})}
 {!lesson.fixedTargets&&<Button disabled={plan.operations.length>=10} onClick={()=>edit([...plan.operations,{kind:'turning',id:crypto.randomUUID(),diameter:18,length:10,toolId:newLesson?null:'passing-choice',training:{target:defaultTarget(lesson.targets[0].kind,lesson),settings:{rpm:lesson.targets[0].kind==='thread'?300:600,feed:lesson.targets[0].kind==='thread'?lesson.targets[0].pitch:newLesson?.08:.2,depth:lesson.targets[0].kind==='thread'?.15:1}}}])}>Добавить операцию</Button>}
 <p>Расчётное время {Math.round(checked.calculatedSeconds)} с · проходов {checked.passes.length} · нагрузка {checked.maxLoad.toFixed(0)}/100 · качество последнего прохода {checked.part?.surfaceQuality?.toFixed(0)??'—'}/100</p><p>Это детерминированная учебная модель, не профессиональные режимы настоящего станка. Скорость подачи = подача × обороты, мм/мин. Анимация ускорена в 40 раз; расчётное время от этого не меняется.</p>
 {checked.part&&<p>Ожидаемая минимальная стенка: {(()=>{const g=geometryOf(checked.part);return g.ok?minimumWall(g.value).toFixed(1):'—';})()} мм. Для внутренней обработки требуется не менее 1 мм.</p>}
 <Button onClick={()=>setPreview(true)}>Предпросмотр</Button>{preview&&checked.part&&<PartWorkview part={checked.part} requirements={lesson.requirements} display={lesson.drawing} selection={selection} onSelect={setSelection} title="Пробный результат — заготовка не изменена"/>}
 {[...checked.errors,...checked.warnings].map((e,i)=><p key={i} role="alert">{e}</p>)}<Button variant="primary" disabled={checked.errors.length>0||checked.maxLoad>100} onClick={start}>Подтвердить настройки и изготовить</Button><Button onClick={()=>setHelp(!help)}>Объяснение и подсказка</Button></section>}
 {stage==='runtime'&&session&&<section className="surface turning-card"><h2>Изготовление</h2><RuntimeHints session={session}/><PartWorkview part={runtime!.item??raw} requirements={lesson.requirements} display={lesson.drawing} selection={selection} onSelect={setSelection} title="Фактическая деталь" rotating={!paused&&runtime!.stage==='processing'} toolZ={pass?movingZ:undefined} toolX={pass?movingX:undefined} toolKind={pass?.target.kind==='drill'?'drill':pass?.target.kind==='bore'||pass?.target.kind==='thread'&&pass.target.surface==='inner'?'bore':undefined} toolDirection={pass?.target.kind==='face'||pass?.target.kind==='groove'?'x':'z'}/><p>Проход {Math.min(session.opsTotal,session.opsDone+(!session.ended?1:0))} из {session.opsTotal} · {runtime!.stage==='stored'?100:Math.round(session.progress*100)}% текущего прохода. Геометрия фиксируется по завершении прохода; при остановке сохраняются последний завершённый профиль и остаток времени текущего прохода. {paused?'Станок остановлен; оставшаяся обработка сохранена.':''}</p>
 {pass&&<p>Текущая глубина от свободного торца: {Math.max(0,stockLength-movingZ).toFixed(1)} мм. Минимальная оставшаяся стенка по фактическому профилю: {remainingWall.toFixed(1)} мм (обновляется после прохода).</p>}
 {pass?.target.kind==='thread'&&<p>Резьба: {threadMotion(pass.target,session!.progress).segment}. Шпиндель: {Math.abs(threadMotion(pass.target,session!.progress).turns).toFixed(2)} оборотов от общей фазы Z=0; шаг {pass.target.pitch} мм, подача {pass.settings.feed} мм/об. Готовность фиксируется по глубине после прохода.</p>}
 {actualGeometry?.ok&&actualGeometry.value.threads?.map(t=><p key={`${t.surface}-${t.z0}`}>{threadLabel(t)}</p>)}
 {pass&&<p>Операция {pass.step}: проход {pass.pass}/{pass.count}, подача {pass.settings.feed}, глубина {pass.settings.depth}; расчёт {pass.calculatedSeconds.toFixed(1)} с; нагрузка {pass.load.toFixed(0)}/100, ожидаемое качество {pass.quality.toFixed(0)}/100.</p>}
 <Button disabled={!!session.ended} onClick={()=>{session.setPaused(!paused);setPaused(!paused);}}>{paused?'Продолжить обработку':'Остановить станок'}</Button>
 {runtime!.stage==='stored'&&<>{isFinal&&<LearningRecap/>}<h3>{session.ended==='completed'?'Деталь соответствует заказу':'Деталь не соответствует заказу'}</h3><p>Качество {runtime!.item?.surfaceQuality?.toFixed(0)??'—'}/100. Последнее реальное снятие {runtime!.item?.lastCutDepth?.toFixed(2)??'—'} мм (по радиусу при точении, по Z при подрезке).</p>{core.assessment?.differences.map(d=><p key={d.characteristic}>{d.characteristic}: ожидалось {d.expected}; получилось {d.actual}</p>)}
 {session.ended==='completed'?<Button variant="primary" onClick={()=>{if(!finished.current){finished.current=true;onFinished(session);}}}>Результат и награды</Button>:<Button onClick={()=>{session.detach();core.retry();setSession(null);setStage('settings');setError('');}}>Изменить план и исправить</Button>}</>}
 <Button onClick={()=>{session.detach();core.reset();core.setPlan(learnerPlan(lesson));setSession(null);setStage(needsProbe()?'probe':'settings');setJogged(false);finished.current=false;setPreview(false);setError('');refresh();}}>Начать заново</Button></section>}
 {error&&<p role="alert">{error}</p>}
 </main>;
}

function defaultTarget(kind:TrainingTarget['kind'],lesson:TurningLesson):TrainingTarget{
 const authored=lesson.targets.find(t=>t.kind===kind);if(authored)return structuredClone(authored);
 return kind==='thread'?{kind:'thread',surface:'inner',diameter:12,pitch:1.5,z0:30,z1:60,depth:.75,phase:0}:kind==='drill'?{kind:'drill',diameter:8,depth:40}:kind==='bore'?{kind:'bore',z0:40,z1:60,diameter:12}:kind==='face'?{kind:'face',length:50}:kind==='chamfer'?{kind:'chamfer',end:'free',axialLength:2,radialDepth:2}:{kind,z0:20,z1:30,diameter:18};
}
