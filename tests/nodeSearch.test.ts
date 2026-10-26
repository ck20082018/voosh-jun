import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NODE_TYPES,registry,emptyLevel,makeNode} from '../src/level';
import {normalizeNodeQuery,searchNodeTypes,loadRecentNodeTypes,rememberNodeType,NODE_RECENTS_KEY,groupAtPoint} from '../src/nodeSearch';
import {addEditorNode,nodeAdditionIssue,reconcileEditorNodes} from '../src/editorFlow';
import {createHistory,editHistory,undoHistory,redoHistory} from '../src/editorHistory';
import {serializeLevel,parseLevel} from '../src/storage';

test('search normalizes Russian case, ё and whitespace; title outranks descriptions and aliases',()=>{
  assert.equal(normalizeNodeQuery('  ПОЛУЧЁННАЯ  \n ДЕТАЛЬ '),'полученная деталь');
  assert.equal(searchNodeTypes('  ПОЛУЧЁННАЯ   ДЕТАЛЬ  ')[0].type,'part');
  assert.equal(searchNodeTypes('склад')[0].type,'warehouse');
  assert.equal(searchNodeTypes('  ФРЕЗЕРНЫЙ  ')[0].type,'lathe');
  assert.equal(searchNodeTypes('фреза')[0].type,'tool');
  assert.equal(searchNodeTypes('lathe')[0].type,'lathe');
  assert.equal(searchNodeTypes('разрешённые точки')[0].type,'map');
  assert.equal(searchNodeTypes('НЕСУЩЕСТВУЮЩАЯ НОДА').length,0);
  for(const query of ['резец','фреза','объяснение','сетка','маршрут','хранение'])assert.ok(searchNodeTypes(query).length,query);
  assert.deepEqual(new Set(searchNodeTypes('').map(r=>r.type)),new Set(NODE_TYPES));
  for(const r of searchNodeTypes(''))assert.equal(r.category,registry[r.type].category);
});
test('recents are separate preferences, deduplicated and resilient to denied or corrupt storage',()=>{
  const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,v:string)=>{values.set(key,v);}};
  let recent=rememberNodeType([],'hint',storage);recent=rememberNodeType(recent,'tool',storage);recent=rememberNodeType(recent,'hint',storage);
  assert.deepEqual(loadRecentNodeTypes(storage),['hint','tool']);assert.equal(searchNodeTypes('',recent)[0].type,'hint');
  assert.equal(searchNodeTypes('',recent).filter(r=>r.type==='hint').length,1);
  values.set(NODE_RECENTS_KEY,'["map","unknown","map",null]');assert.deepEqual(loadRecentNodeTypes(storage),['map']);
  values.set(NODE_RECENTS_KEY,'bad');assert.deepEqual(loadRecentNodeTypes(storage),[]);
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  assert.deepEqual(loadRecentNodeTypes(blocked),[]);assert.deepEqual(rememberNodeType([],'map',blocked),['map']);
});
test('one add transaction includes absolute placement and group, undo/redo preserves ID and v4 roundtrip',()=>{
  const original=emptyLevel();original.nodes=[makeNode('start','a',{x:100,y:100}),makeNode('finish','b',{x:100,y:400})];
  original.groups=[{id:'g',name:'Группа',color:'#99bfb4',position:{x:50,y:50},size:{width:1500,height:1000}}];
  const point={x:700,y:500};assert.equal(groupAtPoint(original,point),'g');assert.equal(groupAtPoint(original,{x:55,y:55}),undefined);
  const added=addEditorNode(original,'hint','found',point,'g'),n=added.nodes.at(-1)!;
  assert.deepEqual(n.position,point);assert.equal(n.groupId,'g');
  const flow=reconcileEditorNodes(added,'found',[]).find(n=>n.id==='found')!;assert.deepEqual(flow.position,{x:650,y:450});
  const h=editHistory(createHistory(original),added,null);assert.equal(h.past.length,1);
  assert.deepEqual(undoHistory(h).level,original);assert.deepEqual(redoHistory(undoHistory(h)).level,added);
  assert.deepEqual(parseLevel(serializeLevel(added),{allowIncomplete:true}),added);
  const replaced=editHistory(undoHistory(h),{...original,name:'Другая правка'},null);assert.equal(replaced.future.length,0);
  assert.equal('future' in JSON.parse(serializeLevel(added)),false);
});
test('shared add command prevents singleton/ID/limit duplicates, and finds space near occupied coordinates',()=>{
  const level=addEditorNode(emptyLevel(),'map','map',{x:0,y:0});
  assert.equal(nodeAdditionIssue(level,'map')?.existingId,'map');assert.equal(addEditorNode(level,'map','duplicate',{x:0,y:0}),level);
  assert.equal(addEditorNode(level,'hint','map',{x:0,y:0}),level);
  const withHint=addEditorNode(level,'hint','hint',{x:0,y:0});assert.notDeepEqual(withHint.nodes.at(-1)!.position,{x:0,y:0});
  const full=emptyLevel();full.nodes=Array.from({length:100},(_,i)=>makeNode('hint',String(i)));
  assert.ok(nodeAdditionIssue(full,'hint'));assert.equal(addEditorNode(full,'hint','overflow',{x:0,y:0}),full);
});
