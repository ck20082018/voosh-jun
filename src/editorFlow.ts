import {addMap} from './map';
import type {Node,NodeChange,Edge} from '@xyflow/react';
import {MarkerType} from '@xyflow/react';
import {deleteNodes,makeNode,portPair,type Level,type LevelNode,type NodeKind} from './level';

export type FlowNode=Node<{definition:LevelNode},'factory'>;

// Preserve React Flow's complete runtime node: dimensions, dragging and selection.
// Only definition changes replace the corresponding fields; runtime data is never saved.
export function reconcileNodes(level:Level,selected:string|null,current:FlowNode[]):FlowNode[]{
  const lookup=new Map(current.map(node=>[node.id,node]));
  const next=level.nodes.map(definition=>{
    const existing=lookup.get(definition.id);
    if(existing&&existing.data.definition===definition&&existing.selected===(definition.id===selected))return existing;
    return {...existing,id:definition.id,type:'factory' as const,position:{...definition.position},data:{definition},selected:definition.id===selected,dragHandle:'.node-heading',style:{width:definition.size?.width??230,...(definition.size?{height:definition.size.height}:{})}};
  });
  return next.length===current.length&&next.every((node,i)=>node===current[i])?current:next;
}
export function reconcileEdges(level:Level,current:Edge[]):Edge[]{
  const lookup=new Map(current.map(edge=>[edge.id,edge]));
  const next=level.edges.map(definition=>{
    const execution=portPair(level,definition)?.output.type==='execution';
    const previous=lookup.get(definition.id);
    const color=execution?'#b99542':'#669eaa';
    if(previous&&previous.source===definition.source&&previous.target===definition.target&&previous.sourceHandle===definition.sourceHandle&&previous.targetHandle===definition.targetHandle&&previous.style?.stroke===color)return previous;
    return {...previous,...definition,type:'smoothstep',style:{stroke:color,strokeWidth:execution?3:2,strokeDasharray:execution?'8 5':undefined},markerEnd:{type:MarkerType.ArrowClosed,color},interactionWidth:24};
  });
  return next.length===current.length&&next.every((edge,i)=>edge===current[i])?current:next;
}
export function updateLevelFromFlow(level:Level,changes:NodeChange<FlowNode>[]):Level{
  const removed=changes.flatMap(change=>change.type==='remove'?[change.id]:[]);
  const positions=new Map(changes.flatMap(change=>change.type==='position'&&change.position?[[change.id,change.position] as const]:[]));
  const sizes=new Map(changes.flatMap(change=>change.type==='dimensions'&&change.dimensions&&(change.resizing!==undefined||change.setAttributes)?[[change.id,change.dimensions] as const]:[]));
  if(!removed.length&&!positions.size&&!sizes.size)return level;
  const clean=removed.length?deleteNodes(level,removed):level;
  return {...clean,nodes:clean.nodes.map(node=>positions.has(node.id)||sizes.has(node.id)?{...node,...(positions.has(node.id)?{position:{...positions.get(node.id)!}}:{}),...(sizes.has(node.id)?{size:{...sizes.get(node.id)!}}:{})}:node)};
}
export function findFreeNodePosition(nodes:LevelNode[],desired:{x:number;y:number}):{x:number;y:number}{
  const free=(x:number,y:number)=>!nodes.some(node=>x<node.position.x+(node.size?.width??230)+30&&x+260>node.position.x&&y<node.position.y+(node.size?.height??200)+30&&y+230>node.position.y);
  if(free(desired.x,desired.y))return {...desired};
  for(let ring=1;ring<=nodes.length+1;ring++){
    for(let row=-ring;row<=ring;row++)for(let column=-ring;column<=ring;column++){
      if(Math.abs(row)!==ring&&Math.abs(column)!==ring)continue;
      const x=desired.x+column*280,y=desired.y+row*250;
      if(free(x,y))return {x,y};
    }
  }
  return {x:desired.x+(nodes.length+1)*280,y:desired.y};
}
export function addEditorNode(level:Level,type:NodeKind,id:string,desired:{x:number;y:number}):Level{
  if(level.nodes.some(node=>node.id===id))return level;
  if(type==='map'){const next=addMap(level,id);return {...next,nodes:next.nodes.map(n=>n.id===id?{...n,position:findFreeNodePosition(level.nodes,desired)}:n)};}
  const node=makeNode(type,id,findFreeNodePosition(level.nodes,desired));
  return {...level,nodes:[...level.nodes,node]};
}
