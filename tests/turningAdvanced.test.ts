import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyTurningGeometry,sameGeometry,type TurningGeometry,type TurningOperation,type TurningSetup} from '../src/turningGeometry';
import {checkTurningTool,TURNING_TOOLS,findTurningTool} from '../src/turningTools';
import {TURNING_LESSONS,trainingLevel,initialTrainingPlan,checkTrainingPlan,initialTrainingPart,geometrySuccess,turningToolPosition} from '../src/turningTraining';
import {PlanningCore} from '../src/planning';
import {geometryOf,expectedResult} from '../src/manufacturing';
import {MissionSession} from '../src/platform/session';
const stock:TurningGeometry={length:60,spans:[{z0:0,z1:60,outer0:10,outer1:10,inner0:0,inner1:0}]};
const setup:TurningSetup={chuckSide:'z0',gripLength:10,minWallThickness:1};
const hollow={...setup,axialClearanceDiameter:14,exitClearance:2};
function cut(g:TurningGeometry,op:TurningOperation,s=setup){const r=applyTurningGeometry(g,s,op);assert.ok(r.ok,r.ok?'':r.error.message);return r.value;}
function reject(g:TurningGeometry,op:TurningOperation,code:string,s=setup){const before=structuredClone(g),r=applyTurningGeometry(g,s,op);assert.ok(!r.ok);assert.equal(r.error.code,code);assert.deepEqual(g,before);}
test('groove changes only its width; chamfer creates a real 45 degree linear profile',()=>{
 const groove=cut(stock,{kind:'groove',z0:40,z1:44,diameter:16});
 assert.deepEqual(groove.spans.map(s=>[s.z0,s.z1,s.outer0]),[[0,40,10],[40,44,8],[44,60,10]]);
 const chamfer=cut(stock,{kind:'chamfer',end:'free',axialLength:2,radialDepth:2});
 assert.deepEqual(chamfer.spans.at(-1),{z0:58,z1:60,outer0:10,outer1:8,inner0:0,inner1:0});
 reject(stock,{kind:'chamfer',end:'free',axialLength:2,radialDepth:1},'invalid-size');
 reject(stock,{kind:'groove',z0:5,z1:9,diameter:16},'chuck-collision');
 reject(stock,{kind:'groove',z0:40,z1:44,diameter:22},'adds-material');
});
test('drill depth is flat cylindrical depth from the current free end; breakthrough needs hollow fixture and exit',()=>{
 const blind=cut(stock,{kind:'drill',diameter:8,depth:25});
 assert.equal(blind.spans[0].z1,35);assert.equal(blind.spans.at(-1)!.inner1,4);
 const face=cut(stock,{kind:'face',length:50});
 assert.equal(cut(face,{kind:'drill',diameter:8,depth:25}).spans[0].z1,25);
 reject(stock,{kind:'drill',diameter:8,depth:61},'outside-stock');
 reject(stock,{kind:'drill',diameter:8,depth:60},'invalid-size',hollow);
 reject(stock,{kind:'drill',diameter:8,depth:61},'chuck-collision',{...setup,exitClearance:2});
 reject(stock,{kind:'drill',diameter:8,depth:63},'outside-stock',hollow);
 const through=cut(stock,{kind:'drill',diameter:8,depth:61},hollow);
 assert.equal(through.spans.length,1);assert.equal(through.spans[0].inner0,4);
 reject(stock,{kind:'drill',diameter:19,depth:20},'wall-breakthrough');
 reject(stock,{kind:'drill',diameter:8,depth:-2},'invalid-size');
});
test('boring requires a reachable preliminary channel, increases radius, preserves internal step and wall',()=>{
 reject(stock,{kind:'bore',z0:40,z1:60,diameter:12},'missing-hole');
 const blind=cut(stock,{kind:'drill',diameter:8,depth:40});
 const stepped=cut(blind,{kind:'bore',z0:40,z1:60,diameter:12});
 assert.deepEqual(stepped.spans.map(s=>[s.z0,s.z1,s.inner0]),[[0,20,0],[20,40,4],[40,60,6]]);
 const twice=cut(cut(blind,{kind:'bore',z0:40,z1:60,diameter:10}),{kind:'bore',z0:40,z1:60,diameter:12});
 assert.ok(sameGeometry(stepped,twice));
 reject(stepped,{kind:'bore',z0:40,z1:60,diameter:10},'adds-material');
 reject(blind,{kind:'bore',z0:40,z1:61,diameter:12},'outside-stock');
 reject(blind,{kind:'bore',z0:40,z1:60,diameter:19},'wall-breakthrough');
 assert.equal(checkTurningTool(stock,{kind:'bore',z0:40,z1:60,diameter:12},findTurningTool('bore-choice')).ok,false);
 assert.equal(checkTurningTool(blind,{kind:'drill',diameter:10,depth:20},findTurningTool('drill-8')).ok,false);
 assert.equal(checkTurningTool(blind,{kind:'bore',z0:40,z1:60,diameter:12},{...findTurningTool('bore-choice')!,reach:10}).ok,false);
 const tight=cut(stock,{kind:'drill',diameter:4,depth:40});
 assert.equal(checkTurningTool(tight,{kind:'bore',z0:40,z1:60,diameter:12},findTurningTool('bore-choice')).ok,false);
 assert.equal(checkTurningTool(stock,{kind:'groove',z0:40,z1:41,diameter:16},findTurningTool('groove-choice')).ok,false);
 assert.ok(TURNING_TOOLS.length<=5);
});
test('levels 7–12 execute with real tools through PlanningCore, match preview and store identical item',()=>{
 for(let i=6;i<12;i++){
  const lesson=TURNING_LESSONS[i],definition=trainingLevel(lesson),plan=initialTrainingPlan(lesson),core=new PlanningCore(definition,lesson);
  assert.ok(core.setPlan(plan));const before=core.plan,preview=checkTrainingPlan(definition,plan,lesson);
  assert.deepEqual(preview.errors,[],lesson.id+JSON.stringify(preview.errors));assert.deepEqual(core.plan,before);
  assert.deepEqual(expectedResult({id:'steel-stock',name:'Заготовка',shape:'cylinder',diameter:20,length:60,material:lesson.material,initialBoreDiameter:lesson.initialBoreDiameter},preview.operations),preview.part);
  assert.ok(core.startManufacturing(),lesson.id);
  const session=new MissionSession(core.runtime!,'training',{evaluationProfile:'turning-learning'});while(session.state.intro)session.command('start');
  const r=session.core.resources;session.click(r.blank.id);session.command('install');session.click(r.machine.id);
  while(session.state.stage!=='finished'){
   session.click(r.machine.id);assert.ok(session.command('process'),session.blockedReason('process'));
   session.tick(1);const snapshot=session.state;session.setPaused(true);session.tick(9999);assert.deepEqual(session.state,snapshot);session.setPaused(false);
   session.tick(session.core.currentOperation.seconds*1000);
  }
  const completed=session.state.item!;session.click(r.blank.id);assert.ok(session.command('store'));assert.ok(session.click(r.warehouse.id));
  assert.deepEqual(session.state.item,completed);assert.equal(session.ended,'completed',lesson.id);assert.ok(geometrySuccess(session.state.item!,lesson));
  const actual=geometryOf(session.state.item!),expected=geometryOf(preview.part!);assert.ok(actual.ok&&expected.ok&&sameGeometry(actual.value,expected.value));
  session.detach();core.reset();assert.equal(core.runtime,null);assert.equal(core.plan.operations.length,0);core.dispose();
 }
});
test('wrong tool, unreachable drilling and invalid wall cannot start; plan can be corrected without preview side effects',()=>{
 for(const [index,change] of [[6,'tool'],[8,'depth'],[10,'wall']] as const){
  const lesson=TURNING_LESSONS[index],plan=initialTrainingPlan(lesson),core=new PlanningCore(trainingLevel(lesson),lesson);const op=plan.operations[0];assert.ok(op.kind==='turning'&&op.training);
  if(change==='tool')op.toolId='passing-choice';
  if(change==='depth'&&op.training.target.kind==='drill')op.training.target.depth=70;
  if(change==='wall'&&op.training.target.kind==='bore')op.training.target.diameter=19;
  assert.ok(core.setPlan(plan));const snapshot=core.plan,raw=initialTrainingPart(lesson);assert.ok(core.preview.errors.length);assert.equal(core.startManufacturing(),false);assert.deepEqual(core.plan,snapshot);assert.deepEqual(initialTrainingPart(lesson),raw);
  assert.ok(core.setPlan(initialTrainingPlan(lesson)));assert.ok(core.startManufacturing());const stale=core.runtime!;core.reset();stale.tick(1e9);assert.equal(core.runtime,null);assert.equal(stale.state.disposed,true);core.dispose();
 }
});

