import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyTurningGeometry,sameGeometry,normalizeGeometry,validateGeometry,type TurningGeometry,type TurningSetup} from '../src/turningGeometry';
import {THREAD_CATALOG,threadDepth,threadMotion,minimumWall,type ThreadOperation,threadLabel,checkThreadTarget} from '../src/threading';
import {TURNING_LESSONS,trainingLevel,initialTrainingPlan,checkTrainingPlan,initialTrainingPart,geometrySuccess} from '../src/turningTraining';
import {PlanningCore} from '../src/planning';
import {geometryOf} from '../src/manufacturing';
import {MissionSession} from '../src/platform/session';
import {MISSIONS} from '../src/platform/missions';
import {defaultProfile,applyMissionAttempt,missionStatus} from '../src/platform/progress';
import {computeScore} from '../src/platform/scoring';
import {checkTurningTool,findTurningTool} from '../src/turningTools';
import {compareDrawing} from '../src/drawingGeometry';
const setup:TurningSetup={chuckSide:'z0',gripLength:10,minWallThickness:1};
const stock=(diameter=12,bore=0):TurningGeometry=>({length:60,spans:[{z0:0,z1:60,outer0:diameter/2,outer1:diameter/2,inner0:bore/2,inner1:bore/2}]});
const target=(surface:'outer'|'inner'='outer',pitch=1.5):ThreadOperation=>({kind:'thread',surface,diameter:12,pitch,z0:30,z1:60,depth:threadDepth({diameter:12,pitch,surface}),phase:0});
function passes(g:TurningGeometry,t=target(),depth=.15){let part=g;for(let d=depth;d<t.depth+depth;d+=depth){const op={...t,depth:Math.min(d,t.depth)},r=applyTurningGeometry(part,setup,op);assert.ok(r.ok,r.ok?'':r.error.message);part=r.value;if(op.depth===t.depth)break;}return part;}
function failure(g:TurningGeometry,t:ThreadOperation,code:string){const copy=structuredClone(g),r=applyTurningGeometry(g,setup,t);assert.ok(!r.ok);assert.equal(r.error.code,code);assert.deepEqual(g,copy);}
test('catalog recipes build external/internal features progressively without changing smooth profile or inputs',()=>{
 assert.equal(THREAD_CATALOG.length,2);
 for(const recipe of THREAD_CATALOG)for(const surface of ['inner','outer'] as const){
  const g=stock(surface==='inner'?20:12,surface==='inner'?recipe.innerPrepared:0),copy=structuredClone(g),t=target(surface,recipe.pitch);
  failure(g,t,'invalid-size'); // complete geometry is not a single physical cut
  const first=applyTurningGeometry(g,setup,{...t,depth:.15});assert.ok(first.ok);assert.ok(first.value.threads![0].depth<threadDepth(t));
  const done=passes(g,t);assert.deepEqual(done.spans,g.spans);assert.deepEqual(g,copy);assert.equal(done.threads![0].depth,threadDepth(t));assert.match(threadLabel(done.threads![0]),/100%/);
  assert.ok(validateGeometry(done).ok);assert.deepEqual(normalizeGeometry(done),done);
 }
});
test('pitch, nominal diameter, phase and preparation are enforced; no blind-bottom or shoulder traversal',()=>{
 failure(stock(20),{...target(),depth:.15},'unreachable');
 failure(stock(20,8),{...target('inner'),depth:.15},'unreachable');
 failure(stock(),{...target(),pitch:2,depth:.15},'invalid-size');
 failure(stock(),{...target(),diameter:14,depth:.15},'invalid-size');
 failure(stock(),{...target(),phase:.5,depth:.15},'invalid-size');
 failure(stock(),{...target(),z0:12,depth:.15},'chuck-collision');
 const blind:TurningGeometry={length:60,spans:[{z0:0,z1:20,outer0:10,outer1:10,inner0:0,inner1:0},{z0:20,z1:60,outer0:10,outer1:10,inner0:5.25,inner1:5.25}]};
 failure(blind,{...target('inner'),depth:.15},'unreachable');
 const shoulder:TurningGeometry={length:60,spans:[{z0:0,z1:28,outer0:10,outer1:10,inner0:0,inner1:0},{z0:28,z1:60,outer0:6,outer1:6,inner0:0,inner1:0}]};failure(shoulder,{...target(),depth:.15},'unreachable');
 const first=passes(stock());failure(first,{...target(),pitch:1,depth:.15},'thread-damaged');failure(first,{...target(),depth:.1},'adds-material');
 assert.equal(checkTurningTool(stock(),target(),findTurningTool('thread-inner')).ok,false);
 assert.equal(checkTurningTool(stock(20,8),target('inner'),findTurningTool('thread-inner')).ok,false);
});
test('thread cutting always uses pitch as feed, same global phase at a Z, and RPM changes only time',()=>{
 const lesson=TURNING_LESSONS[12],definition=trainingLevel(lesson),plan=initialTrainingPlan(lesson),op=plan.operations[0];assert.ok(op.kind==='turning'&&op.training);
 const slow=checkTrainingPlan(definition,plan,lesson);assert.deepEqual(slow.errors,[]);assert.ok(slow.passes.length>1);assert.ok(slow.passes.every(p=>p.settings.feed===1.5&&p.target.kind==='thread'&&p.target.phase===0));
 op.training.settings.rpm=600;const fast=checkTrainingPlan(definition,plan,lesson);assert.deepEqual(fast.errors,[]);assert.equal(slow.calculatedSeconds,2*fast.calculatedSeconds);assert.deepEqual(slow.part!.geometry,fast.part!.geometry);
 for(const p of fast.passes){assert.ok(p.target.kind==='thread');const m=threadMotion(p.target,.5);assert.equal(m.z/1.5+m.turns,0);const delta=1.5/m.travel;assert.ok(Math.abs(threadMotion(p.target,.5+delta).turns-m.turns-1)<1e-9);}
 op.training.settings.feed=.2;assert.match(checkTrainingPlan(definition,plan,lesson).errors.join(),/равняться шагу/);
});
test('partial and wrong-pitch features fail order; equivalent split features and radial passes compare correctly',()=>{
 const g=stock(),full=passes(g),partial=applyTurningGeometry(g,setup,{...target(),depth:.15});assert.ok(partial.ok);
 assert.equal(sameGeometry(full,partial.value),false);assert.ok(compareDrawing(full,partial.value).some(d=>d.dimension.kind==='thread'));
 const wrong=passes(g,target('outer',1));assert.equal(sameGeometry(full,wrong),false);assert.match(compareDrawing(full,wrong).map(d=>d.message).join(),/Резьба/);
 assert.ok(sameGeometry(full,passes(g,target(),.1)));
 const t=full.threads![0],split={...full,threads:[{...t,z1:45},{...t,z0:45}]};assert.ok(sameGeometry(full,split));
 const closeDepth={...full,threads:[{...t,depth:t.depth-1.5e-6}]};assert.equal(sameGeometry(full,closeDepth),false);assert.ok(compareDrawing(full,closeDepth).some(d=>d.dimension.kind==='thread'));
 const forged={...full,threads:[{...t,hand:'left' as 'right'}]};assert.equal(validateGeometry(forged).ok,false);
});
test('later cuts preserve unrelated thread and enforce root wall; no implicit erasure',()=>{
 const threaded=passes(stock(20,10.5),target('inner'));
 const damaged=applyTurningGeometry(threaded,setup,{kind:'bore',z0:40,z1:60,diameter:11});assert.ok(!damaged.ok);assert.equal(damaged.error.code,'thread-damaged');
 const thin=applyTurningGeometry(threaded,setup,{kind:'outside-turn',z0:30,z1:60,diameter:13});assert.ok(!thin.ok);assert.equal(thin.error.code,'wall-breakthrough');
 const okay=applyTurningGeometry(threaded,setup,{kind:'chamfer',end:'free',axialLength:1,radialDepth:1});assert.ok(okay.ok);assert.deepEqual(okay.value.threads,threaded.threads);assert.equal(minimumWall(okay.value),3);
});
function run(index:number,custom?:ReturnType<typeof initialTrainingPlan>){
 const lesson=TURNING_LESSONS[index],core=new PlanningCore(trainingLevel(lesson),lesson),plan=custom??initialTrainingPlan(lesson);assert.ok(core.setPlan(plan));const before=core.plan,preview=core.preview;
 assert.deepEqual(preview.errors,[],JSON.stringify(preview.errors));assert.deepEqual(core.plan,before);assert.ok(core.startManufacturing());
 const session=new MissionSession(core.runtime!,'training',{evaluationProfile:'turning-learning'});while(session.state.intro)session.command('start');const r=session.core.resources;
 session.click(r.blank.id);session.command('install');session.click(r.machine.id);
 while(session.state.stage!=='finished'){
  session.click(r.machine.id);assert.ok(session.command('process'),session.blockedReason('process'));session.tick(1);const frozen=session.state;session.setPaused(true);session.tick(9999);assert.deepEqual(session.state,frozen);session.setPaused(false);session.tick(session.core.currentOperation.seconds*1000);
 }
 const item=session.state.item;session.click(r.blank.id);session.command('store');session.click(r.warehouse.id);assert.deepEqual(session.state.item,item);assert.deepEqual(session.state.item?.geometry,preview.part?.geometry);
 return {core,session,lesson};
}
test('all 15 missions unlock in order, execute, save progress and remain repeatable through existing production cores',()=>{
 let profile=defaultProfile();
 for(let i=0;i<15;i++){
  const mission=MISSIONS.find(m=>m.id===`turning-${i+1}`)!;assert.equal(missionStatus(profile,mission),'available');
  if(i<14)assert.equal(missionStatus(profile,MISSIONS.find(m=>m.id===`turning-${i+2}`)!),'locked');
  const {core,session,lesson}=run(i);assert.equal(session.ended,'completed',lesson.id);assert.ok(geometrySuccess(session.state.item!,lesson));
  profile=JSON.parse(JSON.stringify(applyMissionAttempt(profile,mission.id,session.summary(),computeScore(session.summary()),session.opsTotal).profile));assert.equal(missionStatus(profile,mission),'max');session.detach();core.reset();assert.equal(core.runtime,null);core.dispose();
 }
 assert.equal(Object.keys(profile.records).length,15);
});
test('workshop order accepts alternative physically permitted route and rejects unfinished/wrong material attempts, reset cancels stale processing',()=>{
 const lesson=TURNING_LESSONS[14],plan=initialTrainingPlan(lesson);plan.operations=[plan.operations[2],plan.operations[3],plan.operations[0],plan.operations[1],plan.operations[4],plan.operations[5]];
 const {core,session}=run(14,plan);assert.equal(session.ended,'completed');assert.ok(geometrySuccess(session.state.item!,lesson));session.detach();core.dispose();
 const partial=initialTrainingPlan(lesson),last=partial.operations.at(-1)!;assert.ok(last.kind==='turning'&&last.training&&last.training.target.kind==='thread');last.training.target.depth=.3;
 const bad=run(14,partial);assert.notEqual(bad.session.ended,'completed');assert.equal(bad.core.assessment?.success,false);assert.ok(bad.core.assessment!.differences.some(d=>d.characteristic.startsWith('Резьба')));bad.session.detach();assert.ok(bad.core.retry());assert.ok(bad.core.setPlan(initialTrainingPlan(lesson)));assert.ok(bad.core.startManufacturing());const stale=bad.core.runtime!;bad.core.reset();stale.tick(1e9);assert.equal(stale.state.disposed,true);assert.equal(bad.core.runtime,null);bad.core.dispose();
 const alu=initialTrainingPlan(lesson);alu.blankId='alu-stock';const a=run(14,alu);assert.equal(a.core.assessment!.success,false);a.session.detach();a.core.dispose();
 const thin=initialTrainingPlan(lesson);thin.blankId='thin-stock';const p=new PlanningCore(trainingLevel(lesson),lesson);p.setPlan(thin);assert.ok(p.preview.errors.length);assert.equal(p.startManufacturing(),false);
});

