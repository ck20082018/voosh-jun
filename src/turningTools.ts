import {threadRecipe} from './threading';
import type {TurningGeometry,TurningOperation,GeometryResult} from './turningGeometry';
export type TrainingTarget=TurningOperation;
export interface TurningTool {
 id:string;name:string;kind:string;operations:readonly TrainingTarget['kind'][];
 maxFeed:number;maxDepth:number;load:number;reach:number;minEntry?:number;diameter?:number;width?:number;
}
/** Small teaching catalog. Limits are game parameters, not real machining recommendations. */
export const TURNING_TOOLS:readonly TurningTool[]=[
 {id:'passing-choice',name:'Проходной резец',kind:'passing',operations:['outside-turn'],maxFeed:.4,maxDepth:3,load:1,reach:60},
 {id:'facing-choice',name:'Подрезной резец',kind:'facing',operations:['face','chamfer'],maxFeed:.2,maxDepth:3,load:1,reach:60},
 {id:'groove-choice',name:'Канавочный резец 2 мм',kind:'grooving',operations:['groove'],maxFeed:.12,maxDepth:1,load:1.3,reach:50,width:2},
 {id:'drill-8',name:'Сверло Ø8 мм',kind:'drilling',operations:['drill'],maxFeed:.15,maxDepth:2,load:1.1,reach:65,diameter:8},
 {id:'bore-choice',name:'Расточной резец · вход от Ø6 мм',kind:'boring',operations:['bore'],maxFeed:.18,maxDepth:1,load:1.2,reach:65,minEntry:6},
 {id:'thread-outer',name:'Наружный резьбовой резец 60°',kind:'thread-outer',operations:['thread'],maxFeed:1.5,maxDepth:.2,load:.2,reach:55},
 {id:'thread-inner',name:'Внутренний резьбовой резец 60° · вход от Ø10',kind:'thread-inner',operations:['thread'],maxFeed:1.5,maxDepth:.2,load:.2,reach:55,minEntry:10},
];
export const toolFor=(target:TrainingTarget)=>TURNING_TOOLS.find(t=>t.operations.includes(target.kind)&&(target.kind!=='thread'||t.id===(target.surface==='inner'?'thread-inner':'thread-outer')))!;
export const findTurningTool=(id:string|null|undefined)=>TURNING_TOOLS.find(t=>t.id===id);
export function checkTurningTool(g:TurningGeometry,target:TrainingTarget,tool:TurningTool|undefined):GeometryResult<true>{
 const fail=(code:'tool-incompatible'|'unreachable'|'missing-hole',message:string):GeometryResult<never>=>({ok:false,error:{code,message}});
 if(!tool||!tool.operations.includes(target.kind))return fail('tool-incompatible','Неверный инструмент: выберите инструмент для этой операции из каталога.');
 if(target.kind==='thread'&&tool.id!==(target.surface==='inner'?'thread-inner':'thread-outer'))return fail('tool-incompatible','Для наружной и внутренней резьбы нужны разные резьбовые резцы.');
 if(target.kind==='chamfer'&&target.radialDepth>tool.maxDepth)return fail('tool-incompatible',`Размер фаски превышает допустимое снятие ${tool.maxDepth} мм за проход.`);
 if(target.kind==='drill'){
  if(target.diameter!==tool.diameter)return fail('tool-incompatible',`Диаметр отверстия задаёт сверло: выбранное сверло имеет Ø${tool.diameter} мм.`);
  if(target.depth>tool.reach)return fail('unreachable',`Сверло достигает глубины ${tool.reach} мм, включая выход.`);
 }
 if(target.kind==='groove'&&target.z1-target.z0<(tool.width??0))return fail('tool-incompatible',`Канавка уже режущей кромки ${tool.width} мм.`);
 if('z0' in target&&g.length-target.z0+(target.kind==='thread'?(threadRecipe(target)?.runout??0):0)>tool.reach)return fail('unreachable',`Недостижимый участок: вылет инструмента ${tool.reach} мм от свободного торца.`);
 if(target.kind==='bore'||target.kind==='thread'&&target.surface==='inner'){
  const path=g.spans.filter(s=>s.z1>target.z0);
  if(!path.length||path.some(s=>Math.min(s.inner0+(s.inner1-s.inner0)*(Math.max(s.z0,target.z0)-s.z0)/(s.z1-s.z0),s.inner1)*2<(tool.minEntry??0)))return fail('missing-hole',`Расточной резец требует предварительный проходной канал не менее Ø${tool.minEntry} мм по всему пути подвода. Сначала сверление; в сплошную заготовку резец не входит.`);
 }
 return {ok:true,value:true};
}
export function operationLabel(t:TrainingTarget):string{
 switch(t.kind){
  case 'thread':return `Резьба M${t.diameter}×${t.pitch}, ${t.surface==='inner'?'внутренняя':'наружная'}, Z${t.z0}–${t.z1}`;
  case 'outside-turn':return `Точение Z${t.z0}–${t.z1}, Ø${t.diameter} мм`;
  case 'face':return `Подрезка до длины ${t.length} мм`;
  case 'groove':return `Канавка Z${t.z0}, ширина ${t.z1-t.z0} мм, Ø${t.diameter} мм`;
  case 'chamfer':return `Фаска 45° · ${t.axialLength} × ${t.radialDepth} мм`;
  case 'drill':return `Сверление Ø${t.diameter}, глубина цилиндрической части ${t.depth} мм от свободного торца (с выходом для сквозного)`;
  case 'bore':return `Расточка Z${t.z0}–${t.z1}, Ø${t.diameter} мм`;
 }
}
export const OPERATION_NAMES:Record<TrainingTarget['kind'],string>={'outside-turn':'Продольное точение',face:'Подрезка свободного торца',groove:'Наружная канавка',chamfer:'Фаска 45°',drill:'Осевое сверление',bore:'Растачивание',thread:'Метрическая резьба'};