test('different drill/boring routes and split rough passes produce the same geometry without air-pass quality changes',()=>{
 const lesson=TURNING_LESSONS[10],plan=initialTrainingPlan(lesson),template=structuredClone(plan.operations[0]);assert.ok(template.kind==='turning'&&template.training);
 const rough=structuredClone(template);rough.id='rough';rough.training!.target={kind:'bore',z0:30,z1:60,diameter:10};rough.training!.settings.depth=.5;
 plan.operations=[rough,template];template.training!.settings.depth=.5;
 const preview=checkTrainingPlan(trainingLevel(lesson),plan,lesson);assert.deepEqual(preview.errors,[]);assert.ok(geometrySuccess(preview.part!,lesson));
 const air=structuredClone(template);air.id='air';air.toolId='drill-8';air.training!.target={kind:'drill',diameter:8,depth:61};
 plan.operations.push(air);const second=checkTrainingPlan(trainingLevel(lesson),plan,lesson);assert.deepEqual(second.errors,[]);assert.equal(second.passes.at(-1)!.removedDepth,0);assert.equal(second.part!.surfaceQuality,preview.part!.surfaceQuality);
 const tapered:TurningGeometry={length:60,spans:[{z0:0,z1:60,outer0:10,outer1:10,inner0:2,inner1:6}]};
 const drilled=cut(tapered,{kind:'drill',diameter:8,depth:61},hollow);assert.equal(drilled.spans.length,2);assert.equal(drilled.spans[0].z1,30);assert.equal(drilled.spans[0].inner0,4);assert.equal(drilled.spans[1].inner1,6);
});

