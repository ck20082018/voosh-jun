import {normalizedThreads,threadLabel} from './threading';
import {GEOMETRY_TOLERANCE_MM, normalizeGeometry, turningSurfaceData, validateGeometry, type ProfileSpan, type TurningOperation, type TurningGeometry} from './turningGeometry';
export type DrawingView='main'|'end'|'section'|'detail'|'volume';
export interface DrawingSelection {z0:number;z1:number;surface:'outer'|'inner'|'length';id?:string}
export interface DrawingDimension extends DrawingSelection {id:string;label?:string;kind:'length'|'outer'|'inner'|'thread'}
export interface DrawingDisplay {
 /** Author data; JSON-serializable millimetres on the sheet, independent of part geometry. */
 sheet?:import('./drawing/sheet').SheetSettings;
 views?:readonly DrawingView[];
 dimensions?:readonly DrawingDimension[];
 detail?:{z0:number;z1:number;label:string;thread?:{pitch:number;surface:'outer'|'inner'}};
}
export interface Point {x:number;y:number}
export interface DrawingFrame {length:number;radius:number;scale:number;left:number;axis:number}
export const mm=(n:number)=>Number(n.toFixed(6)).toString();
export function drawingFrame(...geometries:TurningGeometry[]):DrawingFrame{
 const length=Math.max(...geometries.map(g=>g.length));
 const radius=Math.max(...geometries.flatMap(g=>g.spans.flatMap(s=>[s.outer0,s.outer1])));
 return {length,radius,scale:Math.min(490/length,150/radius),left:55,axis:205};
}
export function projectMeridian(z:number,radius:number,f:DrawingFrame):Point{return {x:f.left+z*f.scale,y:f.axis-radius*f.scale};}
/** Fixed oblique orthographic projection: Z is axial, angle is around that axis. */
export function projectVolume(z:number,radius:number,angle:number,f:DrawingFrame):Point{
 const x=radius*Math.cos(angle),y=radius*Math.sin(angle);
 return {x:75+z*f.scale*.82+x*f.scale*.48,y:210+z*f.scale*.12-y*f.scale*.82};
}
export function pointsPath(points:readonly Point[],closed=true):string{
 return points.length?`M${points.map(p=>`${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' L')}${closed?' Z':''}`:'';
}
export function radiusAt(s:ProfileSpan,z:number,inner=false){return (inner?s.inner0:s.outer0)+((inner?s.inner1:s.outer1)-(inner?s.inner0:s.outer0))*(z-s.z0)/(s.z1-s.z0);}
export function clippedSpans(g:TurningGeometry,z0:number,z1:number):ProfileSpan[]{
 if(!Number.isFinite(z0)||!Number.isFinite(z1)||z1<=z0)return [];
 return g.spans.filter(s=>s.z1>z0&&s.z0<z1).map(s=>{const a=Math.max(z0,s.z0),b=Math.min(z1,s.z1);return {z0:a,z1:b,outer0:radiusAt(s,a),outer1:radiusAt(s,b),inner0:radiusAt(s,a,true),inner1:radiusAt(s,b,true)};});
}
export function meridianPaths(g:TurningGeometry,f:DrawingFrame){
 const data=turningSurfaceData(g);if(!data.ok)throw Error(data.error.message);
 const surface=(inner:boolean)=>{const points=inner?data.value.inner:data.value.outer;return pointsPath([...points.map(p=>projectMeridian(p.z,p.radius,f)),...[...points].reverse().map(p=>projectMeridian(p.z,-p.radius,f))]);};
 return {outer:surface(false),inner:surface(true),material:surface(false)+' '+surface(true)};
}
export function materialStrips(g:TurningGeometry,f:DrawingFrame):string[]{
 // Two separate material quadrilaterals per span: holes are never painted/hatch-filled.
 return g.spans.flatMap(s=>[1,-1].map(sign=>pointsPath([
 projectMeridian(s.z0,sign*s.outer0,f),projectMeridian(s.z1,sign*s.outer1,f),projectMeridian(s.z1,sign*s.inner1,f),projectMeridian(s.z0,sign*s.inner0,f)])));
}
export function drawingDimensions(g:TurningGeometry,display:DrawingDisplay={}):DrawingDimension[]{
 if(display.dimensions)return structuredClone([...display.dimensions]);
 const spans=normalizeGeometry(g).spans;
 const boreStart=spans.find(s=>s.inner0>0||s.inner1>0)?.z0;
 const boreLength:DrawingDimension[]=boreStart!==undefined&&spans.at(-1)!.inner1>0?[{id:'bore-length',kind:'length',surface:'inner',z0:boreStart,z1:g.length,label:boreStart===0?'Длина сквозной полости':'Глубина отверстия со свободного торца'}]:[];
 return [...normalizedThreads(g.threads).map(t=>({id:`thread-${t.surface}-${mm(t.z0)}-${mm(t.z1)}`,kind:'thread' as const,surface:t.surface,z0:t.z0,z1:t.z1,label:'Резьба'})),...boreLength,{id:'total-length',kind:'length',surface:'length',z0:0,z1:g.length,label:'Общая длина'},...spans.flatMap(s=>{
  const key=`${mm(s.z0)}-${mm(s.z1)}`;
  const dims:DrawingDimension[]=[{id:`outer-${key}`,kind:'outer',surface:'outer',z0:s.z0,z1:s.z1}, {id:`length-${key}`,kind:'length',surface:'length',z0:s.z0,z1:s.z1}];
  if(s.inner0>0||s.inner1>0)dims.push({id:`inner-${key}`,kind:'inner',surface:'inner',z0:s.z0,z1:s.z1});
  return dims;
 })];
}
export function dimensionValue(g:TurningGeometry,d:DrawingDimension):number[]|null{
 if(d.kind==='thread'){const t=normalizedThreads(g.threads).find(t=>t.surface===d.surface&&t.z0===d.z0&&t.z1===d.z1);return t?[t.diameter,t.pitch,t.z1-t.z0,t.depth,t.phase]:null;}
 if(d.id==='total-length'&&d.kind==='length')return [g.length];
 if(d.z0<0||d.z1>d.z0&&d.z1>g.length+GEOMETRY_TOLERANCE_MM||d.z1<=d.z0)return null;
 if(d.kind==='length')return d.id==='total-length'?[g.length]:[d.z1-d.z0];
 const spans=clippedSpans(g,d.z0,d.z1);if(!spans.length)return null;
 const values=spans.flatMap(s=>d.kind==='outer'?[s.outer0*2,s.outer1*2]:[s.inner0*2,s.inner1*2]);
 return [Math.min(...values),Math.max(...values)];
}
export function dimensionText(g:TurningGeometry,d:DrawingDimension):string{
 if(d.kind==='thread'){const t=normalizedThreads(g.threads).find(t=>t.surface===d.surface&&t.z0===d.z0&&t.z1===d.z1);return t?threadLabel(t):'резьба отсутствует';}
 const values=dimensionValue(g,d);if(!values)return 'нет материала на заданном интервале';
 const value=values.length===1||Math.abs(values[0]-values[1])<=GEOMETRY_TOLERANCE_MM?mm(values[0]):`${mm(values[0])}–${mm(values[1])}`;
 return `${d.kind==='length'?'':'Ø'}${value} мм`;
}
export interface DimensionDifference {dimension:DrawingDimension;expected:string;actual:string;message:string}
export function compareDrawing(expected:TurningGeometry,actual:TurningGeometry,display:DrawingDisplay={}):DimensionDifference[]{
 const base=[...drawingDimensions(expected),...drawingDimensions(expected,display),...drawingDimensions(actual).filter(d=>d.kind==='inner'||d.kind==='thread')];
 const dims=[...new Map(base.map(d=>[d.id,d])).values()],out:DimensionDifference[]=[];
 for(const d of dims){
  const a=dimensionValue(expected,d),b=dimensionValue(actual,d);
  // Compare diameter surfaces at every breakpoint, not only extrema.
  const cuts=[d.z0,d.z1,...actual.spans.flatMap(s=>[s.z0,s.z1]).filter(z=>z>d.z0&&z<d.z1),...expected.spans.flatMap(s=>[s.z0,s.z1]).filter(z=>z>d.z0&&z<d.z1)].sort((x,y)=>x-y);
  const tolerance=d.kind==='outer'||d.kind==='inner'?2*GEOMETRY_TOLERANCE_MM:GEOMETRY_TOLERANCE_MM;
  let same=!!a&&!!b&&a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<=tolerance);
  if(same&&d.kind!=='length'&&d.kind!=='thread')same=cuts.slice(1).every((z1,i)=>{const z0=cuts[i];if(z1<=z0)return true;const mid=(z0+z1)/2,x=expected.spans.find(s=>s.z0<=mid&&s.z1>=mid),y=actual.spans.find(s=>s.z0<=mid&&s.z1>=mid);return !!x&&!!y&&[z0,z1].every(z=>Math.abs(radiusAt(x,z,d.kind==='inner')-radiusAt(y,z,d.kind==='inner'))*2<=tolerance);});
  if(!same){const want=dimensionText(expected,d),got=dimensionText(actual,d);out.push({dimension:{...d},expected:want,actual:got,message:`${d.label??(d.kind==='inner'?'Внутренний диаметр':d.kind==='outer'?'Наружный диаметр':'Длина участка')} Z${mm(d.z0)}–${mm(d.z1)}: требуется ${want}, получилось ${got}${want===got?' (различается распределение профиля по Z)':''}.`});}
 }
 // A longer actual part is caught by total length even if author hides total dimension.
 if(Math.abs(expected.length-actual.length)>GEOMETRY_TOLERANCE_MM&&!out.some(d=>d.dimension.id==='total-length')){
  const dimension:DrawingDimension={id:'total-length',kind:'length',surface:'length',z0:0,z1:expected.length,label:'Общая длина'};
  out.push({dimension,expected:`${mm(expected.length)} мм`,actual:`${mm(actual.length)} мм`,message:`Общая длина: требуется ${mm(expected.length)} мм, получилось ${mm(actual.length)} мм.`});
 }
 return out;
}
export interface VolumeFace {path:string;surface:'outer'|'inner'|'end'|'cut';z0:number;z1:number;shade:number}
export function volumeFaces(g:TurningGeometry,f:DrawingFrame,cutaway:boolean):VolumeFace[]{
 const result:VolumeFace[]=[];
 const angles=Array.from({length:25},(_,i)=>i*Math.PI*2/24);
 const start=cutaway?6:0; // Remove the front-upper quadrant to expose the bore.
 const add=(points:Point[],surface:VolumeFace['surface'],z0:number,z1:number,shade:number)=>result.push({path:pointsPath(points),surface,z0,z1,shade});
 for(const s of g.spans){
  for(const inner of [false,true]){
   if(inner&&!cutaway)continue;
   const r0=inner?s.inner0:s.outer0,r1=inner?s.inner1:s.outer1;
   if(inner&&r0===0&&r1===0)continue;
   for(let j=start;j<24;j++){
    const a=angles[j],b=angles[j+1];
    add([projectVolume(s.z0,r0,a,f),projectVolume(s.z1,r1,a,f),projectVolume(s.z1,r1,b,f),projectVolume(s.z0,r0,b,f)],inner?'inner':'outer',s.z0,s.z1,Math.sin((a+b)/2));
   }
  }
  if(cutaway)for(const a of [angles[start],angles[24]])add([projectVolume(s.z0,s.outer0,a,f),projectVolume(s.z1,s.outer1,a,f),projectVolume(s.z1,s.inner1,a,f),projectVolume(s.z0,s.inner0,a,f)],'cut',s.z0,s.z1,.5);
 }
 // Annular faces at both ends AND at radius jumps, including blind-hole bottoms.
 const boundaries=[{z:0,a:g.spans[0],b:null},...g.spans.slice(1).map((b,i)=>({z:b.z0,a:g.spans[i],b})),{z:g.length,a:g.spans.at(-1)!,b:null}];
 for(const {z,a,b} of boundaries){
  const atStart=z===0,outerA=atStart?a.outer0:a.outer1,innerA=atStart?a.inner0:a.inner1;
  const edges=b?[...new Set([innerA,outerA,b.inner0,b.outer0])].sort((x,y)=>x-y):[innerA,outerA];
  const rings=edges.slice(1).map((r1,i)=>[edges[i],r1]).filter(([r0,r1])=>{if(!b)return true;const r=(r0+r1)/2;return (r>innerA&&r<outerA)!==(r>b.inner0&&r<b.outer0);});
  for(const [r0,r1] of rings){if(r1-r0<GEOMETRY_TOLERANCE_MM)continue;for(let j=start;j<24;j++)add([projectVolume(z,r1,angles[j],f),projectVolume(z,r1,angles[j+1],f),projectVolume(z,r0,angles[j+1],f),projectVolume(z,r0,angles[j],f)],'end',z,z,.4);}
 }
 // This projection places the free end in front: draw in ascending axial order.
 return result.sort((a,b)=>(a.z0+a.z1)-(b.z0+b.z1));
}
export function validDrawing(g:TurningGeometry):string|null{const v=validateGeometry(g);return v.ok?null:v.error.message;}

export function operationDrawingRegion(operation:TurningOperation,stockLength:number):DrawingSelection{
 if(operation.kind==='face')return {z0:operation.length,z1:stockLength,surface:'length'};
 if(operation.kind==='chamfer')return {z0:stockLength-operation.axialLength,z1:stockLength,surface:'outer'};
 if(operation.kind==='drill')return {z0:stockLength-operation.depth,z1:stockLength,surface:'inner'};
 return {z0:operation.z0,z1:operation.z1,surface:operation.kind==='bore'||operation.kind==='thread'&&operation.surface==='inner'?'inner':'outer'};
}

/** Sparse comparison contours: no dense facet-wire overlay hiding the cavity. */
export function volumeContours(g:TurningGeometry,f:DrawingFrame,cutaway:boolean):string[]{
 const data=turningSurfaceData(g);if(!data.ok)return [];
 const paths:string[]=[];
 for(const points of [data.value.outer,...cutaway?[data.value.inner]:[]])for(const angle of [Math.PI/2,3*Math.PI/2])paths.push(pointsPath(points.map(p=>projectVolume(p.z,p.radius,angle,f)),false));
 for(const s of g.spans)for(const [z,outer,inner] of [[s.z0,s.outer0,s.inner0],[s.z1,s.outer1,s.inner1]])for(const r of [outer,...inner>0?[inner]:[]]){
  const start=cutaway?Math.PI/2:0;
  paths.push(pointsPath(Array.from({length:25},(_,i)=>projectVolume(z,r,start+(Math.PI*2-start)*i/24,f)),!cutaway));
 }
 return [...new Set(paths)];
}

/** Actual exposed meridian boundaries: never close a line across an open bore mouth. */
export function sectionContours(g:TurningGeometry,f:DrawingFrame):string[]{
 const paths:string[]=[];
 for(const s of g.spans)for(const sign of [1,-1]){
  paths.push(pointsPath([projectMeridian(s.z0,sign*s.outer0,f),projectMeridian(s.z1,sign*s.outer1,f)],false));
  if(s.inner0>0||s.inner1>0)paths.push(pointsPath([projectMeridian(s.z0,sign*s.inner0,f),projectMeridian(s.z1,sign*s.inner1,f)],false));
 }
 const boundaries=[{z:0,a:g.spans[0],b:null},...g.spans.slice(1).map((b,i)=>({z:b.z0,a:g.spans[i],b})),{z:g.length,a:g.spans.at(-1)!,b:null}];
 for(const {z,a,b} of boundaries){
  const outer=z===0?a.outer0:a.outer1,inner=z===0?a.inner0:a.inner1;
  const edges=b?[...new Set([inner,outer,b.inner0,b.outer0])].sort((x,y)=>x-y):[inner,outer];
  for(let i=1;i<edges.length;i++){
   const low=edges[i-1],high=edges[i],mid=(low+high)/2;
   if(b&&(mid>inner&&mid<outer)===(mid>b.inner0&&mid<b.outer0))continue;
   for(const sign of [1,-1])paths.push(pointsPath([projectMeridian(z,sign*low,f),projectMeridian(z,sign*high,f)],false));
  }
 }
 return paths;
}
