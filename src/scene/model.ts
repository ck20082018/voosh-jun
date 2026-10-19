import {locatedPlacements, type Level} from '../level';
import {dimensions, type Part} from '../manufacturing';
import type {CoreState} from '../core';
import {PART_LEN, PART_R, AXIS_Z, MILL_TABLE_Z, millTableOffset, type Segment} from './objects';

/** One pose for rendering and hit testing; blocks rest on a fixed support plane. */
export function itemPose(kind:string,machineKind:unknown,part:Part,progress?:number){
  const unit=PART_LEN/part.length;
  const halfWidth=part.shape==='block'?part.width*unit/2:PART_R;
  const halfHeight=part.shape==='block'?part.height*unit/2:PART_R;
  const support=kind==='lathe'?(machineKind==='mill'?MILL_TABLE_Z:AXIS_Z-halfHeight):kind==='warehouse'?.57:.52;
  return {x:-PART_LEN/2+(kind==='lathe'&&machineKind==='mill'?millTableOffset(progress):0),y:0,z:support+halfHeight,halfWidth,halfHeight};
}

/** Physical item ownership is independent of selection and scenario progress. */
export function itemHost(level:Level, state:Readonly<CoreState>) {
  const location=state.location;
  if (!location) return null;
  if (location.kind !== 'table') return location.id;
  return locatedPlacements(level).find(p=>p.nodeId===location.id)?.nodeId
    ?? level.nodes.find(n=>n.type==='table')?.id ?? null;
}
export function actualSegments(part:Part,blankDiameter?:number):Segment[] {
  if(part.shape!=='cylinder')return [];
  const unit=PART_LEN/part.length;
  const diameter=blankDiameter??part.diameter;
  const shoulder=Math.max(0,part.length-part.sections.reduce((sum,s)=>sum+s.length,0));
  let x=0;
  return [...(shoulder?[{length:shoulder,diameter}]:[]),...part.sections].map(section=>{
    const x0=x;x+=section.length*unit;
    return {x0,x1:x,r:PART_R*section.diameter/diameter,machined:part.operationIds.length>0};
  });
}
export function rawPart(level:Level,nodeId?:string):Part|null {
  const n=level.nodes.find(n=>nodeId?n.id===nodeId:n.type==='blank');
  if(!n||n.type!=='blank')return null;
  return {...dimensions(n.params),material:String(n.params.material),blankId:n.id,sections:[],operationIds:[]};
}
