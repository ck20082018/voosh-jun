import {threadRecipe,threadDepth,threadMotion,checkThreadTarget} from './threading';
import {blankPart,dimensions} from './manufacturing';
import {checkTurningTool,findTurningTool,toolFor,TURNING_TOOLS,type TrainingTarget,type TurningTool} from './turningTools';
import type {TurningSetup} from './turningGeometry';
import type {DrawingDisplay} from './drawingGeometry';
import type { Level, OperationSpec } from './level';
import { toyAxleLevel } from './playerLevel';
import { applyTurningOperation, geometryOf, type Part } from './manufacturing';
import { sameGeometry, type TurningGeometry, type TurningOperation } from './turningGeometry';
import type { PlayerPlan, PlanPreview } from './planning';
export interface CuttingSettings { rpm:number; feed:number; depth:number }
export interface SettingRule { enabled:boolean; min:number; max:number; positions?:readonly number[] }
export interface TrainingStep { target:TrainingTarget; settings:CuttingSettings }
export interface TurningLesson {
 stockDiameter?:number; blankChoices?:readonly {id:string;name:string;diameter:number;material:string}[];
 drawing?:DrawingDisplay;
 setup?:TurningSetup; initialBoreDiameter?:number; allowedKinds?:readonly TrainingTarget['kind'][]; toolIds?:readonly string[]; learningKey?:string;
 id:string; title:string; explanation:string; targets:TrainingStep['target'][]; requirements:TurningGeometry;
 rules:Record<keyof CuttingSettings,SettingRule>; fixedTargets:boolean; minQuality?:number;
 material:'Сталь'|'Алюминий'; tool:'passing'; grip:number;
}
/** Dimensionless teaching coefficients, NOT professional machine cutting data. */
export const CUTTING_MODEL={
 animationSpeed:40,
 materials:{'Сталь':{load:1,optimalRpm:600,rpm:1200,feed:.4,depth:3},'Алюминий':{load:.7,optimalRpm:800,rpm:1600,feed:.35,depth:2.5}},
 tools:{passing:{load:1,maxFeed:.4,maxDepth:3}},
 operations:{'outside-turn':{load:1,maxFeed:.4,maxDepth:3},face:{load:1.15,maxFeed:.2,maxDepth:1.5},groove:{load:1.3,maxFeed:.12,maxDepth:1},chamfer:{load:.8,maxFeed:.2,maxDepth:1.5},drill:{load:1.1,maxFeed:.15,maxDepth:2},bore:{load:1.2,maxFeed:.18,maxDepth:1},thread:{load:.5,maxFeed:1.5,maxDepth:.2}},
 loadScale:90, overload:100, finishFeed:.12, finishDepth:.25,
};
export function settingRule(lesson:TurningLesson,key:keyof CuttingSettings,kind:TrainingTarget['kind']):SettingRule{
 if(kind==='thread'&&key==='feed')return {enabled:false,min:1,max:1.5};
 const r=lesson.rules[key],material=CUTTING_MODEL.materials[lesson.material],tool=CUTTING_MODEL.tools[lesson.tool],operation=CUTTING_MODEL.operations[kind];
 const ceiling=key==='rpm'?material.rpm:key==='feed'?Math.min(material.feed,tool.maxFeed,operation.maxFeed):Math.min(material.depth,tool.maxDepth,operation.maxDepth);
 const max=Math.min(r.max,ceiling,kind==='thread'&&key==='depth'?.2:Infinity);
 return {...r,max,positions:r.positions?.filter(v=>v<=max)};
}
export function cuttingEstimate(settings:CuttingSettings, distance:number, material:TurningLesson['material'],kind:TrainingTarget['kind'],removedDepth:number,selectedTool?:TurningTool){
 const m=CUTTING_MODEL.materials[material];
 const speed=settings.rpm*settings.feed; // mm/min = revolutions/min × mm/revolution
 const seconds=60*distance/speed;
 const load=removedDepth*settings.feed*(settings.rpm/m.optimalRpm)*CUTTING_MODEL.loadScale*m.load*(selectedTool?.load??CUTTING_MODEL.tools.passing.load)*CUTTING_MODEL.operations[kind].load;
 const quality=kind==='thread'?Math.max(0,100-15*Math.abs(Math.log2(settings.rpm/300))-100*Math.max(0,removedDepth-.12)):Math.max(0,Math.min(100,100-160*Math.max(0,settings.feed-.08)-12*Math.abs(Math.log2(settings.rpm/m.optimalRpm))-12*Math.max(0,removedDepth-.25)));
 return {seconds,load,quality};
}
export interface SurfacePass { setup?:TurningSetup;toolId?:string; target:TrainingStep['target']; grip:number; settings:CuttingSettings; calculatedSeconds:number; load:number; quality:number; removedDepth:number; step:number; pass:number; count:number }
export interface TrainingPreview extends PlanPreview { passes:SurfacePass[]; calculatedSeconds:number; maxLoad:number }
export function trainingSteps(plan:PlayerPlan):TrainingStep[]{return plan.operations.map(o=>o.kind==='turning'&&o.training?o.training:null).filter((o):o is TrainingStep=>!!o);}
export function checkTrainingPlan(level:Level,plan:PlayerPlan,lesson:TurningLesson):TrainingPreview{
 const errors:string[]=[],passes:SurfacePass[]=[],operations:OperationSpec[]=[],tools:PlanPreview['tools']={};
 const blank=level.nodes.find(n=>n.id===plan.blankId&&n.type==='blank');
 const catalog=level.nodes.find(n=>n.type==='catalog')!;
 if(!blank||!(catalog.params.blankIds as string[]).includes(blank.id))errors.push('Выберите заготовку каталога.');
 if(!(catalog.params.machineIds as string[]).includes(plan.machineId??''))errors.push('Выберите токарный станок.');
 if(!level.grid.points.some(p=>p.id===plan.pointId)||level.placements.some(p=>p.pointId===plan.pointId))errors.push('Разместите станок на свободной точке.');
 const steps=trainingSteps(plan);
 if(!steps.length||steps.length!==plan.operations.length||steps.length>20)errors.push('Добавьте от 1 до 20 токарных операций.');
 if(lesson.fixedTargets&&JSON.stringify(steps.map(s=>s.target))!==JSON.stringify(lesson.targets))errors.push('На этом уровне целевые размеры заданы автором.');
 let part:Part|null=null;
 if(blank)try{part=blankPart({...dimensions(blank.params),id:blank.id,name:String(blank.params.name),material:String(blank.params.material),...(blank.params.initialBoreDiameter!==undefined?{initialBoreDiameter:Number(blank.params.initialBoreDiameter)}:{})});}catch(e){errors.push((e as Error).message);}
 const setup=lesson.setup??{chuckSide:'z0' as const,gripLength:lesson.grip};
 for(const [i,step] of steps.entries()){
  const op=plan.operations[i];
  if(!(lesson.allowedKinds??lesson.targets.map(t=>t.kind)).includes(step.target.kind)){errors.push(`Операция ${i+1}: этот вид обработки не разрешён в задании.`);continue;}
  const tool=findTurningTool(op.toolId);
  if(!tool||!(catalog.params.toolIds as string[]).includes(tool.id)){errors.push(`Операция ${i+1}: выберите инструмент каталога.`);continue;}
  let bad=false;
  for(const key of ['rpm','feed','depth'] as const){const v=step.settings[key],r=settingRule(lesson,key,step.target.kind);if(key==='feed'&&step.target.kind==='thread'){if(v!==step.target.pitch){errors.push(`Операция ${i+1}: подача одноходовой резьбы должна равняться шагу.`);bad=true;}continue;}if(!Number.isFinite(v)||v<=0||!Number.isFinite(r.min)||!Number.isFinite(r.max)||r.min<=0||r.max<r.min||v<r.min||v>r.max||r.positions&&!r.positions.includes(v)||!r.enabled&&v!==r.min){errors.push(`Операция ${i+1}: ${key} вне авторского диапазона.`);bad=true;}}
  if(bad||!part)continue;
  const initial=geometryOf(part);if(!initial.ok){errors.push(initial.error.message);continue;}
  const target=step.target;
  const toolCheck=checkTurningTool(initial.value,target,tool);if(!toolCheck.ok){errors.push(`Операция ${i+1}: ${toolCheck.error.message}`);continue;}
  if(step.settings.feed>tool.maxFeed||step.settings.depth>tool.maxDepth){errors.push(`Операция ${i+1}: уменьшите подачу до ${tool.maxFeed} мм/об и глубину до ${tool.maxDepth} мм для выбранного инструмента.`);continue;}
  const validation=target.kind==='thread'?checkThreadTarget(initial.value,setup,target):applyTurningOperation(part,setup,target,'validation');
  if(!validation.ok){errors.push(`Операция ${i+1}: ${validation.error.message}`);continue;}
  const area='z0' in target?initial.value.spans.filter(s=>s.z1>target.z0&&s.z0<target.z1):initial.value.spans;
  let allowance=target.kind==='face'?part.length-target.length:target.kind==='outside-turn'||target.kind==='groove'?Math.max(...area.map(s=>Math.max(s.outer0,s.outer1)))-target.diameter/2:target.kind==='bore'?target.diameter/2-Math.min(...area.map(s=>Math.min(s.inner0,s.inner1))):target.kind==='chamfer'?target.radialDepth:target.kind==='thread'?target.depth-(initial.value.threads?.find(t=>t.surface===target.surface&&t.z0===target.z0&&t.z1===target.z1)?.depth??0):target.diameter/2;
  const single=target.kind==='drill'||target.kind==='chamfer';
  const count=single?1:Math.max(1,Math.ceil((allowance-1e-9)/step.settings.depth));
  if(count>100){errors.push('Слишком много проходов: увеличьте глубину.');continue;}
  const scheduled: {target:TrainingTarget;removed:number}[]=[];
  for(let j=1;j<=count;j++){
   const removed=single?allowance:Math.min(step.settings.depth,Math.max(0,allowance));allowance-=removed;
   const passTarget:TrainingTarget=target.kind==='face'?{...target,length:target.length+allowance}:target.kind==='outside-turn'||target.kind==='groove'?{...target,diameter:target.diameter+2*allowance}:target.kind==='bore'?{...target,diameter:target.diameter-2*allowance}:target.kind==='thread'?{...target,depth:target.depth-allowance,phase:0}:{...target};
   const pieces=radialPassTargets(initial.value,passTarget);
   for(const piece of pieces){
    if(piece.kind==='groove'){
     const width=tool.width??2,n=Math.ceil((piece.z1-piece.z0)/width);
     for(let k=0;k<n;k++){const z0=Math.min(piece.z0+k*width,piece.z1-width);scheduled.push({target:{...piece,z0,z1:z0+width},removed});}
    }else scheduled.push({target:piece,removed});
   }
  }
  for(const [passIndex,{target:passTarget,removed}] of scheduled.entries()){
   const j=passIndex+1;
   const beforePass=geometryOf(part!);
   const next=applyTurningOperation(part!,setup,passTarget,`step-${i}-pass-${j}`);
   if(!next.ok){errors.push(next.error.message);break;}
   const distance=passTarget.kind==='thread'?passTarget.z1-passTarget.z0+threadRecipe(passTarget)!.leadIn+threadRecipe(passTarget)!.runout:passTarget.kind==='face'?Math.max(...initial.value.spans.map(s=>s.outer1)):passTarget.kind==='drill'?passTarget.depth:passTarget.kind==='chamfer'?Math.hypot(passTarget.axialLength,passTarget.radialDepth):passTarget.kind==='groove'?Math.max(removed,0.01):passTarget.z1-passTarget.z0;
   const afterPass=geometryOf(next.value);
   const changed=beforePass.ok&&afterPass.ok&&!sameGeometry(beforePass.value,afterPass.value);
   const effectiveRemoved=changed?removed:0;
   const estimate=cuttingEstimate(step.settings,distance,lesson.material,target.kind,effectiveRemoved,tool);
   const pass:SurfacePass={toolId:tool.id,setup:{...setup},target:passTarget,grip:lesson.grip,settings:{...step.settings},calculatedSeconds:estimate.seconds,load:estimate.load,quality:estimate.quality,removedDepth:effectiveRemoved,step:i+1,pass:j,count:scheduled.length};
   passes.push(pass);
   const spec:OperationSpec={kind:'turning',id:`step-${i}-pass-${j}`,diameter:passTarget.kind==='outside-turn'?passTarget.diameter:20,length:distance,seconds:Math.max(.15,estimate.seconds/CUTTING_MODEL.animationSpeed),surfacePass:pass};
   operations.push(spec);tools[spec.id]={id:tool.id,name:tool.name,category:'turning',kind:tool.kind};
   part=next.value;
   if(changed){part.surfaceQuality=pass.quality;part.lastCutDepth=effectiveRemoved;}
  }
 }
 const maxLoad=Math.max(0,...passes.map(p=>p.load));
 return {errors,warnings:maxLoad>CUTTING_MODEL.overload?['Перегрузка: запуск запрещён. Уменьшите глубину, подачу или обороты. Настройки не изменены.']:[],part:errors.length?null:part,operations,tools,passes,calculatedSeconds:passes.reduce((s,p)=>s+p.calculatedSeconds,0),maxLoad};
}
const settings={rpm:600,feed:.2,depth:1};
const outside=(z0:number,z1:number,diameter:number):TrainingStep['target']=>({kind:'outside-turn',z0,z1,diameter});
const targetSets=[ [outside(30,60,16)], [outside(20,45,16),outside(45,60,12)], [outside(15,30,18),outside(30,45,14),outside(45,60,10)], [{kind:'face' as const,length:50}], [outside(20,60,10)], [outside(20,60,10.4),outside(20,60,10)] ];
const titles=['Первая ступень','Две ступени','Три ступени','Ровный торец','Большой припуск','Гладкая поверхность'];
const explanations=[
 'Заготовка вращается. Резец идёт вдоль Z. Подача 0,2 мм/об означает: за один оборот резец продвинется на 0,2 мм. Попробуйте среднюю подачу.',
 'Два обработанных участка имеют разные диаметры и длины; оставшееся плечо у патрона не считается ступенью задания.',
 'Составьте последовательность трёх участков по чертежу. Z отсчитывается от торца у патрона; внутрь патрона заходить нельзя.',
 'Подрезной резец движется поперёк оси, по X. Уберите 10 мм со свободного торца; начало Z не перемещается.',
 'Снятие 1 мм по радиусу уменьшает диаметр на 2 мм. Припуск 5 мм по радиусу снимается за несколько проходов выбранной глубины.',
 'Сначала оставьте 0,2 мм по радиусу: Ø10,4. Затем отдельным чистовым проходом получите Ø10 с малой подачей. Пустой проход поверхность не улучшает.',
];
export const TURNING_LESSONS:TurningLesson[]=targetSets.map((targets,i)=>{
 let part:Part={shape:'cylinder',diameter:20,length:60,blankId:'steel-stock',material:'Сталь',sections:[],operationIds:[]};
 for(const target of targets){const next=applyTurningOperation(part,{chuckSide:'z0',gripLength:10},target,'author');if(!next.ok)throw Error(next.error.message);part=next.value;}
 return {drawing:{views:i<3?['main','volume']:['main','end','section','volume']},id:`turning-${i+1}`,title:titles[i],explanation:explanations[i],targets,requirements:(geometryOf(part) as {ok:true;value:TurningGeometry}).value,material:'Сталь',tool:'passing',grip:10,fixedTargets:i<2||i===4,
 minQuality:i===5?85:undefined,
 rules:{rpm:i<2?{enabled:false,min:600,max:600}:{enabled:true,min:300,max:1200},feed:i<2?{enabled:true,min:.08,max:.35,positions:[.08,.2,.35]}:{enabled:true,min:.05,max:.4},depth:i<4?{enabled:false,min:1,max:1}:i===4?{enabled:true,min:.5,max:2,positions:[.5,1,2]}:{enabled:true,min:.1,max:3}}};
});
export function trainingLevel(lesson:TurningLesson):Level{
 const l=toyAxleLevel();l.id=lesson.id;l.name=lesson.title;
 const catalog=l.nodes.find(n=>n.type==='catalog')!;catalog.params.blankIds=lesson.blankChoices?lesson.blankChoices.map(b=>b.id):['steel-stock'];
 if(lesson.stockDiameter)l.nodes.find(n=>n.id==='steel-stock')!.params.diameter=lesson.stockDiameter;
 for(const b of lesson.blankChoices??[]){const existing=l.nodes.find(n=>n.id===b.id);const node=existing??{...structuredClone(l.nodes.find(n=>n.id==='steel-stock')!),id:b.id};node.params={...node.params,name:b.name,diameter:b.diameter,material:b.material};if(!existing)l.nodes.push(node);}catalog.params.machineIds=['lathe-choice'];catalog.params.toolIds=[...(lesson.toolIds??['passing-choice','facing-choice'])];catalog.params.allowedOperations=[{kind:'turning',seconds:1}];
 for(const t of TURNING_TOOLS.filter(t=>(catalog.params.toolIds as string[]).includes(t.id)&&!l.nodes.some(n=>n.id===t.id))){const node=structuredClone(l.nodes.find(n=>n.id==='passing-choice')!);node.id=t.id;node.params={...node.params,name:t.name,kind:t.kind};l.nodes.push(node);}
 if(lesson.initialBoreDiameter)l.nodes.find(n=>n.id==='steel-stock')!.params.initialBoreDiameter=lesson.initialBoreDiameter;
 const keep=new Set([...(catalog.params.blankIds as string[]),'lathe-choice',...(catalog.params.toolIds as string[])]);
 const drop=new Set(l.nodes.filter(n=>['blank','lathe','tool'].includes(n.type)&&!keep.has(n.id)).map(n=>n.id));
 l.nodes=l.nodes.filter(n=>!drop.has(n.id)).map(({groupId,...n})=>n);l.edges=l.edges.filter(e=>!drop.has(e.source)&&!drop.has(e.target));l.groups=[];
 l.nodes.find(n=>n.type==='intro')!.params={title:lesson.title,text:lesson.explanation};
 l.nodes.find(n=>n.type==='task')!.params={title:lesson.title,instruction:'Подтвердите настройки, изготовьте деталь и сравните её с чертежом заказа.'};
 l.nodes.find(n=>n.type==='finish')!.params.text='Деталь соответствует учебному заказу.';
 for(const n of l.nodes.filter(n=>n.type==='hint')){
   n.params.display='panel';n.params.frequency='once';
   n.params.text=n.id==='hint-install'?'Заготовка закреплена. Резание идёт автоматически по подтверждённым режимам.':n.id==='hint-process'?'Проход завершён. Следите за номером прохода: глубина задаёт снятие за один проход, а не конечный диаметр.':'Деталь на складе сравнивается с независимым чертежом и требованиями качества.';
 }
 const goal=l.nodes.find(n=>n.type==='part')!;goal.params.length=lesson.requirements.length;goal.params.diameter=Math.max(...lesson.requirements.spans.flatMap(s=>[s.outer0,s.outer1]))*2;
 goal.params.sections=lesson.requirements.spans.filter(s=>s.outer0<10).map(s=>({diameter:s.outer0*2,length:s.z1-s.z0}));
 return l;
}
export function initialTrainingPlan(lesson:TurningLesson):PlayerPlan{return {blankId:'steel-stock',machineId:'lathe-choice',pointId:'machine-point',operations:lesson.targets.map((target,i)=>({id:`target-${i}`,kind:'turning',diameter:target.kind==='outside-turn'?target.diameter:20,length:target.kind==='outside-turn'?target.z1-target.z0:10,toolId:toolFor(target).id,training:{target:{...target},settings:{...settings,rpm:target.kind==='thread'?300:600,depth:target.kind==='thread'?.15:1,feed:target.kind==='thread'?target.pitch:Number(lesson.id.split('-')[1])>6?.08:i===1&&lesson.minQuality!==undefined?.08:.2}}}))};}
export function geometrySuccess(part:Part,lesson:TurningLesson){const g=geometryOf(part);return part.material===lesson.material&&g.ok&&sameGeometry(g.value,lesson.requirements)&&(!lesson.minQuality||(part.surfaceQuality??0)>=lesson.minQuality&&(part.lastCutDepth??Infinity)<=CUTTING_MODEL.finishDepth);}

