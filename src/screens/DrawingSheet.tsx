import { applyOperation, dimensions } from '../manufacturing';
import type { Blank } from '../manufacturing';
import type { OperationSpec } from '../level';
import {geometryOf,type Part,type Requirements} from '../manufacturing';
import {InteractiveDrawing} from './InteractiveDrawing';
import type {DrawingDisplay,DrawingSelection} from '../drawingGeometry';

interface DrawingProps {
  title: string;
  blank: Blank;
  ops: OperationSpec[];
  /** Если задано, поверх чертежа показывается фактическое состояние детали и припуск, который ещё нужно снять. */
  actual?: { doneOps: number; progress: number };
  className?: string;
  requirements?:Requirements;
  result?:Part|null;
  display?:DrawingDisplay;
  selection?:DrawingSelection|null;
  onSelect?:(s:DrawingSelection|null)=>void;
}

export function DrawingSheet(props: DrawingProps) {
  if(props.blank.shape==='cylinder'){
    const raw:Part={...props.blank,blankId:props.blank.id,sections:[],operationIds:[]};
    let expected:Part|Requirements=props.requirements??raw;
    if(!props.requirements)for(const op of props.ops)expected=applyOperation(props.blank,expected as Part,op);
    const required=geometryOf(expected);if(!required.ok)return <p role="alert">{required.error.message}</p>;
    let current=props.result??undefined;
    if(!current&&props.actual){current=raw;for(const op of props.ops.slice(0,props.actual.doneOps))current=applyOperation(props.blank,current,op);}
    const actual=current?geometryOf(current):undefined;
    if(actual&&!actual.ok)return <p role="alert">{actual.error.message}</p>;
    return <div className={props.className}><InteractiveDrawing material={props.blank.material} title={props.title} geometry={required.value} result={actual?.ok?actual.value:undefined} display={props.display} selection={props.selection} onSelect={props.onSelect}/></div>;
  }
  let part = {...dimensions(props.blank),material:props.blank.material,sections:[],operationIds:[],blankId:props.blank.id} as import('../manufacturing').Part;
  if(props.requirements)part={...props.requirements,blankId:props.blank.id,operationIds:[]};
  else for (const op of props.ops) part = applyOperation(props.blank,part,op);
  if(props.blank.shape!=='block'||part.shape!=='block')return null;
  let current={...dimensions(props.blank),material:props.blank.material,sections:[],operationIds:[],blankId:props.blank.id} as import('../manufacturing').Part;
  for(const op of props.ops.slice(0,props.actual?.doneOps??props.ops.length))current=applyOperation(props.blank,current,op);
  if(props.result)current=props.result;
  const height=current.shape==='block'?current.height:props.blank.height;
  const k=220/Math.max(part.length,props.blank.height*2),x=42,bottom=174;
  return <figure className={`dwg ${props.className??''}`}>
    <svg className="dwg__svg" viewBox="0 0 340 220" role="img" aria-label={`Чертёж бруска: ${part.length} × ${part.width} × ${part.height} мм; сейчас высота ${height} мм`}>
      {props.actual&&<rect x={x} y={bottom-height*k} width={part.length*k} height={height*k} className="dwg__actual"/>}
      {props.actual&&height>part.height&&<rect x={x} y={bottom-height*k} width={part.length*k} height={(height-part.height)*k} fill="none" stroke="#c2542f" strokeDasharray="3 3"/>}
      <rect x={x} y={bottom-part.height*k} width={part.length*k} height={part.height*k} className="dwg__outline" fill="none"/>
      <g className="dwg__dim"><line x1={x} x2={x+part.length*k} y1="195" y2="195"/><text x={x+part.length*k/2} y="211" textAnchor="middle">{part.length} мм</text><text x="290" y={bottom-part.height*k/2} textAnchor="middle">{part.height} мм</text><text x="170" y="24" textAnchor="middle">Ширина {part.width} мм</text></g>
    </svg>
    <figcaption><dl className="dwg__block"><div><dt>Деталь</dt><dd>{props.title}</dd></div><div><dt>Материал</dt><dd>{props.blank.material}</dd></div><div><dt>Результат</dt><dd>{part.length} × {part.width} × {part.height} мм</dd></div></dl>{props.actual&&<p className="dwg__legend">Высота сейчас: {height} мм · по чертежу: {part.height} мм</p>}</figcaption>
  </figure>;
}
