import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {exampleLevel,intermediateLevel,millingLevel,locatedPlacements} from '../src/level';
import {compileLevel} from '../src/compiler';
import {FactoryCore} from '../src/core';
import {MissionSession} from '../src/platform/session';
import {MISSIONS} from '../src/platform/missions';
import {itemHost,itemPose,actualSegments} from '../src/scene/model';
import {MILL_TABLE_Z,millTableOffset,drawMillCutter} from '../src/scene/objects';
import {Drawer} from '../src/scene/iso';
import {TaskSheet,ObjectPopover,Dock} from '../src/screens/MissionPanels';
import {DrawingSheet} from '../src/screens/DrawingSheet';

function start(level=exampleLevel()){
  const session=new MissionSession(new FactoryCore(compileLevel(level)),'test');
  while(session.state.intro)assert.ok(session.command('start'));
  return session;
}
function dismissHints(session:MissionSession){while(session.state.activeHint||session.state.intro){assert.ok(session.command(session.state.activeHint?'continue-hint':'start'));}}
function manufacture(session:MissionSession,id:string){
  dismissHints(session);
  const machine=session.core.resources.machines[id];
  for(const op of machine.operations){
    assert.ok(session.click(id));assert.ok(session.command('process'));session.tick(op.seconds*1000+1);dismissHints(session);
  }
}

test('every redesigned mission completes through the v4 session and gesture path',()=>{
  for(const mission of MISSIONS){
    if(mission.training || !mission.build)continue;
    const level=mission.build(),session=start(level);
    assert.equal(level.version,4);
    const first=session.beginDrag();assert.ok(first);
    assert.ok(session.finishDrag(first,session.core.resources.machine.id));
    manufacture(session,session.core.resources.machine.id);
    const ready=session.beginDrag();assert.ok(ready);
    assert.ok(session.finishDrag(ready,session.core.resources.warehouse.id));
    assert.equal(session.ended,'completed',mission.id);
    assert.equal(session.opsDone,session.opsTotal);
    assert.equal(session.summary().stored,true);
    session.dispose();
  }
});