test('reset during a partially threaded second pass clears progress and a new attempt starts from unthreaded stock',()=>{
 const lesson=TURNING_LESSONS[12],core=new PlanningCore(trainingLevel(lesson),lesson);core.setPlan(initialTrainingPlan(lesson));assert.ok(core.startManufacturing());
 const runtime=core.runtime!;while(runtime.state.intro)runtime.command('start');const r=runtime.resources;runtime.click(r.blank.id);runtime.command('install');runtime.click(r.machine.id);runtime.click(r.machine.id);assert.ok(runtime.command('process'));runtime.tick(runtime.currentOperation.seconds*1000);
 assert.ok(runtime.state.item!.geometry!.threads![0].depth<threadDepth(target()));runtime.click(r.machine.id);runtime.command('process');runtime.tick(1);
 const before=structuredClone(runtime.state.item);core.reset();runtime.tick(1e9);assert.deepEqual(runtime.state.item,before);assert.equal(runtime.state.disposed,true);
 core.setPlan(initialTrainingPlan(lesson));assert.ok(core.startManufacturing());assert.equal(core.runtime!.state.item!.geometry?.threads,undefined);core.dispose();
});

test('thread root wall and tool reach also cover the reserved runout, not just the full-thread interval',()=>{
 const g:TurningGeometry={length:60,spans:[{z0:0,z1:30,outer0:6.45,outer1:6.45,inner0:5.25,inner1:5.25},{z0:30,z1:60,outer0:10,outer1:10,inner0:5.25,inner1:5.25}]};
 const r=checkThreadTarget(g,setup,target('inner'));assert.ok(!r.ok);assert.equal(r.error.code,'wall-breakthrough');
 const tool={...findTurningTool('thread-inner')!,reach:31};assert.equal(checkTurningTool(stock(20,10.5),target('inner'),tool).ok,false);
});
