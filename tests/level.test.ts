import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exampleLevel,operations,compatible,deleteNodes,placeObject} from '../src/level';
import {validateLevel} from '../src/validation';
import {compileLevel} from '../src/compiler';
import {FactoryCore,suitable} from '../src/core';
import {parseLevel,serializeLevel,saveLevel,loadLevel,STORAGE_KEY} from '../src/storage';
function engine(){return new FactoryCore(compileLevel(exampleLevel()));}
function manufacture(core:FactoryCore){
  assert.equal(core.click('blank'),true);assert.equal(core.command('install'),true);
  assert.equal(core.click('lathe'),true);assert.equal(core.command('process'),true);
  core.tick(core.currentOperation.seconds*1000);
  assert.equal(core.click('blank'),true);assert.equal(core.command('store'),true);assert.equal(core.click('warehouse'),true);
}
test('fully connected and placed example validates and compiles',()=>{
  assert.deepEqual(validateLevel(exampleLevel()),[]);
  const compiled=compileLevel(exampleLevel());if(compiled.mode!=='production')throw new Error('Expected production');
  assert.equal(compiled.operations[0].seconds,3);assert.equal((compiled.blank.shape==='cylinder'?compiled.blank.diameter:0),20);assert.equal(compiled.waits.wait.requirements.sections[0].diameter,12);
  assert.deepEqual(compiled.scenario.map(n=>n.type),['start','intro','task','wait','finish']);
});
test('complete cycle explicitly starts and completes nodes, and finishes once',()=>{
  const core=engine();assert.equal(core.state.activeNodeId,'intro');assert.equal(core.state.playing,false);
  assert.equal(core.command('start'),true);assert.equal(core.state.activeNodeId,'wait');assert.equal(core.subscriptionCount,1);
  manufacture(core);assert.equal(core.state.stage,'stored');assert.equal(core.state.count,1);assert.equal(core.state.completed,true);
  assert.equal(core.state.activeNodeId,'finish');assert.equal(core.subscriptionCount,0);
  const before=core.state;
  for(let i=0;i<10;i++){core.click('warehouse');core.click('blank');core.command('process');core.command('store');core.tick(9999);}
  assert.deepEqual(core.state,before);assert.equal(core.log.filter(e=>e.type==='level-completed').length,1);
  assert.equal(core.log.filter(e=>e.type==='node-started').length,5);
  assert.equal(core.log.filter(e=>e.type==='node-completed').length,5);
});
test('direct forbidden commands, invalid targets and duplicate processing do nothing',()=>{
  const core=engine();assert.equal(core.command('process'),false);assert.equal(core.click('blank'),false);
  core.command('start');core.click('blank');assert.equal(core.command('store'),false);assert.equal(core.click('warehouse'),true);assert.equal(core.state.stage,'table');
  core.click('blank');core.command('install');const targetState=core.state;
  assert.equal(core.click('warehouse'),false);assert.equal(core.click('unknown'),false);assert.deepEqual(core.state,targetState);
  assert.equal(core.command('cancel'),true);assert.equal(core.state.target,null);
  core.command('install');core.click('lathe');core.command('process');core.tick(1000);
  const processing=core.state;
  for(let i=0;i<10;i++){assert.equal(core.command('process'),false);assert.equal(core.command('store'),false);assert.equal(core.command('install'),false);assert.equal(core.click('warehouse'),false);assert.equal(core.click('blank'),false);}
  assert.deepEqual(core.state,processing);
  core.tick(1999);assert.equal(core.state.stage,'processing');core.tick(1);assert.equal(core.state.stage,'finished');
  assert.equal(core.command('process'),false);assert.equal(core.command('store'),false);
  core.click('blank');core.command('store');core.click('warehouse');assert.equal(core.state.count,1);
  assert.equal(core.log.filter(e=>e.type==='processing-started').length,1);
});
test('completion requires expected dimensions and expected warehouse',()=>{
  const level=compileLevel(exampleLevel());if(level.mode!=='production')throw new Error('Expected production');level.waits.wait.requirements.sections[0].diameter=11;
  const core=new FactoryCore(level);core.command('start');manufacture(core);
  assert.equal(core.state.count,1);assert.equal(core.state.completed,false);assert.equal(core.state.activeNodeId,'wait');
  assert.equal(suitable(core.state.part,core.resources.waits.wait.requirements,'other','warehouse'),false);
  assert.equal(suitable(null,core.resources.waits.wait.requirements,'warehouse','warehouse'),false);core.dispose();
});
test('wait checks already stored state when activated, not only future events',()=>{
  const core=engine();core.subscribe(event=>{if(event.type==='node-completed'&&event.nodeId==='task')manufacture(core);});
  core.command('start');assert.equal(core.state.completed,true);assert.equal(core.state.count,1);
});
test('reset during processing cancels old work and cleans subscriptions',()=>{
  const core=engine();core.command('start');core.click('blank');core.command('install');core.click('lathe');core.command('process');core.tick(1200);
  let oldEvents=0;core.subscribe(()=>oldEvents++);core.reset();const afterReset=oldEvents;core.tick(10000);
  assert.equal(core.state.stage,'table');assert.equal(core.state.intro,true);assert.equal(core.state.count,0);assert.equal(core.subscriptionCount,0);assert.equal(oldEvents,afterReset);
  core.command('start');manufacture(core);assert.equal(core.state.completed,true);assert.equal(oldEvents,afterReset);
});
test('leaving test disposes timers and subscriptions and cannot affect next run',()=>{
  const previous=engine();previous.command('start');previous.click('blank');previous.command('install');previous.click('lathe');previous.command('process');previous.dispose();previous.tick(10000);
  assert.equal(previous.subscriptionCount,0);assert.equal(previous.state.disposed,true);assert.equal(previous.command('start'),false);assert.notEqual(previous.state.stage,'finished');
  const next=engine();assert.equal(next.state.stage,'table');assert.equal(next.state.elapsed,0);
});
test('node parameters control intro, duration, output and success without source changes',()=>{
  const level=exampleLevel();level.nodes.find(n=>n.type==='intro')!.params.text='Изменённое вступление';
  Object.assign(operations(level.nodes.find(n=>n.type==='process')!)[0],{diameter:8,length:45,seconds:1.25});
  level.nodes.find(n=>n.type==='part')!.params.sections=[{diameter:8,length:45}];
  level.nodes.find(n=>n.type==='finish')!.params.text='Новый итог';const json=serializeLevel(level);
  const compiled=compileLevel(level);if(compiled.mode!=='production')throw new Error('Expected production');const core=new FactoryCore(compiled);
  assert.equal(core.level.scenario.find(n=>n.type==='intro')!.params.text,'Изменённое вступление');
  core.command('start');core.click('blank');core.command('install');core.click('lathe');core.command('process');core.tick(1249);assert.equal(core.state.stage,'processing');core.tick(1);
  assert.equal(core.state.part?.sections[0].diameter,8);assert.equal(core.state.part?.sections[0].length,45);
  core.click('blank');core.command('store');core.click('warehouse');assert.equal(core.state.success,'Новый итог');assert.equal(serializeLevel(level),json);
  compiled.operations[0].seconds=99;assert.equal(core.currentOperation.seconds,1.25);
});
test('validation rejects incompatible links, missing references and cycles',()=>{
  const level=exampleLevel();
  assert.equal(compatible(level,{source:'tool',sourceHandle:'tool',target:'lathe',targetHandle:'blank'}),false);
  level.edges.find(e=>e.target==='lathe'&&e.targetHandle==='blank')!.source='tool';level.edges.find(e=>e.target==='lathe'&&e.targetHandle==='blank')!.sourceHandle='tool';
  assert.ok(validateLevel(level).some(e=>e.message.includes('Несовместимые')));
  level.edges[0].source='missing';assert.ok(validateLevel(level).some(e=>e.message.includes('отсутствующую')));
  const cyclic=exampleLevel();cyclic.edges.push({id:'cycle',source:'wait',sourceHandle:'out',target:'intro',targetHandle:'in'});
  assert.ok(validateLevel(cyclic).some(e=>e.message.includes('Циклы')));
  assert.throws(()=>compileLevel(cyclic));
});
test('validation rejects missing required ports, invalid sizes and unsupported scenario order',()=>{
  const level=exampleLevel();level.edges=level.edges.filter(e=>e.targetHandle!=='tool');
  assert.ok(validateLevel(level).some(e=>e.message.includes('Не подключён вход')));
  const process=level.nodes.find(n=>n.type==='process')!;const op=operations(process)[0];Object.assign(op,{diameter:25,length:80,seconds:-1});
  assert.ok(validateLevel(level).some(e=>e.nodeId==='lathe'&&e.message.includes('меньше')));
  assert.ok(validateLevel(level).some(e=>e.message.includes('Суммарная')));assert.ok(validateLevel(level).some(e=>e.message.includes('положительное')));
  const wrong=exampleLevel();wrong.edges.find(e=>e.source==='start')!.target='wait';assert.ok(validateLevel(wrong).some(e=>e.message.includes('Ожидание')));
});
test('placement prevents overlap/out-of-bounds and object removal cleans edges and map',()=>{
  const level=exampleLevel();assert.equal(placeObject(level,'blank',2,2),null);assert.equal(placeObject(level,'blank',-1,0),null);assert.equal(placeObject(level,'blank',5,0),null);
  assert.equal(placeObject(level,'intro',1,1),null);assert.equal(placeObject(level,'blank',1.5,0),null);
  const moved=placeObject(level,'blank',1,0)!;assert.equal(moved.placements.filter(p=>p.nodeId==='blank').length,1);assert.deepEqual(moved.nodes.find(n=>n.id==='blank')!.position,level.nodes.find(n=>n.id==='blank')!.position);
  const cleaned=deleteNodes(moved,['blank']);assert.ok(!cleaned.placements.some(p=>p.nodeId==='blank'));assert.ok(!cleaned.edges.some(e=>e.source==='blank'||e.target==='blank'));
  assert.ok(validateLevel(cleaned).some(e=>e.message.includes('Не подключён вход')));
  const overlap=exampleLevel();overlap.placements[0].pointId=overlap.placements[1].pointId;assert.ok(validateLevel(overlap).some(e=>e.message.includes('другой объект')));
});
test('JSON/local storage round trip restores graph, ports and placements without runtime',()=>{
  const level=exampleLevel();const data=new Map<string,string>();const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  assert.equal(loadLevel(storage),null);saveLevel(storage,level);assert.deepEqual(loadLevel(storage),level);assert.deepEqual(parseLevel(serializeLevel(level)),level);
  const withState={...level,runtime:{count:50}};assert.ok(!('runtime' in parseLevel(JSON.stringify(withState))));
  const previous=data.get(STORAGE_KEY);const invalid=exampleLevel();invalid.nodes=[];assert.throws(()=>saveLevel(storage,invalid));assert.equal(data.get(STORAGE_KEY),previous);
});
test('import rejects malformed data, unsupported version, unknown node types and broken references',()=>{
  for(const raw of ['{','null','{}',JSON.stringify({...exampleLevel(),version:99}),JSON.stringify({...exampleLevel(),grid:{width:999,height:5}})])assert.throws(()=>parseLevel(raw));
  const unknown=JSON.parse(serializeLevel(exampleLevel()));unknown.nodes[0].type='script';assert.throws(()=>parseLevel(JSON.stringify(unknown)));
  const missing=exampleLevel();missing.edges[0].target='absent';assert.throws(()=>parseLevel(serializeLevel(missing)));
});

test('custom sequential graphs allow optional or additional introductions',()=>{
  const level=exampleLevel();
  const second=structuredClone(level.nodes.find(n=>n.type==='intro')!);second.id='second-intro';second.params.title='Дополнительное объяснение';level.nodes.push(second);
  const firstToTask=level.edges.find(e=>e.source==='intro'&&e.sourceHandle==='out')!;
  firstToTask.target=second.id;level.edges.push({id:'second-to-task',source:second.id,sourceHandle:'out',target:'task',targetHandle:'in'});
  assert.deepEqual(validateLevel(level),[]);
  const core=new FactoryCore(compileLevel(level));core.command('start');assert.equal(core.state.activeNodeId,'second-intro');assert.equal(core.state.intro,true);core.command('start');manufacture(core);assert.equal(core.state.completed,true);
  const without=deleteNodes(exampleLevel(),['intro']);without.edges.push({id:'direct-task',source:'start',sourceHandle:'out',target:'task',targetHandle:'in'});
  assert.deepEqual(validateLevel(without),[]);const direct=new FactoryCore(compileLevel(without));assert.equal(direct.state.activeNodeId,'wait');manufacture(direct);assert.equal(direct.state.completed,true);
});
