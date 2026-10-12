import {createContext,useContext,useState,useCallback,useEffect,useLayoutEffect,useRef,type Dispatch,type SetStateAction} from 'react';
import {ReactFlow,NodeResizer,Panel,Background,Controls,MiniMap,Handle,Position,useNodesState,useEdgesState,useUpdateNodeInternals,useNodesInitialized,useReactFlow,type NodeProps,type Edge,type Connection,type ReactFlowInstance} from '@xyflow/react';
import {NODE_TYPES,registry,type Level,type NodeKind} from './level';
import {ConnectionBuilder} from './ConnectionBuilder';
import {connectionIssue,addLevelConnection,type ConnectionDefinition} from './connections';
import {reconcileNodes,reconcileEdges,updateLevelFromFlow,type FlowNode} from './editorFlow';

const PortsContext=createContext<{level:Level;pending:{nodeId:string;portId:string}|null;choose:(nodeId:string,portId:string,output:boolean)=>void}|null>(null);
function PortRow({nodeId,port,output}:{nodeId:string;port:import('./level').Port;output:boolean}){
 const context=useContext(PortsContext)!;
 const node=context.level.nodes.find(node=>node.id===nodeId);if(!node)return null;
 const pending=context.pending;
 const highlighted=pending&&(output?pending.nodeId===nodeId&&pending.portId===port.id:!connectionIssue(context.level,{source:pending.nodeId,sourceHandle:pending.portId,target:nodeId,targetHandle:port.id}));
 const choose=(event:React.MouseEvent)=>{event.stopPropagation();context.choose(nodeId,port.id,output);};
 return <div className={`port ${port.type} ${output?'output':''} ${highlighted?'port-highlight':''}`}><Handle type={output?'source':'target'} position={output?Position.Right:Position.Left} id={port.id} onClick={choose} className={port.type==='execution'?'exec-handle':'data-handle'}/><button className="port-label nodrag nopan" onClick={choose} aria-label={`${output?'Выход':'Вход'} ${port.label}: ${registry[node.type].title}`}>{port.label}</button></div>;
}
function FactoryNode({id,data,selected,positionAbsoluteX,positionAbsoluteY}:NodeProps<FlowNode>){
  const n=data.definition,d=registry[n.type];
  const updateInternals=useUpdateNodeInternals();
  // Port bounds must be re-read after content/layout changes and at new positions.
  useLayoutEffect(()=>{updateInternals(id);},[id,n.params,n.size,n.type,positionAbsoluteX,positionAbsoluteY,updateInternals]);
  return <div className={`factory-node ${selected?'chosen':''} ${['start','intro','task','wait','finish'].includes(n.type)?'scenario-node':''}`}>
    <NodeResizer isVisible={selected} minWidth={220} minHeight={160} maxWidth={900} maxHeight={900}/><div className="node-heading" title="Перетащите за заголовок"><span className="node-dot" />{d.title}<span className="drag-grip">⠿</span></div><p>{d.description}</p>
    <div className="ports"><div>{d.inputs.map(p=><PortRow key={p.id} nodeId={id} port={p} output={false}/>)}</div><div>{d.outputs.map(p=><PortRow key={p.id} nodeId={id} port={p} output/>)}</div></div>
    {typeof n.params.name==='string'&&<div className="node-summary">{n.params.name}</div>}
    {n.type==='intro'&&<div className="node-summary">{String(n.params.title)}</div>}
    {n.type==='task'&&<div className="node-summary">{String(n.params.title)}</div>}
    {n.type==='turning'&&<div className="node-summary">Ø{n.params.diameter} × {n.params.length} мм · {n.params.seconds} с</div>}
  </div>;
}
const nodeTypes={factory:FactoryNode};
function FocusAddedNode({id}:{id:string|null}){
  const initialized=useNodesInitialized();const flow=useReactFlow<FlowNode,Edge>();
  useEffect(()=>{
    if(!id||!initialized)return;
    const node=flow.getNode(id);if(!node)return;
    void flow.setCenter(node.position.x+(node.measured?.width??230)/2,node.position.y+(node.measured?.height??160)/2,{zoom:Math.max(.65,flow.getZoom()),duration:180});
  },[id,initialized,flow]);
  return null;
}
interface Props {level:Level;selected:string|null;focusNodeId:string|null;setLevel:Dispatch<SetStateAction<Level>>;setSelected:Dispatch<SetStateAction<string|null>>;onInit:(instance:ReactFlowInstance<FlowNode,Edge>|null)=>void;onAdd:(type:NodeKind,position?:{x:number;y:number})=>void;onNotice:(message:string)=>void}
export function GraphEditor({level,selected,focusNodeId,setLevel,setSelected,onInit,onAdd,onNotice}:Props){
  const [nodes,setNodes,onNodesChange]=useNodesState<FlowNode>(reconcileNodes(level,selected,[]));
  const [edges,setEdges,onEdgesChange]=useEdgesState<Edge>(reconcileEdges(level,[]));
  const [pending,setPending]=useState<{nodeId:string;portId:string}|null>(null);
  const [builder,setBuilder]=useState(false);
  const instance=useRef<ReactFlowInstance<FlowNode,Edge>|null>(null);
  useEffect(()=>{setNodes(current=>reconcileNodes(level,selected,current));},[level.nodes,selected,setNodes]);
  useEffect(()=>{setEdges(current=>reconcileEdges(level,current));},[level.edges,level.nodes,setEdges]);
  useEffect(()=>()=>onInit(null),[onInit]);
  const create=useCallback((edge:ConnectionDefinition):boolean=>{
    const error=connectionIssue(level,edge);if(error){onNotice(error);return false;}
    const id=crypto.randomUUID();setLevel(current=>addLevelConnection(current,edge,id));setPending(null);onNotice('Связь добавлена.');return true;
  },[level,setLevel,onNotice]);
  const connect=useCallback((connection:Connection)=>{
    if(connection.sourceHandle&&connection.targetHandle)create({source:connection.source,target:connection.target,sourceHandle:connection.sourceHandle,targetHandle:connection.targetHandle});
  },[create]);
  function choose(nodeId:string,portId:string,output:boolean){
    if(output){setPending({nodeId,portId});onNotice('Выход выбран. Нажмите подпись нужного входа; совместимые входы подсвечены.');return;}
    if(!pending){onNotice('Сначала нажмите подпись выхода справа у другой ноды.');return;}
    create({source:pending.nodeId,sourceHandle:pending.portId,target:nodeId,targetHandle:portId});
  }
  return <PortsContext.Provider value={{level,pending,choose}}><div className="flow-host" onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';}} onDrop={event=>{
    event.preventDefault();const type=event.dataTransfer.getData('application/x-factory-node');
    if(!NODE_TYPES.includes(type as NodeKind)||!instance.current)return;
    const position=instance.current.screenToFlowPosition({x:event.clientX,y:event.clientY});
    onAdd(type as NodeKind,{x:position.x-115,y:position.y-40});
  }}><ReactFlow<FlowNode,Edge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={value=>{instance.current=value;onInit(value);}} onNodeClick={(_,node)=>setSelected(node.id)} onPaneClick={()=>{setSelected(null);setPending(null);}} onNodesChange={changes=>{
    onNodesChange(changes);
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
  }} onConnect={connect} connectOnClick={false} connectionRadius={35} isValidConnection={connection=>!!connection.source&&!!connection.target&&!!connection.sourceHandle&&!!connection.targetHandle&&!connectionIssue(level,{source:connection.source,target:connection.target,sourceHandle:connection.sourceHandle,targetHandle:connection.targetHandle})} fitView fitViewOptions={{padding:.15}} minZoom={.25} maxZoom={1.7} deleteKeyCode={['Backspace','Delete']}>
    <Panel position="top-left"><button onClick={()=>setBuilder(value=>!value)}>+ Добавить связь</button>{builder&&<ConnectionBuilder level={level} onCreate={create} onClose={()=>setBuilder(false)}/>}</Panel>
    {pending&&<Panel position="top-right"><button onClick={()=>setPending(null)}>Отменить соединение</button></Panel>}
    <Background gap={22} color="#ccd7cd"/><Controls/><MiniMap nodeColor={node=>['start','intro','task','wait','finish'].includes(level.nodes.find(item=>item.id===node.id)?.type??'blank')?'#c9b67f':'#99bfb4'} /><FocusAddedNode id={focusNodeId}/>
  </ReactFlow>{!nodes.length&&<div className="graph-empty"><strong>Создайте свой уровень</strong><p>Добавляйте ноды кнопками слева или перетаскивайте их сюда.<br/>Начните с ноды «Начало уровня», затем соедините шаги.</p><button className="primary" onClick={()=>onAdd('start')}>+ Добавить начало уровня</button></div>}</div></PortsContext.Provider>;
}