export function initialTrainingPart(lesson:TurningLesson,id='steel-stock'):Part{return blankPart({id,name:lesson.initialBoreDiameter?'Втулка с предварительным отверстием':'Заготовка',shape:'cylinder',diameter:lesson.stockDiameter??20,length:60,material:lesson.material,initialBoreDiameter:lesson.initialBoreDiameter});}
const newTargets:TrainingTarget[][]=[
 [{kind:'groove',z0:40,z1:44,diameter:16}],
 [{kind:'chamfer',end:'free',axialLength:2,radialDepth:2}],
 [{kind:'drill',diameter:8,depth:25}],
 [{kind:'drill',diameter:8,depth:61}],
 [{kind:'bore',z0:0,z1:60,diameter:12}],
 [{kind:'drill',diameter:8,depth:40},{kind:'bore',z0:40,z1:60,diameter:12}],
];
const newTitles=['Канавка на валу','Без острой кромки','Первое отверстие','Сквозное отверстие','Расточить втулку','Ступень внутри'];
const newExplanations=[
 'Канавочный резец шириной 2 мм врезается по X. Положение задаётся по Z, ширина — вдоль оси; подача врезания ограничена 0,12 мм/об. Более широкая канавка выполняется соседними врезаниями.',
 'Подрезной резец снимает свободную наружную кромку под 45°. Размер 2 мм означает 2 мм вдоль оси и 2 мм по радиусу. Фаска действительно меняет профиль.',
 'Заготовка вращается, сверло Ø8 перемещается вдоль оси от свободного торца. Глубина измеряется до плоского дна цилиндрической части; вершина сверла в учебной модели отсутствует. Расточной резец не создаёт отверстие в сплошной заготовке — сначала нужно сверление.',
 'Для сквозного отверстия в детали длиной 60 мм нужен ход 61 мм: выход сверла 1 мм. Учебный патрон имеет осевой просвет Ø14 и свободные 2 мм за деталью; сверло Ø8 не касается его сплошной части.',
 'Исходная втулка уже имеет сквозное отверстие Ø8. Сверло создаёт отверстие своим диаметром, расточной резец расширяет готовый канал до Ø12 последовательными проходами. Вход резца — от Ø6, вылет до 65 мм; минимальная стенка 1 мм.',
 'Самостоятельно составьте маршрут: сначала глухое отверстие Ø8 глубиной 40 мм, затем расточите входную часть Z40–60 до Ø12. Останется внутренняя ступень на Z40. Резец должен проходить через входной канал; переворота нет.',
];
for(let i=0;i<6;i++){
 const setup:TurningSetup={chuckSide:'z0',gripLength:10,minWallThickness:1,...(i===3||i===4?{axialClearanceDiameter:14,exitClearance:2}:{})};
 const lesson:TurningLesson={id:`turning-${i+7}`,title:newTitles[i],explanation:newExplanations[i],targets:newTargets[i],requirements:{length:60,spans:[]},material:'Сталь',tool:'passing',grip:10,setup,initialBoreDiameter:i===4?8:undefined,fixedTargets:false,allowedKinds:i>=4?['drill','bore']:newTargets[i].map(t=>t.kind),toolIds:i>=2?['passing-choice','drill-8','bore-choice']:i===0?['passing-choice','groove-choice']:['passing-choice','facing-choice'],learningKey:['groove','chamfer','drill',undefined,'bore',undefined][i],drawing:{views:i<2?['main','end','detail','volume']:['main','end','section','volume'],...(i===1?{detail:{z0:56,z1:60,label:'Фаска 45°'}}:{})},rules:{rpm:{enabled:true,min:300,max:1200},feed:{enabled:true,min:.05,max:i===0?.12:i>=2?.15:.2},depth:{enabled:i===0||i>=4,min:i===1||i===2||i===3?1:.1,max:1}}};
 let part=initialTrainingPart(lesson);
 for(const target of lesson.targets){const result=applyTurningOperation(part,setup,target,'author');if(!result.ok)throw Error(result.error.message);part=result.value;}
 const g=geometryOf(part);if(!g.ok)throw Error(g.error.message);lesson.requirements=g.value;TURNING_LESSONS.push(lesson);
}

