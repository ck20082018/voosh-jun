import {createContext,useContext,useState,useCallback,useEffect,useLayoutEffect,useRef,type Dispatch,type SetStateAction} from 'react';
import {ReactFlow,applyNodeChanges,NodeResizer,Panel,Background,Controls,MiniMap,Handle,Position,useNodesState,useEdgesState,useUpdateNodeInternals,useNodesInitialized,useReactFlow,type NodeProps,type Edge,type Connection,type ReactFlowInstance} from '@xyflow/react';
import {NODE_TYPES,registry,nodePorts,portsCompatible,operations,type Level,type NodeKind} from './level';
import {groupNodes} from './groups';
import {ConnectionBuilder} from './ConnectionBuilder';
import {connectionIssue,addLevelConnection,type ConnectionDefinition} from './connections';
import {reconcileEditorNodes,reconcileEdges,updateLevelFromFlow,prepareEditorDeletion,type FlowNode,type FrameNode,type EditorNode} from './editorFlow';

const PortsContext=createContext<{level:Level;pending:{nodeId:string;portId:string}|null;choose:(nodeId:string,portId:string,output:boolean)=>void;begin?:()=>void;end?:()=>void}|null>(null);
function PortRow({nodeId,port,output}:{nodeId:string;port:import('./level').Port;output:boolean}){
 const context=useContext(PortsContext)!;
 const node=context.level.nodes.find(node=>node.id===nodeId);if(!node)return null;
 const pending=context.pending;
 const highlighted=pending&&(output?pending.nodeId===nodeId&&pending.portId===port.id:!connectionIssue(context.level,{source:pending.nodeId,sourceHandle:pending.portId,target:nodeId,targetHandle:port.id}));
 const choose=(event:React.MouseEvent)=>{event.stopPropagation();context.choose(nodeId,port.id,output);};
 return <div className={`port ${port.type} ${output?'output':''} ${highlighted?'port-highlight':''}`}><Handle type={output?'source':'target'} position={output?Position.Right:Position.Left} id={port.id} onClick={choose} className={port.type==='execution'?'exec-handle':'data-handle'}/><button className="port-label nodrag nopan" onClick={choose} aria-label={`${output?'Выход':'Вход'} ${port.label}: ${registry[node.type].title}`}>{port.label}</button></div>;
}
function FactoryNode({id,data,selected,positionAbsoluteX,positionAbsoluteY}:NodeProps<FlowNode>){
  const n=data.definition,d=registry[n.type];const context=useContext(PortsContext)!;
  const updateInternals=useUpdateNodeInternals();
  // Port bounds must be re-read after content/layout changes and at new positions.
  useLayoutEffect(()=>{updateInternals(id);},[id,n.params,n.size,n.type,context.level.productionMode,positionAbsoluteX,positionAbsoluteY,updateInternals]);
  return <div className={`factory-node ${selected?'chosen':''} ${['start','intro','task','wait','check','finish','hint'].includes(n.type)?'scenario-node':''}`}>
    <NodeResizer onResizeStart={()=>context.begin?.()} onResizeEnd={()=>context.end?.()} isVisible={selected} minWidth={220} minHeight={160} maxWidth={900} maxHeight={900}/><div className="node-heading" title="Перетащите за заголовок"><span className="node-dot" />{d.title}<span className="drag-grip">⠿</span></div><p>{d.description}</p>
    <div className="ports"><div>{nodePorts(n,context.level).inputs.map(p=><PortRow key={p.id} nodeId={id} port={p} output={false}/>)}</div><div>{nodePorts(n,context.level).outputs.map(p=><PortRow key={p.id} nodeId={id} port={p} output/>)}</div></div>
    {typeof n.params.name==='string'&&<div className="node-summary">{n.params.name}</div>}
    {n.type==='intro'&&<div className="node-summary">{String(n.params.title)}</div>}
    {n.type==='task'&&<div className="node-summary">{String(n.params.title)}</div>}
    {n.type==='process'&&<div className="node-summary">Операций: {operations(n).length}</div>}
  </div>;
}
function GroupFrame({data,selected}:NodeProps<FrameNode>){const context=useContext(PortsContext)!;return <div className="node-group-frame" style={{borderColor:data.group.color,backgroundColor:data.group.color+'18'}}><NodeResizer onResizeStart={()=>context.begin?.()} onResizeEnd={()=>context.end?.()} isVisible={selected} minWidth={200} minHeight={140} maxWidth={10000} maxHeight={10000}/><div className="group-heading">{data.group.name} ⠿</div></div>;}
const nodeTypes={factory:FactoryNode,frame:GroupFrame};
function FocusAddedNode({id}:{id:string|null}){
  const initialized=useNodesInitialized();const flow=useReactFlow<EditorNode,Edge>();
  useEffect(()=>{
    if(!id||!initialized)return;
    const node=flow.getNode(id);if(!node)return;
    void flow.setCenter(node.position.x+(node.measured?.width??230)/2,node.position.y+(node.measured?.height??160)/2,{zoom:Math.max(.65,flow.getZoom()),duration:180});
  },[id,initialized,flow]);
  return null;
}
interface Props {level:Level;selected:string|null;focusNodeId:string|null;setLevel:Dispatch<SetStateAction<Level>>;setSelected:Dispatch<SetStateAction<string|null>>;onInit:(instance:ReactFlowInstance<EditorNode,Edge>|null)=>void;onAdd:(type:NodeKind,position?:{x:number;y:number})=>void;onNotice:(message:string)=>void;onEditStart?:()=>void;onEditEnd?:()=>void;resetToken?:number}
export function GraphEditor({level,selected,focusNodeId,setLevel,setSelected,onInit,onAdd,onNotice,onEditStart,onEditEnd,resetToken}:Props){
  const [nodes,setNodes,onNodesChange]=useNodesState<EditorNode>(reconcileEditorNodes(level,selected,[]));
  const [edges,setEdges,onEdgesChange]=useEdgesState<Edge>(reconcileEdges(level,[]));
  const [pending,setPending]=useState<{nodeId:string;portId:string}|null>(null);
  const [builder,setBuilder]=useState(false);
  const instance=useRef<ReactFlowInstance<EditorNode,Edge>|null>(null);
  const host=useRef<HTMLDivElement>(null);
  const gesture=useRef<{x:number;y:number;nodeId:string|null;previous:Set<string>;additive:boolean}|null>(null);
  const [selectionBox,setSelectionBox]=useState<{left:number;top:number;width:number;height:number}|null>(null);
  useEffect(()=>{
    function move(event:MouseEvent){
      const start=gesture.current,flow=instance.current,bounds=host.current?.getBoundingClientRect();
      if(!start||!flow||!bounds)return;
      const left=Math.min(start.x,event.clientX),top=Math.min(start.y,event.clientY);
      const width=Math.abs(event.clientX-start.x),height=Math.abs(event.clientY-start.y);
      setSelectionBox({left:left-bounds.left,top:top-bounds.top,width,height});
      const a=flow.screenToFlowPosition({x:left,y:top}),b=flow.screenToFlowPosition({x:left+width,y:top+height});
      const ids=new Set(start.additive?start.previous:[]);
      if(width+height<5&&start.nodeId)ids.add(start.nodeId);
      else for(const node of flow.getIntersectingNodes({x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y},false))if(node.type==='factory')ids.add(node.id);
      setNodes(current=>current.map(node=>({...node,selected:ids.has(node.id)})));
      setSelected(ids.values().next().value??null);
    }
    function end(event:MouseEvent){if(!gesture.current||event.button!==2)return;move(event);gesture.current=null;setSelectionBox(null);}
    function cancel(){gesture.current=null;setSelectionBox(null);}
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',end);window.addEventListener('blur',cancel);
    return()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',end);window.removeEventListener('blur',cancel);};
  },[setNodes,setSelected]);
  useEffect(()=>{setNodes(current=>reconcileEditorNodes(level,selected,current));},[level.nodes,level.groups,selected,setNodes]);
  useEffect(()=>{setEdges(current=>reconcileEdges(level,current));},[level.edges,level.nodes,setEdges]);
  useEffect(()=>()=>onInit(null),[onInit]);
  const lastResetToken=useRef(resetToken);
  useEffect(()=>{
    if(lastResetToken.current===resetToken)return;lastResetToken.current=resetToken;
    setPending(null);gesture.current=null;setSelectionBox(null);
    setNodes(current=>reconcileEditorNodes(level,null,current).map(n=>({...n,selected:false,dragging:false,resizing:false})));
    setEdges(current=>reconcileEdges(level,current).map(e=>({...e,selected:false})));
  },[resetToken]);
  const create=useCallback((edge:ConnectionDefinition):boolean=>{
    onEditEnd?.();
    const error=connectionIssue(level,edge);if(error){onNotice(error);return false;}
    const id=crypto.randomUUID();setLevel(current=>addLevelConnection(current,edge,id));setPending(null);onNotice('Связь добавлена.');return true;
  },[level,setLevel,onNotice,onEditEnd]);
  const connect=useCallback((connection:Connection)=>{
    if(connection.sourceHandle&&connection.targetHandle)create({source:connection.source,target:connection.target,sourceHandle:connection.sourceHandle,targetHandle:connection.targetHandle});
  },[create]);
  function choose(nodeId:string,portId:string,output:boolean){
    if(output){setPending({nodeId,portId});onNotice('Выход выбран. Нажмите подпись нужного входа; совместимые входы подсвечены.');return;}
    if(!pending){onNotice('Сначала нажмите подпись выхода справа у другой ноды.');return;}
    create({source:pending.nodeId,sourceHandle:pending.portId,target:nodeId,targetHandle:portId});
  }
  return <PortsContext.Provider value={{level,pending,choose,begin:onEditStart,end:onEditEnd}}><div className="flow-host" ref={host} onContextMenu={event=>event.preventDefault()} onMouseDownCapture={event=>{
    const target=event.target as Element;
    if(event.button!==2||!target.closest('.react-flow__pane')||target.closest('.react-flow__panel,.react-flow__controls,button,input,select,textarea,.react-flow__handle,.react-flow__resize-control'))return;
    event.preventDefault();event.stopPropagation();
    gesture.current={x:event.clientX,y:event.clientY,nodeId:target.closest('.react-flow__node')?.getAttribute('data-id')??null,previous:new Set(instance.current?.getNodes().filter(n=>n.selected).map(n=>n.id)),additive:event.shiftKey};
    setEdges(current=>current.map(edge=>({...edge,selected:false})));
  }} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';}} onDrop={event=>{
    event.preventDefault();const type=event.dataTransfer.getData('application/x-factory-node');
    if(!NODE_TYPES.includes(type as NodeKind)||!instance.current)return;
    const position=instance.current.screenToFlowPosition({x:event.clientX,y:event.clientY});
    onAdd(type as NodeKind,{x:position.x-115,y:position.y-40});
  }}><ReactFlow<EditorNode,Edge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={value=>{instance.current=value;onInit(value);}} onNodeClick={(_,node)=>setSelected(node.id)} onPaneClick={()=>{setSelected(null);setPending(null);}} onNodesChange={changes=>{
    const removed=new Set(changes.flatMap(change=>change.type==='remove'?[change.id]:[]));
    const protectedMaps=new Set(level.nodes.filter(n=>n.type==='map'&&removed.has(n.id)&&level.placements.some(p=>!removed.has(p.nodeId))).map(n=>n.id));
    if(protectedMaps.size){onNotice('Нельзя удалить карту с размещёнными объектами. Сначала снимите объекты.');changes=changes.filter(change=>change.type!=='remove'||!protectedMaps.has(change.id));}
    if(changes.some(c=>c.type==='remove'&&level.groups.some(g=>g.id===c.id))){const next=updateLevelFromFlow(level,changes);setNodes(current=>reconcileEditorNodes(next,selected,applyNodeChanges(changes,current)));}else onNodesChange(changes);
    setLevel(current=>updateLevelFromFlow(current,changes));
    setSelected(current=>{
      const chosen=changes.find(change=>change.type==='select'&&change.selected);
      if(chosen?.type==='select')return chosen.id;
      if(current&&changes.some(change=>'id' in change&&change.id===current&&(change.type==='remove'||change.type==='select'&&!change.selected)))return null;
      return current;
    });
  }} onEdgesChange={changes=>{
    onEdgesChange(changes);
    const removed=new Set(changes.flatMap(change=>change.type==='remove'?[change.id]:[]));
    if(removed.size)setLevel(current=>({...current,edges:current.edges.filter(edge=>!removed.has(edge.id))}));
  }} onNodeDragStart={()=>onEditStart?.()} onNodeDragStop={()=>onEditEnd?.()} onBeforeDelete={async({nodes,edges})=>{const safe=prepareEditorDeletion(level,nodes,edges);if(safe.nodes.length||safe.edges.length)onEditStart?.();return safe;}} onDelete={()=>onEditEnd?.()} onConnect={connect} connectOnClick={false} connectionRadius={35} isValidConnection={connection=>!!connection.source&&!!connection.target&&!!connection.sourceHandle&&!!connection.targetHandle&&!connectionIssue(level,{source:connection.source,target:connection.target,sourceHandle:connection.sourceHandle,targetHandle:connection.targetHandle})} selectionOnDrag={false} selectionKeyCode={null} panOnDrag={[0,1]} multiSelectionKeyCode="Shift" fitView fitViewOptions={{padding:.15}} minZoom={.25} maxZoom={1.7} deleteKeyCode={['Backspace','Delete']}>
    <Panel position="top-left"><button disabled={nodes.filter(n=>n.type==='factory'&&n.selected&&!n.data.definition.groupId).length<2} onClick={()=>{const ids=nodes.filter(n=>n.type==='factory'&&n.selected&&!n.data.definition.groupId).map(n=>n.id);setLevel(current=>groupNodes(current,ids));}}>Группировать выделенные</button><small>ЛКМ — перемещение поля · ПКМ — рамка · Shift + клик</small><button onClick={()=>setBuilder(value=>!value)}>+ Добавить связь</button>{builder&&<ConnectionBuilder level={level} onCreate={create} onClose={()=>setBuilder(false)}/>}</Panel>
    {pending&&<Panel position="top-right"><button onClick={()=>setPending(null)}>Отменить соединение</button></Panel>}
    <Background gap={22} color="#ccd7cd"/><Controls/><MiniMap nodeColor={node=>['start','intro','task','wait','check','finish','hint'].includes(level.nodes.find(item=>item.id===node.id)?.type??'blank')?'#c9b67f':'#99bfb4'} /><FocusAddedNode id={focusNodeId}/>
  </ReactFlow>{selectionBox&&<div aria-label="Рамка выделения нод" style={{position:'absolute',...selectionBox,border:'1px solid #b99542',background:'#c9b67f33',pointerEvents:'none',zIndex:1001}}/>}{!nodes.length&&<div className="graph-empty"><strong>Создайте свой уровень</strong><p>Добавляйте ноды кнопками слева или перетаскивайте их сюда.<br/>Начните с ноды «Начало уровня», затем соедините шаги.</p><button className="primary" onClick={()=>onAdd('start')}>+ Добавить начало уровня</button></div>}</div></PortsContext.Provider>;
}
