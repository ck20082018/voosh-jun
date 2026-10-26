import {clippedSpans,mm,radiusAt,type DrawingDimension,type DrawingSelection} from '../drawingGeometry';
import {normalizeGeometry,validateGeometry,type TurningGeometry} from '../turningGeometry';
import metrics from './fontMetrics.json';
import {threadDepth} from '../threading';
export interface SheetSettings {
 format?:'A4'|'A3'; scale?:.25|.5|1|2|4;
 /** Offsets of dimension TEXT, in paper mm. Colliding offsets are rejected, never geometry changes. */
 dimensionOffsets?:Readonly<Record<string,{x:number;y:number}>>;
 views?:readonly ('end'|'detail')[];
 detail?:{z0:number;z1:number;scale:2|4|5;surface:'outer'|'inner'};
}
export interface DrawingMetadata {title:string;material?:string;designation?:string;organization?:string;author?:string}
export interface Box {x:number;y:number;w:number;h:number}
export type Ink='outline'|'thin'|'axis'|'hidden';
export type Primitive = {kind:'path';points:readonly [number,number][];closed?:boolean;fill?:boolean;ink:Ink;role?:string} | {kind:'circle';x:number;y:number;r:number;ink:Ink;arc?:boolean} | {kind:'text';x:number;y:number;text:string;height:number;anchor?:'middle'|'end';rotation?:number;dimension?:DrawingDimension;box:Box};
export type PaperDimension=DrawingDimension&{atZ?:number};
export interface Sheet {width:number;height:number;format:'A4'|'A3';scale:number;items:Primitive[];dimensions:PaperDimension[];warnings:string[];main:{x:number;y:number;scale:number;radius:number};}
export const INK:Record<Ink,{width:number;dash?:number[]}>={outline:{width:.7},thin:{width:.25},axis:{width:.25,dash:[8,2,1,2]},hidden:{width:.25,dash:[3,1.5]}};
const widths=metrics.widths as Record<string,number>;
export const textWidth=(text:string,height:number)=>Array.from(text).reduce((n,c)=>n+(widths[c]??1),0)*height;
export function textBox(text:string,x:number,y:number,h:number,anchor:'middle'|'end'|undefined,rotation=0):Box{
 const w=textWidth(text,h),left=x-(anchor==='middle'?w/2:anchor==='end'?w:0);
 return rotation===-90?{x:x-h-.8,y:y-w/2-.8,w:h*1.4+1.6,h:w+1.6}:{x:left-.8,y:y-h-.8,w:w+1.6,h:h*1.4+1.6};
}
export const intersects=(a:Box,b:Box)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export const scaleLabel=(n:number)=>n>=1?`${n}:1`:`1:${1/n}`;
/** Minimal dimension set: axial coordinates from one base, each distinct cylinder once, chamfers by leader. No closed chains. */
export function sheetDimensions(geometry:TurningGeometry):PaperDimension[]{
 const g=normalizeGeometry(geometry),out:PaperDimension[]=[];const seen=new Set<string>();
 const push=(d:PaperDimension,key:string)=>{if(!seen.has(key)){seen.add(key);out.push(d);}};
 const chamferStarts=new Set(g.spans.filter(s=>s.z1===g.length&&s.outer0>s.outer1&&Math.abs((s.outer0-s.outer1)-(s.z1-s.z0))<1e-6).map(s=>s.z0));
 for(const s of g.spans){
  if(s.z1<g.length&&!chamferStarts.has(s.z1))push({id:`z-${mm(s.z1)}`,kind:'length',surface:'length',z0:0,z1:s.z1},`z${s.z1}`);
  if(s.outer0===s.outer1)push({id:`outer-${mm(s.z0)}-${mm(s.z1)}`,kind:'outer',surface:'outer',z0:s.z0,z1:s.z1},`outer${s.outer0}`);
  if(s.outer0!==s.outer1&&!chamferStarts.has(s.z0))for(const z of [s.z0,s.z1])push({id:`outer-${mm(s.z0)}-${mm(s.z1)}-${z}`,kind:'outer',surface:'outer',z0:s.z0,z1:s.z1,atZ:z},`outer${radiusAt(s,z)}`);
  if(s.inner0!==s.inner1)for(const z of [s.z0,s.z1])if(radiusAt(s,z,true)>0)push({id:`inner-${mm(s.z0)}-${mm(s.z1)}-${z}`,kind:'inner',surface:'inner',z0:s.z0,z1:s.z1,atZ:z},`inner${radiusAt(s,z,true)}`);
  if(s.inner0>0&&s.inner0===s.inner1)push({id:`inner-${mm(s.z0)}-${mm(s.z1)}`,kind:'inner',surface:'inner',z0:s.z0,z1:s.z1},`inner${s.inner0}`);
 }
 push({id:'total-length',kind:'length',surface:'length',z0:0,z1:g.length},'length');
 for(const t of g.threads??[]){for(const z of [t.z0,t.z1])if(z>0&&z<g.length)push({id:`z-${mm(z)}`,kind:'length',surface:'length',z0:0,z1:z},`z${z}`);out.push({id:`thread-${t.surface}-${mm(t.z0)}-${mm(t.z1)}`,kind:'thread',surface:t.surface,z0:t.z0,z1:t.z1});}
 return out;
}
/** Polygon / parallel-line intersection. Only material quadrilaterals enter this function. */
export function hatchPolygon(p:readonly [number,number][],spacing=3,angle=45):[number,number][][]{
 const a=angle*Math.PI/180,normal=[-Math.sin(a),Math.cos(a)],dir=[Math.cos(a),Math.sin(a)];
 const dots=p.map(v=>v[0]*normal[0]+v[1]*normal[1]),out:[number,number][][]=[];
 for(let k=Math.ceil(Math.min(...dots)/spacing);k*spacing<=Math.max(...dots)+1e-8;k++){
  const hits:[number,number][]=[];
  for(let i=0;i<p.length;i++){const j=(i+1)%p.length,delta=dots[j]-dots[i];if(Math.abs(delta)<1e-9)continue;const t=(k*spacing-dots[i])/delta;if(t>=0&&t<1)hits.push([p[i][0]+t*(p[j][0]-p[i][0]),p[i][1]+t*(p[j][1]-p[i][1])]);}
  hits.sort((a,b)=>(a[0]-b[0])*dir[0]+(a[1]-b[1])*dir[1]);
  if(hits.length>=2&&Math.hypot(hits.at(-1)![0]-hits[0][0],hits.at(-1)![1]-hits[0][1])>1e-7)out.push([hits[0],hits.at(-1)!]);
 }return out;
}
export function makeSheet(geometry:TurningGeometry,meta:DrawingMetadata,settings:SheetSettings={}):Sheet{
 const valid=validateGeometry(geometry);if(!valid.ok)throw Error(valid.error.message);
 const g=normalizeGeometry(geometry),format=settings.format??'A4',width=format==='A4'?210:420,height=297;
 const scale=settings.scale??1,radius=Math.max(...g.spans.flatMap(s=>[s.outer0,s.outer1]));
 const dims=sheetDimensions(g),diameters=dims.filter(d=>d.kind==='outer'||d.kind==='inner');
 const end=!!settings.views?.includes('end');
 const mainX=35+(end?2*radius*scale+20:0),mainY=65+radius*scale;
 const sheet:Sheet={width,height,format,scale,items:[],dimensions:dims,warnings:[],main:{x:mainX,y:mainY,scale,radius}};
 const items=sheet.items;
 const line=(points:readonly [number,number][],ink:Ink='thin',role?:string)=>items.push({kind:'path',points,ink,role});
 const rect=(x:number,y:number,w:number,h:number,ink:Ink='outline')=>items.push({kind:'path',points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],closed:true,ink});
 const occupied:Box[]=[];
 function text(value:string,x:number,y:number,h=3.5,anchor:'middle'|'end'|undefined=undefined,rotation=0,dimension?:DrawingDimension){
  const box=textBox(value,x,y,h,anchor,rotation);items.push({kind:'text',text:value,x,y,height:h,anchor,rotation,dimension,box});occupied.push(box);return box;
 }
 const arrow=(x:number,y:number,dx:number,dy:number)=>items.push({kind:'path',points:[[x,y],[x+dx*3-dy*.55,y+dy*3+dx*.55],[x+dx*3+dy*.55,y+dy*3-dx*.55]],closed:true,fill:true,ink:'thin'});
 const pt=(z:number,r:number,x=mainX,y=mainY,k=scale):[number,number]=>[x+z*k,y-r*k];
 const hole=g.spans.some(s=>s.inner0||s.inner1);
 const threadThinRadius=(t:NonNullable<TurningGeometry['threads']>[number],k:number)=>{const s=g.spans.find(s=>s.z0<=t.z0&&s.z1>t.z0)!;const base=t.surface==='inner'?radiusAt(s,t.z0,true):radiusAt(s,t.z0);return base+(t.surface==='inner'?1:-1)*Math.max(.8/k,Math.min(t.pitch,t.depth));};
 function profile(spans:TurningGeometry['spans'],x:number,y:number,k:number,section:boolean,detail=false){
  const P=(z:number,r:number):[number,number]=>[x+z*k,y-r*k];
  // Merge collinear contour edges; internal span boundaries never become fictitious face seams.
  for(const sign of [1,-1]){
   for(let i=0;i<spans.length;i++){
    const s=spans[i],prev=spans[i-1];
    line([P(s.z0,sign*s.outer0),P(s.z1,sign*s.outer1)],'outline');
    if(prev&&prev.outer1!==s.outer0)line([P(s.z0,sign*prev.outer1),P(s.z0,sign*s.outer0)],'outline');
    if(s.inner0||s.inner1){line([P(s.z0,sign*s.inner0),P(s.z1,sign*s.inner1)],section?'outline':'hidden');}
    if(prev&&prev.inner1!==s.inner0)line([P(s.z0,sign*prev.inner1),P(s.z0,sign*s.inner0)],section?'outline':'hidden');
    if(section){const poly=[P(s.z0,sign*s.outer0),P(s.z1,sign*s.outer1),P(s.z1,sign*s.inner1),P(s.z0,sign*s.inner0)];const chamfer=spans.some(a=>Math.abs(Math.abs((a.outer1-a.outer0)/(a.z1-a.z0))-1)<1e-6);for(const h of hatchPolygon(poly,3,chamfer?30:45))line(h,'thin','hatch');}
   }
  }
  for(const [s,z,r,o] of [[spans[0],spans[0].z0,'inner0','outer0'],[spans.at(-1)!,spans.at(-1)!.z1,'inner1','outer1']] as const){
   if(detail&&z!==0&&z!==g.length){const low=P(z,-s[o]),high=P(z,s[o]);line([low,[low[0]-1,y+2],[low[0]+1,y-2],high],'thin');continue;}
   if(s[r]===0)line([P(z,s[o]),P(z,-s[o])],'outline');
   else for(const sign of [1,-1])line([P(z,sign*s[r]),P(z,sign*s[o])],'outline');
  }
  line([[x+spans[0].z0*k-5,y],[x+spans.at(-1)!.z1*k+5,y]],'axis');
  for(const t of g.threads??[]){if(t.z1<spans[0].z0||t.z0>spans.at(-1)!.z1)continue;const r=threadThinRadius(t,k),visible=t.surface==='outer'||section;
   for(const sign of [1,-1])line([P(Math.max(t.z0,spans[0].z0),sign*r),P(Math.min(t.z1,spans.at(-1)!.z1),sign*r)],visible?'thin':'hidden');
   const s=spans.find(s=>s.z0<=t.z0&&s.z1>=t.z0);if(s){const r0=t.surface==='inner'?radiusAt(s,t.z0,true):radiusAt(s,t.z0);for(const sign of [1,-1])line([P(t.z0,sign*r0),P(t.z0,sign*r)],visible?'outline':'hidden');}
  }
 }
 // Longitudinal symmetry-plane section replaces main view. It needs no cutting-plane label in direct projection.
 profile(g.spans,mainX,mainY,scale,hole);
 occupied.push({x:mainX-1,y:mainY-radius*scale-1,w:g.length*scale+2,h:radius*2*scale+2});
 if(end){const cx=35+radius*scale,cy=mainY,s=g.spans.at(-1)!;
  // Visible concentric steps behind the free end: larger radii remain visible.
  let rim=0;for(const a of [...g.spans].reverse())for(const r of [a.outer1,a.outer0])if(r>rim){items.push({kind:'circle',x:cx,y:cy,r:r*scale,ink:'outline'});rim=r;}
  let aperture=Infinity;
  if(s.inner1>0)for(const a of [...g.spans].reverse())for(const r of [a.inner1,a.inner0]){if(r<aperture){if(r>0)items.push({kind:'circle',x:cx,y:cy,r:r*scale,ink:'outline'});aperture=r;}}

  for(const t of g.threads??[])if(t.z1===g.length)items.push({kind:'circle',x:cx,y:cy,r:threadThinRadius(t,scale)*scale,ink:'thin',arc:true});
  for(const axis of [0,1])line(axis?[[cx,cy-radius*scale-5],[cx,cy+radius*scale+5]]:[[cx-radius*scale-5,cy],[cx+radius*scale+5,cy]],'axis');
  occupied.push({x:cx-radius*scale-5,y:cy-radius*scale-5,w:2*radius*scale+10,h:2*radius*scale+10});
 }
 function dimText(d:DrawingDimension,value:string,x:number,y:number,rotation=0){
  const offset=settings.dimensionOffsets?.[d.id];let xx=x,yy=y;
  if(offset&&Number.isFinite(offset.x)&&Number.isFinite(offset.y)){
   const b=textBox(value,x+offset.x,y+offset.y,3.5,'middle',rotation);
   if(b.x>25&&b.x+b.w<width-7&&b.y>25&&b.y+b.h<height-64&&!occupied.some(p=>intersects(p,b))){xx+=offset.x;yy+=offset.y;}else sheet.warnings.push(`Смещение ${d.id} пересекает изображение или надпись; применено автоматическое положение.`);
  }
  const candidate=textBox(value,xx,yy,3.5,'middle',rotation);
  if(occupied.some(b=>intersects(b,candidate)))sheet.warnings.push(`Недостаточно места для ${d.id}: выберите больший лист или меньший масштаб.`);
  text(value,xx,yy,3.5,'middle',rotation,d);
 }
 const lengths=dims.filter(d=>d.kind==='length').sort((a,b)=>a.z1-b.z1);
 for(let i=0;i<lengths.length;i++){const d=lengths[i],a=mainX,b=mainX+d.z1*scale,y=mainY+radius*scale+10+i*7;
  const left=pt(0,-g.spans[0].outer0),s=g.spans.find(s=>s.z0<d.z1&&s.z1>=d.z1)!,right=pt(d.z1,-radiusAt(s,d.z1));
  line([[a,left[1]+1],[a,y+2]]);line([[b,right[1]+1],[b,y+2]]);line([[a,y],[b,y]]);arrow(a,y,1,0);arrow(b,y,-1,0);
  dimText(d,mm(d.z1),(a+b)/2,y-1.4);
 }
 // Diameter lines outside the outline, vertical with external extensions. Each lane is 10mm apart for legibility.
 for(let i=0;i<diameters.length;i++){const d=diameters[i],s=g.spans.find(s=>s.z0<=d.z0&&s.z1>=d.z1)!,r=d.atZ===undefined?(d.kind==='inner'?s.inner0:s.outer0):radiusAt(s,d.atZ,d.kind==='inner');
  const z=d.atZ??(d.z0+d.z1)/2,x=mainX+g.length*scale+10+i*10,a=mainY-r*scale,b=mainY+r*scale;
  line([[mainX+z*scale,a],[x+2,a]]);line([[mainX+z*scale,b],[x+2,b]]);line([[x,a],[x,b]]);
  if(b-a>=7){arrow(x,a,0,1);arrow(x,b,0,-1);}else{line([[x,a-4],[x,b+4]]);arrow(x,a,0,-1);arrow(x,b,0,1);}
  dimText(d,`Ø${mm(r*2)}`,x-1.4,mainY,-90);
 }
 let leaderY=mainY-radius*scale-15;
 for(const d of dims.filter(d=>d.kind==='thread')){const t=g.threads!.find(t=>t.surface===d.surface&&t.z0===d.z0&&t.z1===d.z1)!;const z=(t.z0+t.z1)/2,s=g.spans.find(s=>s.z0<=z&&s.z1>=z)!,r=d.surface==='inner'?radiusAt(s,z,true):radiusAt(s,z);
  const value=`M${mm(t.diameter)}×${mm(t.pitch)}`,x=mainX+z*scale;
  line([pt(z,r),[x+5,leaderY],[x+5+textWidth(value,3.5)+2,leaderY]]);arrow(...pt(z,r),.7,-.7);dimText(d,value,x+6+textWidth(value,3.5)/2,leaderY-1.4);leaderY-=10;
 }
 for(const s of g.spans)if(Math.abs((s.outer0-s.outer1)-(s.z1-s.z0))<1e-6&&s.outer0>s.outer1){const value=`${mm(s.z1-s.z0)}×45°`,z=(s.z0+s.z1)/2,p=pt(z,radiusAt(s,z)),x=p[0]+8;
  const d:DrawingDimension={id:`chamfer-${s.z0}`,z0:s.z0,z1:s.z1,kind:'outer',surface:'outer'};
  line([p,[x,leaderY],[x+textWidth(value,3.5)+2,leaderY]]);arrow(...p,.7,-.7);dimText(d,value,x+1+textWidth(value,3.5)/2,leaderY-1.4);leaderY-=10;
 }
 if(settings.detail){const d=settings.detail,spans=clippedSpans(g,d.z0,d.z1),y=185,k=d.scale,x=mainX-d.z0*k;
  if(spans.length){const detailRadius=Math.max(...spans.flatMap(s=>[s.outer0,s.outer1]));text(`А (${scaleLabel(k)})`,mainX,y-detailRadius*k-8,5);profile(spans,x,y,k,true,true);const p=pt((d.z0+d.z1)/2,d.surface==='inner'?radiusAt(spans[0],d.z0,true):radiusAt(spans[0],d.z0));items.push({kind:'circle',x:p[0],y:p[1],r:Math.max(4,(d.z1-d.z0)*scale/2+2),ink:'thin'});line([[p[0]+4,p[1]-4],[p[0]+9,p[1]-9],[p[0]+16,p[1]-9]]);text('А',p[0]+12,p[1]-10,3.5);}
 }
 // Frame and form 1 core, appendix B of GOST R 2.104-2023. Unprovided values stay empty.
 rect(20,5,width-25,height-10);
 const tx=width-190,ty=height-60;
 rect(tx,ty,185,55);line([[tx+65,ty],[tx+65,ty+55]],'outline');line([[tx+65,ty+15],[tx+185,ty+15]],'outline');line([[tx+65,ty+40],[tx+135,ty+40]],'outline');line([[tx+135,ty+15],[tx+135,ty+55]],'outline');
 for(const dy of [20,35,40])line([[tx+135,ty+dy],[tx+185,ty+dy]],'outline');
 for(const dx of [150,167])line([[tx+dx,ty+15],[tx+dx,ty+35]],'outline');
 for(const dx of [140,145])line([[tx+dx,ty+20],[tx+dx,ty+35]]);
 line([[tx+155,ty+35],[tx+155,ty+40]]);
 for(const dx of [7,17,40,55])line([[tx+dx,ty],[tx+dx,ty+(dx===7?25:55)]]);
 for(let dy=5;dy<=50;dy+=5)line([[tx,ty+dy],[tx+65,ty+dy]]);
 const tiny=(s:string,x:number,y:number)=>text(s,tx+x,ty+y,2.5);
 tiny('Изм.',.5,24);tiny('Лист',7.5,24);tiny('№ докум.',17.5,24);tiny('Подп.',40.5,24);tiny('Дата',55.5,24);
 for(const [i,s] of ['Разраб.','Пров.','Т. контр.','','Н. контр.','Утв.'].entries())tiny(s,.5,29+i*5);
 // Role labels occupy first17mm; merge their subdivided cells visually by only using labels up to17.
 tiny('Лит.',136,19);tiny('Масса',151,19);tiny('Масштаб',168,19);tiny('Лист',136,39);tiny('Листов',156,39);
 text(scaleLabel(scale),tx+176,ty+29,3.5,'middle');text('1',tx+149,ty+39,2.5);text('1',tx+176,ty+39,2.5);
 const titleLines=wrapText(meta.title,64,5);if(titleLines.length>3)sheet.warnings.push('Название не помещается в основную надпись: сократите его в задании.');titleLines.slice(0,3).forEach((v,i)=>text(v,tx+100,ty+23+i*7,5,'middle'));
 if(meta.designation)text(meta.designation,tx+122,ty+10,5,'middle');
 if(meta.material)text(meta.material,tx+100,ty+50,3.5,'middle');
 if(meta.organization)wrapText(meta.organization,45,3.5).slice(0,2).forEach((v,i)=>text(v,tx+160,ty+47+i*5,3.5,'middle'));
 if(meta.author)text(meta.author,tx+18,ty+29,2.5);
 text(format,width-7,height-1.5,2.5,'end');
 const unfinished=g.threads?.filter(t=>t.depth<threadDepth(t)-1e-6)??[];unfinished.forEach((t,i)=>text(`Незавершённая резьба M${mm(t.diameter)}×${mm(t.pitch)}: ${Math.round(t.depth/threadDepth(t)*100)}%`,30,ty-12-i*6,3.5));
 // Sheet size constraints include dimension lanes, all annotations, and title block.
 for(const p of items)if(p.kind==='text'&&p.dimension&&(p.box.x<25||p.box.x+p.box.w>width-7||p.box.y<25||p.box.y+p.box.h>ty-5))sheet.warnings.push('Изображения и размеры не помещаются: увеличьте формат или уменьшите масштаб.');
 if(mainX+g.length*scale+10+diameters.length*10>width-7||mainY+radius*scale+10+lengths.length*7>ty-5)sheet.warnings.push('Для этого профиля нужен больший формат или меньший масштаб.');
 sheet.warnings=[...new Set(sheet.warnings)];return sheet;
}
export function wrapText(value:string,width:number,height:number):string[]{
 const lines:string[]=[];let row='';for(const word of value.split(/\s+/)){const next=row?`${row} ${word}`:word;if(row&&textWidth(next,height)>width){lines.push(row);row=word;}else row=next;}if(row)lines.push(row);return lines;
}
export function selectionOnSheet(g:TurningGeometry,s:DrawingSelection,sheet:Sheet):Primitive[]{
 const {x,y,scale}=sheet.main;
 return clippedSpans(g,s.z0,s.z1).flatMap(a=>[1,-1].map(sign=>({kind:'path' as const,ink:'outline' as const,points:[[x+a.z0*scale,y-sign*(s.surface==='inner'?a.inner0:a.outer0)*scale],[x+a.z1*scale,y-sign*(s.surface==='inner'?a.inner1:a.outer1)*scale]] as [number,number][]})));
}
