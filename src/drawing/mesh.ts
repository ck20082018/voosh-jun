import {clippedSpans,type DrawingSelection} from '../drawingGeometry';
import {normalizeGeometry,validateGeometry,type TurningGeometry} from '../turningGeometry';
export interface SurfaceMesh {surface:'outer'|'inner'|'end'|'cut';z0:number;z1:number;selected:boolean;positions:number[];normals:number[];indices:number[]}
type V=[number,number,number];
/** World X = model Z. World Y/Z = radial plane. Units remain mm, origin centered for orbit. */
export function latheMeshes(geometry:TurningGeometry,cutaway=false,selection:DrawingSelection|null=null,segments=192):SurfaceMesh[]{
 const valid=validateGeometry(geometry);if(!valid.ok)throw Error(valid.error.message);
 if(!Number.isInteger(segments)||segments<16||segments>1024)throw Error('Детализация окружности: 16–1024.');
 const g=normalizeGeometry(geometry),count=cutaway?Math.ceil(segments/2):segments,angle=cutaway?Math.PI:2*Math.PI,meshes:SurfaceMesh[]=[];
 const spans=selection?[...clippedSpans(g,0,selection.z0),...clippedSpans(g,selection.z0,selection.z1),...clippedSpans(g,selection.z1,g.length)]:g.spans;
 const make=(surface:SurfaceMesh['surface'],z0:number,z1:number)=>{const selected=!!selection&&Math.min(z1,selection.z1)>=Math.max(z0,selection.z0)&&((z0===z1&&z0>=selection.z0&&z0<=selection.z1)||(z1>selection.z0&&z0<selection.z1))&&(selection.surface==='length'||selection.surface===surface||surface==='cut');const m:SurfaceMesh={surface,z0,z1,selected,positions:[],normals:[],indices:[]};meshes.push(m);return m;};
 const vertex=(m:SurfaceMesh,z:number,r:number,a:number,n:V)=>{m.positions.push(z-g.length/2,r*Math.cos(a),r*Math.sin(a));m.normals.push(...n);};
 const tri=(m:SurfaceMesh,a:number,b:number,c:number)=>{const p=m.positions,n=m.normals,ax=p[b*3]-p[a*3],ay=p[b*3+1]-p[a*3+1],az=p[b*3+2]-p[a*3+2],bx=p[c*3]-p[a*3],by=p[c*3+1]-p[a*3+1],bz=p[c*3+2]-p[a*3+2];const dot=(ay*bz-az*by)*n[a*3]+(az*bx-ax*bz)*n[a*3+1]+(ax*by-ay*bx)*n[a*3+2];if(Math.abs(dot)<1e-10)return;m.indices.push(...dot>=0?[a,b,c]:[a,c,b]);};
 for(const s of spans){
  if(s.inner0===s.outer0&&s.inner1===s.outer1)continue;
  for(const inner of [false,true]){const r0=inner?s.inner0:s.outer0,r1=inner?s.inner1:s.outer1;if(r0===0&&r1===0)continue;
   const m=make(inner?'inner':'outer',s.z0,s.z1),slope=(r1-r0)/(s.z1-s.z0),sign=inner?-1:1,norm=Math.sqrt(1+slope*slope);
   for(let j=0;j<=count;j++){const a=(cutaway?Math.PI:0)+j/count*angle,n:V=[-slope/norm*sign,Math.cos(a)/norm*sign,Math.sin(a)/norm*sign];vertex(m,s.z0,r0,a,n);vertex(m,s.z1,r1,a,n);if(j){const i=2*j;tri(m,i-2,i-1,i);tri(m,i,i-1,i+1);}}
  }
  if(cutaway)for(const a of [0,Math.PI]){const m=make('cut',s.z0,s.z1),n:V=[0,0,1];for(const [z,r] of [[s.z0,s.outer0],[s.z1,s.outer1],[s.z1,s.inner1],[s.z0,s.inner0]])vertex(m,z,r,a,n);tri(m,0,1,2);tri(m,0,2,3);}
 }
 // At every axial boundary emit material XOR, not two coincident annuli. Blind-hole bottoms included.
 for(let i=0;i<=spans.length;i++){
  const l=spans[i-1],r=spans[i],z=r?.z0??l.z1,cuts=[...new Set([0,l?.inner1??0,l?.outer1??0,r?.inner0??0,r?.outer0??0])].sort((a,b)=>a-b);
  for(let j=1;j<cuts.length;j++){const lo=cuts[j-1],hi=cuts[j],mid=(lo+hi)/2,hasL=!!l&&mid>=l.inner1&&mid<=l.outer1,hasR=!!r&&mid>=r.inner0&&mid<=r.outer0;if(hasL===hasR)continue;
   const m=make('end',z,z),n:V=[hasL?1:-1,0,0];
   for(let v=0;v<=count;v++){const a=(cutaway?Math.PI:0)+v/count*angle;vertex(m,z,lo,a,n);vertex(m,z,hi,a,n);if(v){const q=v*2;tri(m,q-2,q-1,q);tri(m,q,q-1,q+1);}}
  }
 }
 return meshes.filter(m=>m.indices.length>0);
}
