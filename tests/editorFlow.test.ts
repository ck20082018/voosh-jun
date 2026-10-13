import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adoptUserNodes,type NodeLookup,type ParentLookup,type InternalNodeBase,getEdgePosition,ConnectionMode} from '@xyflow/system';
import {applyNodeChanges,type NodeChange,Position} from '@xyflow/react';
import {exampleLevel,emptyLevel,NODE_TYPES,placeObject} from '../src/level';
import {reconcileNodes,reconcileEdges,updateLevelFromFlow,addEditorNode,type FlowNode} from '../src/editorFlow';
import {serializeLevel} from '../src/storage';
import {validateLevel} from '../src/validation';
import {compileLevel} from '../src/compiler';
import {FactoryCore} from '../src/core';
const measuredChanges=(nodes:FlowNode[]):NodeChange<FlowNode>[]=>nodes.map(node=>({type:'dimensions',id:node.id,dimensions:{width:230,height:160}}));
function lookups(){return {nodes:new Map() as NodeLookup<InternalNodeBase<FlowNode>>,parents:new Map() as ParentLookup<InternalNodeBase<FlowNode>>};}

test('React Flow preserves measured dimensions and dragging state on parent reconciliation',()=>{
  const level=exampleLevel();const initial=reconcileNodes(level,null,[]);
  const runtime=applyNodeChanges([...measuredChanges(initial),{type:'position',id:'start',position:{x:40,y:70},dragging:true}],initial);
  const moved=updateLevelFromFlow(level,[{type:'position',id:'start',position:{x:40,y:70}}]);
  const reconciled=reconcileNodes(moved,'start',runtime);
  const lookup=lookups();assert.equal(adoptUserNodes(reconciled,lookup.nodes,lookup.parents).nodesInitialized,true);
  assert.equal(reconciled.find(n=>n.id==='start')!.dragging,true);
  const edited=structuredClone(moved);edited.nodes.find(n=>n.id==='intro')!.params.text='Новый текст';
  const next=reconcileNodes(edited,'start',reconciled);
  assert.equal(adoptUserNodes(next,lookup.nodes,lookup.parents).nodesInitialized,true);
  assert.equal(next.every(n=>n.measured?.width===230),true);
  assert.equal(reconcileNodes(edited,'start',next),next);
});
test('every connected source and target moves its own endpoint, including the start node',()=>{
  const level=exampleLevel();let runtime=applyNodeChanges(measuredChanges(reconcileNodes(level,null,[])),reconcileNodes(level,null,[]));
  const lookup=lookups();adoptUserNodes(runtime,lookup.nodes,lookup.parents);
  for(const node of lookup.nodes.values()){
    node.internals.handleBounds={source:level.edges.filter(e=>e.source===node.id).map(e=>({id:e.sourceHandle,type:'source',nodeId:node.id,position:Position.Right,x:225,y:70,width:9,height:9})),target:level.edges.filter(e=>e.target===node.id).map(e=>({id:e.targetHandle,type:'target',nodeId:node.id,position:Position.Left,x:-4,y:70,width:9,height:9}))};
  }
  for(const edge of level.edges){
    const position=()=>getEdgePosition({id:edge.id,sourceNode:lookup.nodes.get(edge.source)!,targetNode:lookup.nodes.get(edge.target)!,sourceHandle:edge.sourceHandle,targetHandle:edge.targetHandle,connectionMode:ConnectionMode.Strict})!;
    const original=position();
    for(const id of [edge.source,edge.target]){
      const n=runtime.find(n=>n.id===id)!;const change:NodeChange<FlowNode>={type:'position',id,position:{x:n.position.x+41,y:n.position.y+29},dragging:true};
      const changedLevel=updateLevelFromFlow({...level,nodes:runtime.map(n=>({...n.data.definition,position:n.position}))},[change]);
      runtime=reconcileNodes(changedLevel,id,applyNodeChanges([change],runtime));adoptUserNodes(runtime,lookup.nodes,lookup.parents);
      const current=position();
      if(id===edge.source){assert.equal(current.sourceX-original.sourceX,41);assert.equal(current.sourceY-original.sourceY,29);}
      else {assert.equal(current.targetX-original.targetX,41);assert.equal(current.targetY-original.targetY,29);}
    }
  }
});
test('runtime measurements never enter the level; removals clean placements and links',()=>{
  const level=exampleLevel(),json=serializeLevel(level);const initial=reconcileNodes(level,null,[]),changes=measuredChanges(initial);
  assert.equal(updateLevelFromFlow(level,changes),level);assert.equal(serializeLevel(level),json);
  const deleted=updateLevelFromFlow(level,[{type:'remove',id:'blank'}]);
  assert.equal(deleted.nodes.some(n=>n.id==='blank'),false);assert.equal(deleted.edges.some(e=>e.source==='blank'),false);assert.equal(deleted.placements.some(p=>p.nodeId==='blank'),false);
  const runtime=applyNodeChanges(changes,initial);assert.equal(reconcileNodes(deleted,null,runtime).some(n=>n.id==='blank'),false);
});
test('selected edges retain selection when nodes move or parameters change',()=>{
  const level=exampleLevel();const edges=reconcileEdges(level,[]);edges[0]={...edges[0],selected:true};
  const moved=updateLevelFromFlow(level,[{type:'position',id:'start',position:{x:70,y:80}}]);
  assert.equal(reconcileEdges(moved,edges)[0].selected,true);
});
test('a custom level can be created node by node, connected by its own IDs, placed and played',()=>{
  let level=emptyLevel();const original=serializeLevel(level);
  for(const type of exampleLevel().nodes.map(n=>n.type))level=addEditorNode(level,type,`custom-${type}`,{x:0,y:0});
  assert.equal(level.nodes.length,11);assert.equal(new Set(level.nodes.map(n=>`${n.position.x},${n.position.y}`)).size,11);assert.notEqual(serializeLevel(level),original);
  const sample=exampleLevel();level.edges=sample.edges.map(e=>({...e,id:`custom-${e.id}`,source:`custom-${e.source}`,target:`custom-${e.target}`}));
  for(const p of sample.placements)level=placeObject(level,`custom-${p.nodeId}`,p.x,p.y)!;
  assert.deepEqual(validateLevel(level),[]);
  const core=new FactoryCore(compileLevel(level));core.command('start');core.click('custom-blank');core.command('install');core.click('custom-lathe');core.command('process');core.tick(3000);core.click('custom-blank');core.command('store');core.click('custom-warehouse');assert.equal(core.state.completed,true);
  assert.equal(addEditorNode(level,'start','custom-start',{x:0,y:0}),level);
});
