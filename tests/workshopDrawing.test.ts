import test from 'node:test';
import assert from 'node:assert/strict';
import type Phaser from 'phaser';
import {projectCell,WorkshopDrawing,type WorkshopDrawingData} from '../src/presentation/workshopDrawing';

function recordingGraphics(){
  const calls:{name:string;args:any[]}[]=[];
  const graphics=new Proxy({}, {get:(_target,name)=> (...args:any[])=>{
    calls.push({name:String(name),args});return graphics;
  }}) as Phaser.GameObjects.Graphics;
  return {graphics,calls};
}
function freeze<T>(value:T):T{
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;
}

test('drawing renders every shaft section at its production dimensions without changing the snapshot',()=>{
  const {graphics,calls}=recordingGraphics();
  const view=freeze<WorkshopDrawingData>({grid:{width:1,height:1},selected:null,
    nodes:[{id:'machine',type:'lathe'}],placements:[{nodeId:'machine',x:0,y:0}],
    production:{stage:'finished',selected:'blank',target:null,blank:{id:'blank',diameter:20,length:60},
      part:{sections:[{diameter:12,length:30},{diameter:8,length:15}]}}});
  const before=JSON.stringify(view);
  new WorkshopDrawing(graphics).render(view,0);
  // Each cylinder segment has two end caps. The lathe chuck is a separate ellipse.
  const caps=calls.filter(c=>c.name==='fillEllipse'&&c.args[0]>=509&&c.args[1]<110);
  assert.equal(caps.length,6);
  assert.deepEqual(caps.map(c=>c.args[3]),[18,18,10.8,10.8,7.2,7.2]);
  assert.deepEqual(caps.map(c=>c.args[0]),[509,520.25,520.25,542.75,542.75,554]);
  assert.equal(JSON.stringify(view),before);
});

test('drawing moves the single part between table, machine and warehouse and decorates processing only',()=>{
  const base:WorkshopDrawingData={grid:{width:3,height:1},selected:null,
    nodes:[{id:'blank',type:'blank'},{id:'machine',type:'lathe'},{id:'store',type:'warehouse'}],
    placements:[{nodeId:'blank',x:0,y:0},{nodeId:'machine',x:1,y:0},{nodeId:'store',x:2,y:0}]};
  for(const [stage,startX] of [['table',492],['loaded',567],['processing',567],['finished',567],['stored',609]] as const){
    const {graphics,calls}=recordingGraphics();
    new WorkshopDrawing(graphics).render(freeze({...base,production:{stage,selected:null,target:null,
      blank:{id:'blank',diameter:20,length:60},part:stage==='finished'||stage==='stored'?{sections:[{diameter:12,length:30}]}:null}}),1);
    const surfaces=calls.filter(c=>c.name==='fillStyle'&&c.args[0]===0x9db0b9);
    assert.equal(surfaces.length,stage==='finished'||stage==='stored'?2:1);
    const first=calls[calls.indexOf(surfaces[0])+1];
    assert.equal(first.name,'fillPoints');assert.equal(first.args[0][0].x,startX);
    assert.equal(calls.some(c=>c.name==='lineStyle'&&c.args[1]===0xfff3c8),stage==='processing');
  }
  assert.deepEqual(projectCell(2,1),{x:568,y:245});
});
