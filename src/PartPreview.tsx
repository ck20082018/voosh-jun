import {lazy,Suspense,useState} from 'react';
const PartInspector=lazy(()=>import('./screens/PartInspector'));
const PartViewer=lazy(()=>import('./screens/PartViewer'));
import type { Dimensions } from './manufacturing';
import {GeometryPreview} from './screens/InteractiveDrawing';
import type {TurningGeometry} from './turningGeometry';
import {geometryOf, dimensionText } from './manufacturing';
import { type ShaftSection } from './presentation/partGeometry';
export function PartPreview({ part, label, interactive=false, display }: {
    interactive?:boolean;
    display?:import('./drawingGeometry').DrawingDisplay;
    part: Readonly<Dimensions> & {
        readonly geometry?: TurningGeometry;
        readonly material?: string;
        readonly sections?: readonly ShaftSection[];
    };
    label: string;
}) {
    const [open,setOpen]=useState(false);
    if(part.shape==='cylinder'){
      const g=geometryOf({...part,sections:part.sections??[]});
      if(!g.ok)return <p role="alert">{g.error.message}</p>;
      return <figure className="part-preview">{interactive&&<button type="button" onClick={()=>setOpen(true)}>Изучить деталь</button>}{open&&<Suspense fallback={<p>Загрузка…</p>}><PartInspector geometry={g.value} metadata={{title:label,material:part.material}} settings={display?.sheet} onClose={()=>setOpen(false)}/></Suspense>}<GeometryPreview geometry={g.value} label={label}/><figcaption>{label}: {part.material} · Ø{Math.max(...g.value.spans.flatMap(s=>[s.outer0,s.outer1]))*2} × {g.value.length} мм{g.value.spans.map((s,i)=><span key={i}><br/>Участок {i+1}: Z{s.z0}–{s.z1}, Ø{s.outer0*2}{s.outer1!==s.outer0?` → ${s.outer1*2}`:''} мм{s.inner0||s.inner1?` · отверстие Ø${s.inner0*2}–${s.inner1*2} мм`:''}</span>)}</figcaption></figure>;
    }
    const block=part.shape==='block'?(()=>{const k=Math.min(180/part.length,60/part.width,70/part.height);const l=part.length*k,w=part.width*k,h=part.height*k;const x=(260-l-w*.5)/2+w*.5,y=110-h;return {x,y,l,w,h};})():null;
    return <figure className="part-preview">{interactive&&<button type="button" onClick={()=>setOpen(v=>!v)}>{open?'Закрыть 3D':'Изучить деталь в 3D'}</button>}{open&&part.shape==='block'&&<Suspense fallback={<p>Загрузка 3D…</p>}><PartViewer block={part} title={label}/></Suspense>}<svg viewBox="0 0 260 145" role="img" aria-label={label}>
 {block&&<g transform={`translate(${block.x},${block.y})`}><polygon points={`0,0 ${block.l},0 ${block.l+block.w*.5},${-block.w*.4} ${block.w*.5},${-block.w*.4}`} fill="#d6e1e2"/><polygon points={`0,0 ${block.l},0 ${block.l},${block.h} 0,${block.h}`} fill="#9db0b9"/><polygon points={`${block.l},0 ${block.l+block.w*.5},${-block.w*.4} ${block.l+block.w*.5},${block.h-block.w*.4} ${block.l},${block.h}`} fill="#6e8794"/></g>}
 </svg><figcaption>{label}: {part.material} · {dimensionText(part)}{part.sections?.map((s, i) => <span key={i}><br />Участок {i + 1}: Ø{s.diameter} × {s.length} мм</span>)}</figcaption></figure>;
}