/** Intermediate passes skip regions already smaller (outside) or wider (inside).
 * Split linear spans at the cutting radius; never refill previously removed material. */
function radialPassTargets(g:TurningGeometry,t:TrainingTarget):TrainingTarget[]{
 if(t.kind!=='outside-turn'&&t.kind!=='bore')return [t];
 const inner=t.kind==='bore',r=t.diameter/2,out:TrainingTarget[]=[];
 for(const s of g.spans){
  const at=(z:number)=>{const a=inner?s.inner0:s.outer0,b=inner?s.inner1:s.outer1;return a+(b-a)*(z-s.z0)/(s.z1-s.z0);};
  const a=Math.max(t.z0,s.z0),b=Math.min(t.z1,s.z1);if(b<=a)continue;
  const cross=at(a)!==at(b)?a+(r-at(a))*(b-a)/(at(b)-at(a)):NaN;
  const cuts=[a,...(cross>a&&cross<b?[cross]:[]),b];
  for(let i=1;i<cuts.length;i++){const z0=cuts[i-1],z1=cuts[i],value=at((z0+z1)/2);if(inner?value<r:value>r)out.push({...t,z0,z1});}
 }
 return out.length?out:[t];
}

/** Readonly tool motion; processing progress does not manufacture intermediate geometry. */
export function turningToolPosition(t:TrainingTarget,progress:number,removed:number,length=60,outerRadius=10){
 if(t.kind==='thread')return threadMotion(t,progress);
 const p=Math.max(0,Math.min(1,progress));
 if(t.kind==='drill')return {z:length-t.depth*p,x:0};
 if(t.kind==='face')return {z:t.length,x:outerRadius*(1-p)};
 if(t.kind==='chamfer')return {z:length-t.axialLength+t.axialLength*p,x:outerRadius-t.radialDepth*p};
 if(t.kind==='groove')return {z:(t.z0+t.z1)/2,x:t.diameter/2+removed*(1-p)};
 return {z:t.z1-(t.z1-t.z0)*p,x:t.diameter/2};
}

