import {useId} from 'react';
import {geometryOf,type Part} from '../manufacturing';
import {turningSurfaceData,type TurningGeometry} from '../turningGeometry';
export function TurningBlueprint({geometry,title,toolZ,toolX,rotating=false,toolDirection='z'}:{geometry:TurningGeometry;title:string;toolZ?:number;toolX?:number;rotating?:boolean;toolDirection?:'z'|'x'}){
 const arrow=useId();
 const data=turningSurfaceData(geometry);if(!data.ok)return <p role="alert">{data.error.message}</p>;
 const scale=7,axis=140,left=35;
 const upper=data.value.outer.map(p=>`${left+p.z*scale},${axis-p.radius*scale}`).join(' ');
 const lower=[...data.value.outer].reverse().map(p=>`${left+p.z*scale},${axis+p.radius*scale}`).join(' ');
 return <figure className="turning-blueprint"><svg viewBox="0 0 520 300" role="img" aria-label={title}>
 <defs><marker id={arrow} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="currentColor"/></marker></defs>
 <rect x={left} y="45" width="70" height="190" fill="#45516a"/><text x="40" y="35">Патрон Z0–10</text>
 <polygon points={`${upper} ${lower}`} fill="#a8c6c3" stroke="#182b40" strokeWidth="2"/>
 {data.value.inner.some(p=>p.radius>0)&&<polygon points={`${data.value.inner.map(p=>`${left+p.z*scale},${axis-p.radius*scale}`).join(' ')} ${[...data.value.inner].reverse().map(p=>`${left+p.z*scale},${axis+p.radius*scale}`).join(' ')}`} fill="#eef2f7" stroke="#182b40"/>}
 <line x1="15" x2="495" y1={axis} y2={axis} stroke="#c55d38" strokeDasharray="7 4"/>
 <text x={left} y="245">Z=0</text><text x={left+geometry.length*scale} y="245" textAnchor="end">Z={geometry.length}</text>
 <path d="M120 260H460 M485 240V75" stroke="#25354c" markerEnd={`url(#${arrow})`}/><text x="360" y="285">Z → вдоль оси</text><text x="480" y="60">X</text>
 {rotating&&<g className="turning-rotation"><path d="M445 105Q480 140 445 175" fill="none" stroke="#a65d27" strokeWidth="3" markerEnd={`url(#${arrow})`}/><text x="370" y="95">Вращение ↻</text></g>}
 {toolZ!==undefined&&toolX!==undefined&&<g><path d={`M${left+toolZ*scale} ${axis-toolX*scale}l10 -18h20v18z`} fill="#e0ad3d" stroke="#25354c"/><path d={toolDirection==='x'?`M${left+toolZ*scale+38} ${axis-toolX*scale-30}v30`:`M${left+toolZ*scale+10} ${axis-toolX*scale-26}h-35`} stroke="#25354c" markerEnd={`url(#${arrow})`}/></g>}
 </svg><figcaption>{title} · размеры в мм. X показан как расстояние от оси (радиус). 1 мм по радиусу = 2 мм по диаметру.</figcaption><table><caption>Профиль по Z — размеры чертежа</caption><thead><tr><th>От Z</th><th>До Z</th><th>Наружный диаметр</th></tr></thead><tbody>{geometry.spans.map((s,i)=><tr key={i}><td>{s.z0}</td><td>{s.z1}</td><td>{s.outer0*2}{s.outer0!==s.outer1?` → ${s.outer1*2}`:''} мм</td></tr>)}</tbody></table></figure>;
}
export function PartWorkview({part,...props}:{part:Part;title:string;toolZ?:number;toolX?:number;rotating?:boolean;toolDirection?:'x'|'z'}){const g=geometryOf(part);return g.ok?<TurningBlueprint geometry={g.value} {...props}/>:<p role="alert">{g.error.message}</p>;}

export function RadiusLesson(){return <figure className="turning-blueprint"><svg viewBox="0 0 500 190" role="img" aria-label="Радиус 10 мм стал 9 мм; диаметр 20 мм стал 18 мм"><circle cx="100" cy="85" r="70" fill="#e7ad93"/><circle cx="100" cy="85" r="63" fill="#a8c6c3" stroke="#203149"/><path d="M100 85H170" stroke="#203149"/><text x="195" y="65">Радиус: 10 − 1 = 9 мм</text><text x="195" y="100">Диаметр: 20 − 2 = 18 мм</text><text x="55" y="178">Розовое кольцо — снятый слой 1 мм по радиусу</text></svg></figure>;}