test('new scene ownership follows one item through two machines and intermediate storage',()=>{
  const level=intermediateLevel(),session=start(level),core=session.core;
  const machines=Object.values(core.resources.machines);
  assert.equal(itemHost(level,session.state),core.resources.blank.id);
  assert.ok(locatedPlacements(level).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  for(let i=0;i<machines.length;i++){
    const drag=session.beginDrag();assert.ok(drag);assert.ok(session.finishDrag(drag,machines[i].id));
    assert.equal(itemHost(level,session.state),machines[i].id);
    manufacture(session,machines[i].id);
    assert.equal(session.opsDone,i+1);
    const delivery=session.beginDrag();assert.ok(delivery);assert.ok(session.finishDrag(delivery,machines[i].storeIds[0]));
    assert.equal(itemHost(level,session.state),machines[i].storeIds[0]);
    assert.equal(session.ended,i===0?null:'completed');
    if(i===0){
      const html=renderToString(createElement(ObjectPopover,{session,anchor:{id:machines[i].storeIds[0],x:400,y:300},stage:null}));
      assert.match(html,/Взять заготовку/);
    }
  }
  assert.equal(session.state.item?.sections.length,2);
  session.dispose();
});

test('milling uses actual dimensions in the new panels and session',()=>{
  const level=millingLevel(),session=start(level),r=session.core.resources;
  const raw=structuredClone(session.state.item);
  assert.match(renderToString(createElement(DrawingSheet,{title:level.name,blank:r.blank,ops:r.operations})),/15/);
  assert.deepEqual(session.state.item,raw,'drawing must not change the item');
  const drag=session.beginDrag();assert.ok(drag);session.finishDrag(drag,r.machine.id);
  assert.match(renderToString(createElement(TaskSheet,{session,collapsed:false,onToggle:()=>{}})),/Снять 5 мм/);
  manufacture(session,r.machine.id);
  assert.equal(session.state.item?.shape,'block');
  assert.equal(session.state.item?.shape==='block'&&session.state.item.height,15);
  const ready=session.beginDrag();assert.ok(ready);session.finishDrag(ready,r.warehouse.id);
  assert.equal(session.ended,'completed');session.dispose();
});

test('milled stock stays on its support plane and its drawing shows current and required heights',()=>{
  const session=start(millingLevel()),r=session.core.resources;
  const raw=session.state.item!;
  const pose=itemPose('lathe','mill',raw);
  assert.equal(pose.z-pose.halfHeight,MILL_TABLE_Z);
  const before=renderToString(createElement(DrawingSheet,{title:'Брусок',blank:r.blank,ops:r.operations,actual:{doneOps:0,progress:0}}));
  assert.match(before,/сейчас высота 20 мм/);
  assert.match(before,/60 × 40 × 15 мм/);
  const drag=session.beginDrag();assert.ok(drag);session.finishDrag(drag,r.machine.id);
  manufacture(session,r.machine.id);
  const finished=session.state.item!;
  const afterPose=itemPose('lathe','mill',finished);
  assert.equal(afterPose.z-afterPose.halfHeight,MILL_TABLE_Z);
  assert.ok(afterPose.z+afterPose.halfHeight<pose.z+pose.halfHeight);
  assert.equal(afterPose.halfWidth,pose.halfWidth);
  const after=renderToString(createElement(DrawingSheet,{title:'Брусок',blank:r.blank,ops:r.operations,actual:{doneOps:1,progress:0}}));
  assert.match(after,/сейчас высота 15 мм/);
  assert.doesNotMatch(after,/Ø/);
  session.dispose();
});

test('milling feeds stock under a fixed spindle and returns the table after cutting',()=>{
  const session=start(millingLevel()),part=session.state.item!;
  const positions:number[]=[];
  const drawer={cylZ:(x:number)=>positions.push(x),line:()=>{},p:(x:number,y:number,z:number)=>({x,y:y-z})} as unknown as Drawer;
  for(const progress of [.1,.3,.5,.7,.9]){
    const pose=itemPose('lathe','mill',part,progress);
    assert.ok(pose.x<=1e-9&&pose.x+.56>=-1e-9,'stock must pass beneath spindle x=0');
    assert.equal(pose.z-pose.halfHeight,MILL_TABLE_Z);
    assert.ok(drawMillCutter(drawer,.72,true,progress,1000));
  }
  assert.ok(positions.every(x=>x===0),'spindle must stay attached to the head');
  assert.equal(millTableOffset(0),0);assert.equal(millTableOffset(1),0);
  assert.ok(millTableOffset(.1)>millTableOffset(.9));
  assert.equal(drawMillCutter(drawer,.72,true,.98,1000),null,'no cutting effects during return');
  session.dispose();
});

test('cancel, pause and stale gestures preserve the item and cannot start processing',()=>{
  const session=start(),before=session.state.item;
  const drag=session.beginDrag();assert.ok(drag);
  session.cancelDrag(drag);assert.deepEqual(session.state.item,before);assert.equal(session.state.target,null);
  assert.equal(session.finishDrag(drag,session.core.resources.machine.id),false);
  session.setPaused(true);assert.equal(session.beginDrag(),null);assert.equal(session.command('install'),false);
  session.setPaused(false);session.restart();assert.equal(session.opsDone,0);assert.equal(session.ended,null);
  session.dispose();
});

test('recreating the editor scene after reset leaves Continue and manufacturing usable',()=>{
  const core=new FactoryCore(compileLevel(millingLevel()));
  let adapter=new MissionSession(core,'test');
  for(let i=0;i<3;i++){
    assert.ok(core.command('start'));
    core.reset();
    let oldNotifications=0;
    adapter.subscribe(()=>oldNotifications++);
    adapter.detach();
    assert.equal(core.state.disposed,false);
    adapter=new MissionSession(core,'test');
    assert.ok(core.command('start'),'Continue must work after replacing the scene adapter');
    assert.equal(core.state.intro,false);
    assert.equal(oldNotifications,0,'old scene subscribers must be released');
    if(i<2){core.reset();}
  }
  const drag=adapter.beginDrag();assert.ok(drag);
  assert.ok(adapter.finishDrag(drag,core.resources.machine.id));
  manufacture(adapter,core.resources.machine.id);
  const delivery=adapter.beginDrag();assert.ok(delivery);
  assert.ok(adapter.finishDrag(delivery,core.resources.warehouse.id));
  assert.equal(adapter.ended,'completed');
  adapter.dispose();assert.equal(core.state.disposed,true,'owning sessions still dispose their core');
});

test('new dock exposes every machine and warehouse; geometry reflects actual sections',()=>{
  const session=start(intermediateLevel());
  const html=renderToString(createElement(Dock,{session,hintText:null,onHint:()=>{}}));
  for(const object of [...Object.values(session.core.resources.machines),...Object.values(session.core.resources.warehouses)])assert.ok(html.includes(object.name));
  const segments=actualSegments({shape:'cylinder',diameter:20,length:60,material:'Сталь',blankId:'b',operationIds:['a','b'],sections:[{diameter:12,length:20},{diameter:8,length:20}]},20);
  assert.equal(segments.length,3);assert.ok(segments[0].r>segments[1].r&&segments[1].r>segments[2].r);
  session.dispose();
});
