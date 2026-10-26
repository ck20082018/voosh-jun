import type {TurningGeometry,TurningOperation,TurningSetup,GeometryResult,ProfileSpan} from './turningGeometry';
export interface ThreadFeature {
 profile:'metric-60';hand:'right';starts:1;surface:'outer'|'inner';
 diameter:number;pitch:number;z0:number;z1:number;depth:number;phase:number;
}
export type ThreadOperation=Extract<TurningOperation,{kind:'thread'}>;
/** Finite teaching recipes. Sources and the boundary from manufacturing standards: docs/THREADING.md. */
export const THREAD_CATALOG=[
 {diameter:12,pitch:1,outerPrepared:12,innerPrepared:11,outerDepth:.63,innerDepth:.5,leadIn:2,runout:2,maxPass:.2},
 {diameter:12,pitch:1.5,outerPrepared:12,innerPrepared:10.5,outerDepth:.92,innerDepth:.75,leadIn:3,runout:3,maxPass:.2},
] as const;
export const threadRecipe=(t:{diameter:number;pitch:number})=>THREAD_CATALOG.find(r=>r.diameter===t.diameter&&r.pitch===t.pitch);
export const threadDepth=(t:{diameter:number;pitch:number;surface:'outer'|'inner'})=>{const r=threadRecipe(t);return r?(t.surface==='outer'?r.outerDepth:r.innerDepth):NaN;};
const near=(a:number,b:number)=>Math.abs(a-b)<=1e-6;
const error=(code:'invalid-geometry'|'invalid-size'|'invalid-setup'|'chuck-collision'|'wall-breakthrough'|'adds-material'|'unreachable'|'thread-damaged',message:string):GeometryResult<never>=>({ok:false,error:{code,message}});
const radius=(s:ProfileSpan,z:number,inner:boolean)=>{const a=inner?s.inner0:s.outer0,b=inner?s.inner1:s.outer1;return a+(b-a)*(z-s.z0)/(s.z1-s.z0);};
export function normalizedThreads(threads:readonly ThreadFeature[]=[]):ThreadFeature[]{
 const out:ThreadFeature[]=[];
 for(const t of [...threads].sort((a,b)=>a.surface.localeCompare(b.surface)||a.z0-b.z0)){
  const p=out.at(-1);
  if(p&&near(p.z1,t.z0)&&['surface','profile','hand','starts','diameter','pitch','depth','phase'].every(k=>{const a=p[k as keyof ThreadFeature],b=t[k as keyof ThreadFeature];return typeof a==='number'&&typeof b==='number'?near(a,b):a===b;}))p.z1=t.z1;
  else out.push({...t});
 }
 return out;
}
export function sameThreads(a:readonly ThreadFeature[]=[],b:readonly ThreadFeature[]=[]):boolean{
 const x=normalizedThreads(a),y=normalizedThreads(b);return x.length===y.length&&x.every((t,i)=>Object.keys(t).every(k=>{const a=t[k as keyof ThreadFeature],b=y[i][k as keyof ThreadFeature];return typeof a==='number'&&typeof b==='number'?near(a,b):a===b;}));
}
export function threadLabel(t:ThreadFeature):string{return `M${t.diameter}×${t.pitch} · ${t.surface==='inner'?'внутренняя':'наружная'} · правая, 1 заход · Z${t.z0}–${t.z1} · ${Math.round(100*t.depth/threadDepth(t))}%`;}
export function validateThreads(g:TurningGeometry):GeometryResult<true>{
 for(const [i,t] of (g.threads??[]).entries()){
  const r=threadRecipe(t),budget=threadDepth(t);
  if(!r||t.profile!=='metric-60'||t.hand!=='right'||t.starts!==1||!['inner','outer'].includes(t.surface)||![t.z0,t.z1,t.depth,t.phase].every(Number.isFinite)||t.phase!==0||t.z0<0||t.z1>g.length||t.z1<=t.z0||t.depth<=0||t.depth>budget+1e-6)return error('invalid-geometry','Некорректный признак метрической правой одноходовой резьбы.');
  if(g.threads!.slice(0,i).some(p=>p.surface===t.surface&&Math.min(p.z1,t.z1)>Math.max(p.z0,t.z0)))return error('invalid-geometry','Участки резьбы на одной поверхности не должны перекрываться.');
 }
 return {ok:true,value:true};
}
/** Conservative root-to-root material wall. Threading remains a feature, not a helical mesh. */
export function minimumWall(g:TurningGeometry):number{
 const cuts=[...new Set([...g.spans.flatMap(s=>[s.z0,s.z1]),...(g.threads??[]).flatMap(t=>[Math.max(0,t.z0-(threadRecipe(t)?.runout??0)),t.z1])])].sort((a,b)=>a-b);
 let wall=Infinity;
 for(let i=1;i<cuts.length;i++){
  const a=cuts[i-1],b=cuts[i],mid=(a+b)/2,s=g.spans.find(s=>s.z0<=mid&&s.z1>=mid);if(!s)continue;
  const outer=(g.threads??[]).find(t=>t.surface==='outer'&&t.z0-(threadRecipe(t)?.runout??0)<=mid&&t.z1>=mid),inner=(g.threads??[]).find(t=>t.surface==='inner'&&t.z0-(threadRecipe(t)?.runout??0)<=mid&&t.z1>=mid);
  wall=Math.min(wall,...[a,b].map(z=>radius(s,z,false)-(outer?.depth??0)-radius(s,z,true)-(inner?.depth??0)));
 }
 return wall;
}
function threadTarget(g:TurningGeometry,setup:TurningSetup,op:ThreadOperation,singlePass:boolean):GeometryResult<TurningGeometry>{
 const r=threadRecipe(op),budget=threadDepth(op);
 if(!r||!['inner','outer'].includes(op.surface)||![op.z0,op.z1,op.depth,op.phase??0].every(Number.isFinite)||op.depth<=0||op.depth>budget+1e-6||op.z1<=op.z0)return error('invalid-size','Выберите поддерживаемую M12×1 или M12×1,5 и положительный участок/учебную глубину из каталога.');
 if((op.phase??0)!==0)return error('invalid-size','Повторные проходы должны сохранять общую нулевую фазу относительно Z=0.');
 if(op.z0-r.runout<setup.gripLength||op.z1>g.length)return error('chuck-collision','Участок резьбы и выход 2 шага должны оставаться вне зоны патрона и внутри детали.');
 if(op.surface==='inner'&&g.spans.some(s=>Math.min(s.inner0,s.inner1)<=0))return error('unreachable','Внутренняя резьба сейчас разрешена только в сквозном отверстии; проход через глухое дно запрещён.');
 const prepared=op.surface==='outer'?r.outerPrepared:r.innerPrepared,inner=op.surface==='inner';
 const start=op.z0-r.runout,end=Math.min(g.length,op.z1+r.leadIn);
 for(const s of g.spans.filter(s=>s.z1>start&&s.z0<end)){
  if([Math.max(start,s.z0),Math.min(end,s.z1)].some(z=>!near(radius(s,z,inner)*2,prepared)))return error('unreachable',`Подготовьте ровную ${inner?'внутреннюю':'наружную'} поверхность Ø${prepared} мм на участке резьбы, подвода и выхода. Уступ на пути инструмента запрещён.`);
 }
 const existing=(g.threads??[]).find(t=>t.surface===op.surface&&Math.min(t.z1,op.z1)>Math.max(t.z0,op.z0));
 if(existing&&(existing.z0!==op.z0||existing.z1!==op.z1||existing.pitch!==op.pitch||existing.diameter!==op.diameter||existing.phase!==(op.phase??0)))return error('thread-damaged','Повторный проход должен совпадать с размером, шагом, участком и фазой уже начатой резьбы.');
 if(existing&&op.depth<existing.depth)return error('adds-material','Глубина резьбы не может уменьшаться: операция только снимает материал.');
 if(singlePass&&op.depth-(existing?.depth??0)>r.maxPass+1e-6)return error('invalid-size',`За один проход резьбы можно снять не более ${r.maxPass} мм по радиусу. Нужны последовательные проходы.`);
 const t:ThreadFeature={profile:'metric-60',hand:'right',starts:1,surface:op.surface,diameter:op.diameter,pitch:op.pitch,z0:op.z0,z1:op.z1,depth:Math.min(op.depth,budget),phase:0};
 const result:TurningGeometry={...structuredClone(g),threads:normalizedThreads([...(g.threads??[]).filter(t=>t!==existing),t])};
 if(minimumWall(result)<(setup.minWallThickness??1)-1e-6)return error('wall-breakthrough','Впадины резьбы оставляют стенку тоньше допустимой.');
 return {ok:true,value:result};
}
/** Preserve features after unrelated cuts. No silent erasure/refilling of an existing thread. */
export function retainThreads(before:TurningGeometry,after:TurningGeometry,setup:TurningSetup):GeometryResult<TurningGeometry>{
 if(!before.threads?.length)return {ok:true,value:after};
 for(const t of before.threads){
  if(t.z1>after.length)return error('thread-damaged','Сначала подрежьте торец, затем нарежьте резьбу: подрезка пересекает готовый участок.');
  const cuts=[...new Set([t.z0,t.z1,...[...before.spans,...after.spans].flatMap(s=>[s.z0,s.z1]).filter(z=>z>t.z0&&z<t.z1)])].sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){
   const a=cuts[i-1],b=cuts[i],mid=(a+b)/2,x=before.spans.find(s=>s.z0<=mid&&s.z1>=mid),y=after.spans.find(s=>s.z0<=mid&&s.z1>=mid);
   if(!x||!y||[a,b].some(z=>!near(radius(x,z,t.surface==='inner'),radius(y,z,t.surface==='inner'))))return error('thread-damaged','Обработка пересекает уже нарезанную поверхность. Подготовьте её до резьбы.');
  }
 }
 const result={...after,threads:structuredClone(before.threads)};
 if(minimumWall(result)<(setup.minWallThickness??1)-1e-6)return error('wall-breakthrough','Обработка оставляет слишком тонкую стенку у впадин резьбы.');
 return {ok:true,value:result};
}
/** Global phase anchor Z=0; RPM only changes time, never this axial/rotational relation. */
export function threadMotion(t:ThreadOperation,progress:number){
 const r=threadRecipe(t)!;const p=Math.max(0,Math.min(1,progress));
 const travel=r.leadIn+t.z1-t.z0+r.runout,z=t.z1+r.leadIn-travel*p;
 const segment=z>t.z1?'Подвод':z<t.z0?'Выход и отвод':'Нарезание';
 const engagement=z>t.z1?Math.max(0,1-(z-t.z1)/r.leadIn):z<t.z0?Math.max(0,1-(t.z0-z)/r.runout):1;
 const prepared=t.surface==='outer'?r.outerPrepared/2:r.innerPrepared/2;
 return {z,x:t.surface==='outer'?prepared+1-(1+t.depth)*engagement:prepared-1+(1+t.depth)*engagement,turns:-z/t.pitch,segment,travel};
}

export const applyThread=(g:TurningGeometry,setup:TurningSetup,op:ThreadOperation)=>threadTarget(g,setup,op,true);
/** Validate an operation goal / build independent order geometry; never used as a manufacturing pass. */
export const checkThreadTarget=(g:TurningGeometry,setup:TurningSetup,op:ThreadOperation)=>threadTarget(g,setup,op,false);
