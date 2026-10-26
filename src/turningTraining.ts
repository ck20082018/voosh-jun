import type { Level, OperationSpec } from './level';
import { toyAxleLevel } from './playerLevel';
import { applyTurningOperation, geometryOf, type Part } from './manufacturing';
import { sameGeometry, type TurningGeometry, type TurningOperation } from './turningGeometry';
import type { PlayerPlan, PlanPreview } from './planning';
export interface CuttingSettings { rpm:number; feed:number; depth:number }
export interface SettingRule { enabled:boolean; min:number; max:number; positions?:readonly number[] }
export interface TrainingStep { target:Extract<TurningOperation,{kind:'outside-turn'|'face'}>; settings:CuttingSettings }
export interface TurningLesson {
 id:string; title:string; explanation:string; targets:TrainingStep['target'][]; requirements:TurningGeometry;
 rules:Record<keyof CuttingSettings,SettingRule>; fixedTargets:boolean; minQuality?:number;
 material:'Сталь'|'Алюминий'; tool:'passing'; grip:number;
}
/** Dimensionless teaching coefficients, NOT professional machine cutting data. */
export const CUTTING_MODEL={
 animationSpeed:40,
 materials:{'Сталь':{load:1,optimalRpm:600,rpm:1200,feed:.4,depth:3},'Алюминий':{load:.7,optimalRpm:800,rpm:1600,feed:.35,depth:2.5}},
 tools:{passing:{load:1,maxFeed:.4,maxDepth:3}},
 operations:{'outside-turn':{load:1,maxFeed:.4,maxDepth:3},face:{load:1.15,maxFeed:.2,maxDepth:1.5}},
 loadScale:90, overload:100, finishFeed:.12, finishDepth:.25,
};
export function settingRule(lesson:TurningLesson,key:keyof CuttingSettings,kind:'outside-turn'|'face'):SettingRule{
 const r=lesson.rules[key],material=CUTTING_MODEL.materials[lesson.material],tool=CUTTING_MODEL.tools[lesson.tool],operation=CUTTING_MODEL.operations[kind];
 const ceiling=key==='rpm'?material.rpm:key==='feed'?Math.min(material.feed,tool.maxFeed,operation.maxFeed):Math.min(material.depth,tool.maxDepth,operation.maxDepth);
 const max=Math.min(r.max,ceiling);
 return {...r,max,positions:r.positions?.filter(v=>v<=max)};
}
export function cuttingEstimate(settings:CuttingSettings, distance:number, material:TurningLesson['material'],kind:'outside-turn'|'face',removedDepth:number){
 const m=CUTTING_MODEL.materials[material];
 const speed=settings.rpm*settings.feed; // mm/min = revolutions/min × mm/revolution
 const seconds=60*distance/speed;
 const load=removedDepth*settings.feed*(settings.rpm/m.optimalRpm)*CUTTING_MODEL.loadScale*m.load*CUTTING_MODEL.tools.passing.load*CUTTING_MODEL.operations[kind].load;
 const quality=Math.max(0,Math.min(100,100-160*Math.max(0,settings.feed-.08)-12*Math.abs(Math.log2(settings.rpm/m.optimalRpm))-12*Math.max(0,removedDepth-.25)));
 return {seconds,load,quality};
}
export interface SurfacePass { target:TrainingStep['target']; grip:number; settings:CuttingSettings; calculatedSeconds:number; load:number; quality:number; removedDepth:number; step:number; pass:number; count:number }
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
 let part:Part|null=blank?{shape:'cylinder',diameter:Number(blank.params.diameter),length:Number(blank.params.length),material:String(blank.params.material),blankId:blank.id,sections:[],operationIds:[]}:null;
 for(const [i,step] of steps.entries()){
  const op=plan.operations[i];
  if(!lesson.targets.some(t=>t.kind===step.target.kind)){errors.push(`Операция ${i+1}: этот вид обработки не разрешён в задании.`);continue;}
  if(op.toolId!==(step.target.kind==='face'?'facing-choice':'passing-choice')) {errors.push(`Операция ${i+1}: нужен инструмент каталога.`);continue;}
  let bad=false;
  for(const key of ['rpm','feed','depth'] as const){const v=step.settings[key],r=settingRule(lesson,key,step.target.kind);if(!Number.isFinite(v)||v<=0||!Number.isFinite(r.min)||!Number.isFinite(r.max)||r.min<=0||r.max<r.min||v<r.min||v>r.max||r.positions&&!r.positions.includes(v)||!r.enabled&&v!==r.min){errors.push(`Операция ${i+1}: ${key} вне авторского диапазона.`);bad=true;}}
  if(bad||!part)continue;
  const initial=geometryOf(part);if(!initial.ok){errors.push(initial.error.message);continue;}
  const target=step.target;
  const validation=applyTurningOperation(part,{chuckSide:'z0',gripLength:lesson.grip},target,'validation');
  if(!validation.ok){errors.push(`Операция ${i+1}: ${validation.error.message}`);continue;}
  let allowance=target.kind==='face'?part.length-target.length:Math.max(...initial.value.spans.filter(s=>s.z1>target.z0&&s.z0<target.z1).map(s=>Math.max(s.outer0,s.outer1)))-target.diameter/2;
  const count=Math.max(1,Math.ceil((allowance-1e-9)/step.settings.depth));
  if(count>100){errors.push('Слишком много проходов: увеличьте глубину.');continue;}
  for(let j=1;j<=count;j++){
   const removed=Math.min(step.settings.depth,Math.max(0,allowance));allowance-=removed;
   const passTarget:TrainingStep['target']=target.kind==='face'?{kind:'face',length:target.length+allowance}:{...target,diameter:target.diameter+2*allowance};
   const next=applyTurningOperation(part!,{chuckSide:'z0',gripLength:lesson.grip},passTarget,`step-${i}-pass-${j}`);
   if(!next.ok){errors.push(next.error.message);break;}
   const distance=target.kind==='face'?Math.max(...initial.value.spans.map(s=>s.outer1)):target.z1-target.z0;
   const estimate=cuttingEstimate(step.settings,distance,lesson.material,target.kind,removed);
   const pass:SurfacePass={target:passTarget,grip:lesson.grip,settings:{...step.settings},calculatedSeconds:estimate.seconds,load:estimate.load,quality:estimate.quality,removedDepth:removed,step:i+1,pass:j,count};
   passes.push(pass);
   const spec:OperationSpec={kind:'turning',id:`step-${i}-pass-${j}`,diameter:passTarget.kind==='outside-turn'?passTarget.diameter:20,length:distance,seconds:Math.max(.15,estimate.seconds/CUTTING_MODEL.animationSpeed),surfacePass:pass};
   operations.push(spec);tools[spec.id]={id:op.toolId!,name:target.kind==='face'?'Подрезной резец':'Проходной резец',category:'turning',kind:target.kind==='face'?'facing':'passing'};
   part=next.value;
   if(removed>1e-9){part.surfaceQuality=pass.quality;part.lastCutDepth=removed;}
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
 return {id:`turning-${i+1}`,title:titles[i],explanation:explanations[i],targets,requirements:(geometryOf(part) as {ok:true;value:TurningGeometry}).value,material:'Сталь',tool:'passing',grip:10,fixedTargets:i<2||i===4,
 minQuality:i===5?85:undefined,
 rules:{rpm:i<2?{enabled:false,min:600,max:600}:{enabled:true,min:300,max:1200},feed:i<2?{enabled:true,min:.08,max:.35,positions:[.08,.2,.35]}:{enabled:true,min:.05,max:.4},depth:i<4?{enabled:false,min:1,max:1}:i===4?{enabled:true,min:.5,max:2,positions:[.5,1,2]}:{enabled:true,min:.1,max:3}}};
});
export function trainingLevel(lesson:TurningLesson):Level{
 const l=toyAxleLevel();l.id=lesson.id;l.name=lesson.title;
 const catalog=l.nodes.find(n=>n.type==='catalog')!;catalog.params.blankIds=['steel-stock'];catalog.params.machineIds=['lathe-choice'];catalog.params.toolIds=['passing-choice','facing-choice'];catalog.params.allowedOperations=[{kind:'turning',seconds:1}];
 const keep=new Set(['steel-stock','lathe-choice','passing-choice','facing-choice']);
 const drop=new Set(l.nodes.filter(n=>['blank','lathe','tool'].includes(n.type)&&!keep.has(n.id)).map(n=>n.id));
 l.nodes=l.nodes.filter(n=>!drop.has(n.id)).map(({groupId,...n})=>n);l.edges=l.edges.filter(e=>!drop.has(e.source)&&!drop.has(e.target));l.groups=[];
 l.nodes.find(n=>n.type==='intro')!.params={title:lesson.title,text:lesson.explanation};
 l.nodes.find(n=>n.type==='task')!.params={title:lesson.title,instruction:'Подтвердите настройки, изготовьте деталь и сравните её с чертежом заказа.'};
 l.nodes.find(n=>n.type==='finish')!.params.text='Деталь соответствует учебному заказу.';
 for(const n of l.nodes.filter(n=>n.type==='hint')){
   n.params.display='panel';n.params.frequency='once';
   n.params.text=n.id==='hint-install'?'Заготовка закреплена. Резание идёт автоматически по подтверждённым режимам.':n.id==='hint-process'?'Проход завершён. Следите за номером прохода: глубина задаёт снятие за один проход, а не конечный диаметр.':'Деталь на складе сравнивается с независимым чертежом и требованиями качества.';
 }
 const goal=l.nodes.find(n=>n.type==='part')!;goal.params.length=lesson.requirements.length;
 goal.params.sections=lesson.requirements.spans.filter(s=>s.outer0<10).map(s=>({diameter:s.outer0*2,length:s.z1-s.z0}));
 return l;
}
export function initialTrainingPlan(lesson:TurningLesson):PlayerPlan{return {blankId:'steel-stock',machineId:'lathe-choice',pointId:'machine-point',operations:lesson.targets.map((target,i)=>({id:`target-${i}`,kind:'turning',diameter:target.kind==='outside-turn'?target.diameter:20,length:target.kind==='outside-turn'?target.z1-target.z0:10,toolId:target.kind==='face'?'facing-choice':'passing-choice',training:{target:{...target},settings:{...settings,feed:i===1&&lesson.minQuality!==undefined? .08:.2}}}))};}
export function geometrySuccess(part:Part,lesson:TurningLesson){const g=geometryOf(part);return part.material===lesson.material&&g.ok&&sameGeometry(g.value,lesson.requirements)&&(!lesson.minQuality||(part.surfaceQuality??0)>=lesson.minQuality&&(part.lastCutDepth??Infinity)<=CUTTING_MODEL.finishDepth);}
