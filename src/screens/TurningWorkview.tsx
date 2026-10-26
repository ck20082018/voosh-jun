import {useState} from 'react';
import {geometryOf,type Part} from '../manufacturing';
import type {TurningGeometry} from '../turningGeometry';
import type {DrawingDisplay,DrawingSelection} from '../drawingGeometry';
import {InteractiveDrawing} from './InteractiveDrawing';
interface BlueprintProps {geometry:TurningGeometry;title:string;result?:TurningGeometry;display?:DrawingDisplay;selection?:DrawingSelection|null;onSelect?:(s:DrawingSelection|null)=>void;toolZ?:number;toolX?:number;toolKind?:'drill'|'bore';rotating?:boolean;toolDirection?:'z'|'x'}
export function TurningBlueprint({toolZ,toolX,toolKind,rotating=false,toolDirection='z',...props}:BlueprintProps){
 return <InteractiveDrawing {...props} tool={toolZ!==undefined&&toolX!==undefined?{z:toolZ,radius:toolX,direction:toolDirection,rotating,kind:toolKind}:undefined}/>;
}
export function PartWorkview({part,requirements,...props}:Omit<BlueprintProps,'geometry'|'result'> & {part:Part;requirements?:TurningGeometry}){
 const g=geometryOf(part);return g.ok?<TurningBlueprint {...props} geometry={requirements??g.value} result={requirements?g.value:undefined}/>:<p role="alert">{g.error.message}</p>;
}

export function RadiusLesson(){const [cut,setCut]=useState(0);return <figure className="turning-blueprint"><svg viewBox="0 0 500 190" role="img" aria-label="Радиус 10 мм стал 9 мм; диаметр 20 мм стал 18 мм"><circle cx="100" cy="85" r="70" fill="#e7ad93"/><circle key={cut} cx="100" cy="85" r={cut?63:70} fill="#a8c6c3" stroke="#203149">{cut>0&&<animate attributeName="r" from="70" to="63" dur="1s" fill="freeze"/>}</circle><path d="M100 85H170" stroke="#203149"/><text x="195" y="65">Радиус: 10 − 1 = 9 мм</text><text x="195" y="100">Диаметр: 20 − 2 = 18 мм</text><text x="55" y="178">Розовое кольцо — снятый слой 1 мм по радиусу</text></svg><button type="button" onClick={()=>setCut(n=>n+1)}>Показать снятие 1 мм по радиусу</button><figcaption>Снят слой 1 мм вокруг оси: наружный диаметр уменьшился на 2 мм. Это объяснение, не операция над деталью.</figcaption></figure>;}