test('new internal profiles and identity survive cancelled transfer and an intermediate warehouse',async()=>{
 const {intermediateLevel,makeNode,connect}=await import('../src/level');const {compileLevel}=await import('../src/compiler');const {FactoryCore}=await import('../src/core');
 const level=intermediateLevel(),lesson=TURNING_LESSONS[11],preview=checkTrainingPlan(trainingLevel(lesson),initialTrainingPlan(lesson),lesson);
 assert.deepEqual(preview.errors,[]);
 const first=preview.operations.filter(o=>o.kind==='turning'&&o.surfacePass!.step===1),second=preview.operations.filter(o=>o.kind==='turning'&&o.surfacePass!.step===2);
 level.nodes.find(n=>n.id==='process')!.params.operations=first;level.nodes.find(n=>n.id==='process-2')!.params.operations=second;
 level.nodes.find(n=>n.id==='tool')!.params.kind='drilling';const bore=makeNode('tool','bore');bore.params.kind='boring';level.nodes.push(bore);
 level.edges=level.edges.filter(e=>!(e.target==='lathe-2'&&e.targetHandle==='tool'));connect(level,'bore','tool','lathe-2','tool');
 for(const n of level.nodes.filter(n=>n.type==='part'))n.params.sections=[];
 const compiled=compileLevel(level);assert.ok(compiled.mode==='production');
 const blind=cut(stock,{kind:'drill',diameter:8,depth:40});
 compiled.waits.wait.requirements.geometry=blind;compiled.waits['wait-2'].requirements.geometry=lesson.requirements;
 const core=new FactoryCore(compiled);const confirm=()=>{while(core.state.activeHint)core.command('continue-hint');};core.command('start');core.click('blank');core.command('install');core.click('lathe');confirm();core.click('lathe');assert.ok(core.command('process'));core.tick(1e6);confirm();
 const item=core.state.item;assert.ok(item);assert.equal(geometryOf(item).ok,true);
 core.click('blank');assert.ok(core.command('store'));assert.ok(core.command('cancel'));assert.deepEqual(core.state.item,item);assert.equal(core.state.location?.kind,'machine');
 core.command('store');assert.ok(core.click('warehouse'));confirm();assert.deepEqual(core.state.item,item);
 core.click('blank');assert.ok(core.command('take'));assert.ok(core.click('lathe-2'));confirm();assert.deepEqual(core.state.item,item);
 while(core.state.stage!=='finished'){core.click('lathe-2');assert.ok(core.command('process'));core.tick(1e6);confirm();}
 core.click('blank');core.command('store');core.click('final-store');assert.equal(core.state.completed,true);assert.equal(core.state.item!.blankId,item.blankId);assert.equal(core.state.item!.material,item.material);
 const g=geometryOf(core.state.item!);assert.ok(g.ok&&sameGeometry(g.value,lesson.requirements));
});

test('tool movement agrees with axial drilling, radial grooving and the current free end',()=>{
 assert.deepEqual(turningToolPosition({kind:'drill',diameter:8,depth:61},1,4),{z:-1,x:0});
 assert.deepEqual(turningToolPosition({kind:'drill',diameter:8,depth:20},.5,4,50),{z:40,x:0});
 assert.deepEqual(turningToolPosition({kind:'groove',z0:40,z1:42,diameter:16},0,1),{z:41,x:9});
 assert.deepEqual(turningToolPosition({kind:'groove',z0:40,z1:42,diameter:16},1,1),{z:41,x:8});
 assert.deepEqual(turningToolPosition({kind:'bore',z0:40,z1:60,diameter:12},1,1),{z:40,x:6});
 assert.deepEqual(turningToolPosition({kind:'chamfer',end:'free',axialLength:2,radialDepth:2},1,2),{z:60,x:8});
});

test('runtime repeats tool compatibility checks and rejects a new operation with no explicit tool',async()=>{
 const lesson=TURNING_LESSONS[8],plan=initialTrainingPlan(lesson),preview=checkTrainingPlan(trainingLevel(lesson),plan,lesson),op=preview.operations[0];
 assert.ok(op.kind==='turning'&&op.surfacePass);
 const {applyOperation}=await import('../src/manufacturing');const {operationCompatibility}=await import('../src/productionGraph');
 const part=initialTrainingPart(lesson),before=structuredClone(part);
 assert.ok(operationCompatibility(part,'lathe',{category:'turning',kind:'passing'},[op]).length);
 const forged=structuredClone(op);delete forged.surfacePass!.toolId;
 assert.throws(()=>applyOperation({id:'steel-stock',name:'Заготовка',shape:'cylinder',diameter:20,length:60,material:'Сталь'},part,forged),/выбрать инструмент/);
 assert.deepEqual(part,before);
});
