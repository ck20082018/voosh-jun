import {addMap} from './map';
import type {Node,NodeChange,Edge} from '@xyflow/react';
import {MarkerType} from '@xyflow/react';
import {deleteNodes,makeNode,portPair,type Level,type LevelNode,type NodeKind} from './level';
import {ungroup,setGroupMember} from './groups';

export type FlowNode=Node<{definition:LevelNode},'factory'>;
export type FrameNode=Node<{group:Level['groups'][number]},'frame'>;
export type EditorNode=FlowNode|FrameNode;
export function prepareEditorDeletion(level:Level,nodes:EditorNode[],edges:Edge[]){
  const frames=new Set(nodes.filter(n=>n.type==='frame').map(n=>n.id));
  let safe=nodes.filter(n=>n.type==='frame'||!n.data.definition.groupId||!frames.has(n.data.definition.groupId));
  const removed=new Set(safe.map(n=>n.id));
  safe=safe.filter(n=>n.type!=='factory'||n.data.definition.type!=='map'||!level.placements.some(p=>!removed.has(p.nodeId)));
  const ids=new Set(safe.map(n=>n.id));
  return {nodes:safe,edges:edges.filter(e=>e.selected||ids.has(e.source)||ids.has(e.target))};
}
export function reconcileEditorNodes(level:Level,selected:string|null,current:EditorNode[]):EditorNode[]{
  const lookup=new Map(current.map(n=>[n.id,n]));
  const frames:FrameNode[]=level.groups.map(group=>({...lookup.get(group.id),id:group.id,type:'frame',position:{...group.position},data:{group},selected:lookup.get(group.id)?.selected??group.id===selected,width:group.size.width,height:group.size.height,dragHandle:'.group-heading',zIndex:0,style:{width:group.size.width,height:group.size.height}}));
  const children:FlowNode[]=level.nodes.map(definition=>{
    const previous=lookup.get(definition.id);const group=level.groups.find(g=>g.id===definition.groupId);
    return {...previous,id:definition.id,type:'factory',parentId:group?.id,width:definition.size?.width,height:definition.size?.height,position:{x:definition.position.x-(group?.position.x??0),y:definition.position.y-(group?.position.y??0)},data:{definition},selected:previous?.selected??definition.id===selected,dragHandle:'.node-heading',style:{width:definition.size?.width??230,...(definition.size?{height:definition.size.height}:{})}};
  });
  return [...frames,...children];
}

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
export function updateLevelFromFlow(level:Level,changes:NodeChange<EditorNode>[]):Level{
  const removed=changes.flatMap(change=>change.type==='remove'?[change.id]:[]);
  const positions=new Map(changes.flatMap(change=>change.type==='position'&&change.position?[[change.id,change.position] as const]:[]));
  const sizes=new Map(changes.flatMap(change=>change.type==='dimensions'&&change.dimensions&&(change.resizing!==undefined||change.setAttributes)?[[change.id,change.dimensions] as const]:[]));
  if(!removed.length&&!positions.size&&!sizes.size)return level;
  let clean=removed.length?deleteNodes(level,removed):level;
  for(const id of removed)clean=ungroup(clean,id);
  const groups=clean.groups.map(g=>({...g,position:positions.get(g.id)??g.position,size:sizes.get(g.id)??g.size}));
  const nodes=clean.nodes.map(node=>{
    const before=clean.groups.find(g=>g.id===node.groupId),after=groups.find(g=>g.id===node.groupId);
    const relative=positions.get(node.id);
    // A frame drag moves members once. Resizing a frame changes only its bounds.
    const delta=before&&after&&!sizes.has(before.id)?{x:after.position.x-before.position.x,y:after.position.y-before.position.y}:{x:0,y:0};
    const position=relative?{x:relative.x+(after?.position.x??0),y:relative.y+(after?.position.y??0)}:{x:node.position.x+delta.x,y:node.position.y+delta.y};
    return {...node,position,...(sizes.has(node.id)?{size:{...sizes.get(node.id)!}}:{})};
  });
  return {...clean,groups,nodes};
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
export function nodeAdditionIssue(level:Level,type:NodeKind):{message:string;existingId?:string}|null{
  const existing=type==='map'?level.nodes.find(n=>n.type==='map'):undefined;
  if(existing)return {message:'В уровне разрешена только одна нода «Карта».',existingId:existing.id};
  if(level.nodes.length>=100)return {message:'В уровне разрешено не больше 100 нод.'};
  return null;
}
export function addEditorNode(level:Level,type:NodeKind,id:string,desired:{x:number;y:number},groupId?:string):Level{
  if(level.nodes.some(node=>node.id===id)||nodeAdditionIssue(level,type))return level;
  const next=type==='map'?addMap(level,id):{...level,nodes:[...level.nodes,makeNode(type,id,desired)]};
  const placed={...next,nodes:next.nodes.map(n=>n.id===id?{...n,position:findFreeNodePosition(level.nodes,desired)}:n)};
  return groupId?setGroupMember(placed,id,groupId):placed;
}
