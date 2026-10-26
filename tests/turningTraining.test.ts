import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PlanningCore} from '../src/planning';
import {TURNING_LESSONS,trainingLevel,initialTrainingPlan,checkTrainingPlan,cuttingEstimate,geometrySuccess} from '../src/turningTraining';
import {MissionSession} from '../src/platform/session';
import {computeScore} from '../src/platform/scoring';
import {defaultProfile,applyMissionAttempt,missionStatus} from '../src/platform/progress';
import {MISSIONS} from '../src/platform/missions';
import {geometryOf,applyOperation} from '../src/manufacturing';
import {sameGeometry} from '../src/turningGeometry';
function run(i:number){
 const lesson=TURNING_LESSONS[i],level=trainingLevel(lesson),planning=new PlanningCore(level,lesson);
 assert.ok(planning.setPlan(initialTrainingPlan(lesson)));
 const before=planning.plan,preview=planning.preview;
 assert.deepEqual(preview.errors,[],JSON.stringify(preview.errors));assert.deepEqual(planning.plan,before);
 assert.ok(planning.startManufacturing());
 const session=new MissionSession(planning.runtime!,'training',{evaluationProfile:'turning-learning'});
 while(session.state.intro)assert.ok(session.command('start'));
 const r=session.core.resources;
 session.click(r.blank.id);assert.ok(session.command('install'));assert.ok(session.click(r.machine.id));
 while(session.state.stage!=='finished'){
  session.click(r.machine.id);assert.ok(session.command('process'));
  session.tick(10);
  const snapshot=session.state;
  session.setPaused(true);session.tick(10000);assert.deepEqual(session.state,snapshot,'pause preserves geometry and remaining progress');
  session.setPaused(false);session.tick(session.core.currentOperation.seconds*1000);
 }
 session.click(r.blank.id);assert.ok(session.command('store'));assert.ok(session.click(r.warehouse.id));
 return {planning,session,preview};
}
test('all six missions execute through PlanningCore and its FactoryCore and match pure preview',()=>{
 let profile=defaultProfile();
 for(let i=0;i<6;i++){
  const mission=MISSIONS.find(m=>m.id===`turning-${i+1}`)!;assert.equal(missionStatus(profile,mission),'available');
  const {planning,session,preview}=run(i);
  assert.equal(session.ended,'completed',mission.id);assert.equal(planning.assessment?.success,true);
  assert.ok(geometrySuccess(session.state.item!,TURNING_LESSONS[i]));
  const actual=geometryOf(session.state.item!),expected=geometryOf(preview.part!);assert.ok(actual.ok&&expected.ok&&sameGeometry(actual.value,expected.value));
  profile=applyMissionAttempt(profile,mission.id,session.summary(),computeScore(session.summary()),session.opsTotal).profile;
  assert.equal(missionStatus(profile,mission),'max');
  session.detach();planning.reset();assert.equal(planning.runtime,null);assert.equal(planning.plan.operations.length,0);planning.dispose();
 }
});
test('feed speed has physical units, high depth increases load; minimum speed is not best quality',()=>{
 const a=cuttingEstimate({rpm:600,feed:.1,depth:1},30,'Сталь','outside-turn',1);
 assert.equal(a.seconds,30); // 60 mm/min over 30 mm
 const b=cuttingEstimate({rpm:1200,feed:.1,depth:1},30,'Сталь','outside-turn',1);assert.equal(b.seconds,15);
 assert.ok(cuttingEstimate({rpm:600,feed:.1,depth:1},30,'Сталь','outside-turn',2).load>a.load);
 assert.ok(cuttingEstimate({rpm:600,feed:.08,depth:.2},30,'Сталь','outside-turn',.2).quality>cuttingEstimate({rpm:300,feed:.08,depth:.2},30,'Сталь','outside-turn',.2).quality);
 assert.ok(cuttingEstimate({rpm:600,feed:.35,depth:1},30,'Сталь','outside-turn',1).quality<a.quality);
});
test('depth controls pass count; overload warns and cannot mutate or start the real item',()=>{
 const l=TURNING_LESSONS[4],level=trainingLevel(l),p=initialTrainingPlan(l);
 const steps=p.operations;assert.ok(steps[0].kind==='turning'&&steps[0].training);
 steps[0].training.settings.depth=.5;assert.equal(checkTrainingPlan(level,p,l).passes.length,10);
 steps[0].training.settings.depth=2;assert.equal(checkTrainingPlan(level,p,l).passes.length,3);
 const lesson=TURNING_LESSONS[5],plan=initialTrainingPlan(lesson),op=plan.operations[0];assert.ok(op.kind==='turning'&&op.training);
 op.training.settings={rpm:1200,feed:.4,depth:3};
 const c=new PlanningCore(trainingLevel(lesson),lesson);c.setPlan(plan);const before=c.plan;
 assert.ok(checkTrainingPlan(c.definition,plan,lesson).maxLoad>100);assert.equal(c.startManufacturing(),false);assert.equal(c.runtime,null);assert.deepEqual(c.plan,before);
});
test('only real last cut improves quality; air pass after rough cutting cannot satisfy finish goal',()=>{
 const lesson=TURNING_LESSONS[5],level=trainingLevel(lesson),p=initialTrainingPlan(lesson);
 const first=p.operations[0],last=p.operations[1];assert.ok(first.kind==='turning'&&first.training&&last.kind==='turning'&&last.training);
 first.training.target={kind:'outside-turn',z0:20,z1:60,diameter:10};
 const preview=checkTrainingPlan(level,p,lesson);assert.deepEqual(preview.errors,[]);
 let part={shape:'cylinder' as const,diameter:20,length:60,blankId:'steel-stock',material:'Сталь',sections:[],operationIds:[]} as import('../src/manufacturing').Part;
 for(const op of preview.operations)part=applyOperation({shape:'cylinder',diameter:20,length:60,id:'steel-stock',name:'x',material:'Сталь'},part,op);
 assert.equal(preview.passes.at(-1)!.removedDepth,0);
 assert.equal(geometrySuccess(part,lesson),false);
 assert.ok((part.surfaceQuality??0)<lesson.minQuality!);
});
test('learning score excludes reading/reflection penalties, olympiad profile remains strict',()=>{
 const {planning,session}=run(0);const s=session.summary();
 assert.equal(computeScore({...s,hints:100,timeSec:100000,coaching:true}).total,1000);
 assert.ok(computeScore({...s,mode:'olympiad',errors:2,timeSec:100000}).total<1000);
 session.detach();planning.dispose();
});
test('author ranges and fixed targets are enforced by PlanningCore; reset cancels partially timed pass',()=>{
 const lesson=TURNING_LESSONS[0],level=trainingLevel(lesson),core=new PlanningCore(level,lesson),plan=initialTrainingPlan(lesson);
 const op=plan.operations[0];assert.ok(op.kind==='turning'&&op.training);
 op.training.settings.feed=.12;core.setPlan(plan);assert.ok(core.preview.errors.length);assert.equal(core.startManufacturing(),false);
 op.training.settings.feed=.2;op.training.target={kind:'outside-turn',z0:30,z1:60,diameter:12};core.setPlan(plan);assert.equal(core.startManufacturing(),false);
 core.setPlan(initialTrainingPlan(lesson));assert.ok(core.startManufacturing());assert.equal(core.setPlan(initialTrainingPlan(lesson)),false,'frozen plan cannot be edited');
 const runtime=core.runtime!;while(runtime.state.intro)runtime.command('start');const r=runtime.resources;runtime.click(r.blank.id);runtime.command('install');runtime.click(r.machine.id);runtime.click(r.machine.id);assert.ok(runtime.command('process'));runtime.tick(1);
 const item=runtime.state.item;assert.ok(item);core.reset();runtime.tick(100000);assert.equal(core.runtime,null);assert.equal(runtime.state.disposed,true);assert.equal(runtime.state.completed,false);
 core.setPlan(initialTrainingPlan(lesson));assert.ok(core.startManufacturing());assert.equal(core.runtime!.state.stage,'table');core.dispose();assert.equal(core.startManufacturing(),false);
});