const finalThread=(surface:'outer'|'inner',z0:number):TrainingTarget=>({kind:'thread',surface,diameter:12,pitch:1.5,z0,z1:60,depth:surface==='outer'?.92:.75,phase:0});
const finalTargets:TrainingTarget[][]=[
 [finalThread('outer',30)],
 [{kind:'drill',diameter:8,depth:61},{kind:'bore',z0:0,z1:60,diameter:10.5},finalThread('inner',30)],
 [{kind:'outside-turn',z0:20,z1:60,diameter:18},{kind:'outside-turn',z0:40,z1:60,diameter:16},{kind:'drill',diameter:8,depth:61},{kind:'bore',z0:0,z1:60,diameter:10.5},{kind:'chamfer',end:'free',axialLength:1,radialDepth:1},finalThread('inner',40)],
];
for(let i=0;i<3;i++){
 const lesson:TurningLesson={id:`turning-${i+13}`,title:['Наружная резьба','Внутренняя резьба','Заказ мастерской'][i],explanation:[
  'Заготовка Ø12 уже подготовлена. Выберите наружный резьбовой резец и шаг M12×1,5 по заказу. Для одного захода один оборот даёт перемещение на один шаг: подача связана с шагом. Повторные проходы входят в ту же канавку с общей фазой, обороты меняют время, но не шаг. Выход занимает 3 мм перед Z30.',
  'Подготовьте сквозное отверстие Ø10,5: сверление Ø8, затем расточка. Внутренний резьбовой резец требует канал от Ø10 и нарезает M12×1,5 на Z30–60. Глухое отверстие и уступ в области выхода запрещены. Один оборот — один шаг.',
  'Самостоятельно выберите стальную заготовку Ø20, инструменты и маршрут по чертежу. Сделайте наружные ступени Ø18 и Ø16, сквозной канал Ø10,5, фаску 1×1 под 45° и внутреннюю M12×1,5 на Z40–60. Всё доступно с одного свободного торца; у резьбы оставьте ровный выход Z37–40. Другие правильные маршруты принимаются.',
 ][i],targets:finalTargets[i],requirements:{length:60,spans:[]},material:'Сталь',tool:'passing',grip:10,stockDiameter:i===0?12:20,setup:{chuckSide:'z0',gripLength:10,minWallThickness:1,...(i?{axialClearanceDiameter:14,exitClearance:2}:{})},fixedTargets:false,allowedKinds:i===0?['thread']:i===1?['drill','bore','thread']:['outside-turn','drill','bore','chamfer','thread'],toolIds:i===0?['passing-choice','thread-outer','thread-inner']:i===1?['drill-8','bore-choice','thread-inner','thread-outer']:['passing-choice','facing-choice','drill-8','bore-choice','thread-inner'],learningKey:i===0?'thread-outer':i===1?'thread-inner':undefined,drawing:{views:['main','end','section','detail','volume'],detail:{z0:54,z1:60,label:'Условная схема резьбы, не профиль витка'}},rules:{rpm:{enabled:true,min:150,max:600},feed:{enabled:true,min:.05,max:.2},depth:{enabled:true,min:.05,max:1}}};
 if(i===2)lesson.blankChoices=[{id:'steel-stock',name:'Сталь Ø20 × 60',diameter:20,material:'Сталь'},{id:'thin-stock',name:'Сталь Ø14 × 60',diameter:14,material:'Сталь'},{id:'alu-stock',name:'Алюминий Ø20 × 60',diameter:20,material:'Алюминий'}];
 let part=initialTrainingPart(lesson);
 for(const t of lesson.targets){if(t.kind==='thread'){const g=geometryOf(part);if(!g.ok)throw Error(g.error.message);const result=checkThreadTarget(g.value,lesson.setup!,t);if(!result.ok)throw Error(result.error.message);part={...part,geometry:result.value};}else{const result=applyTurningOperation(part,lesson.setup!,t,'author');if(!result.ok)throw Error(result.error.message);part=result.value;}}
 const g=geometryOf(part);if(!g.ok)throw Error(g.error.message);lesson.requirements=g.value;TURNING_LESSONS.push(lesson);
}
