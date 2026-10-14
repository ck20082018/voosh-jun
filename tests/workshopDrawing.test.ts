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

test('milled block uses the actual reduced height and there is only one part on the warehouse',()=>{
 const base:WorkshopDrawingData={grid:{width:3,height:1},selected:null,nodes:[{id:'blank',type:'blank',shape:'block',length:60,width:40,height:20},{id:'machine',type:'lathe',machineKind:'mill'},{id:'store',type:'warehouse'}],placements:[{nodeId:'blank',x:0,y:0},{nodeId:'machine',x:1,y:0},{nodeId:'store',x:2,y:0}]};
 const first=recordingGraphics(),last=recordingGraphics();
 new WorkshopDrawing(first.graphics).render(freeze({...base,production:{stage:'loaded',selected:null,target:null,blank:{id:'blank',shape:'block',length:60,width:40,height:20},part:null}}),0);
 new WorkshopDrawing(last.graphics).render(freeze({...base,production:{stage:'finished',selected:null,target:null,blank:{id:'blank',shape:'block',length:60,width:40,height:20},part:{shape:'block',length:60,width:40,height:15,sections:[]}}}),0);
 // Locate the top face of the metal block by its unique fill colour.
 const top=(calls:typeof first.calls)=>calls[calls.findIndex(c=>c.name==='fillStyle'&&c.args[0]===0xd6e1e2)+1].args[0];
 assert.equal(top(last.calls)[0].y-top(first.calls)[0].y,3.5);assert.equal(top(last.calls)[1].x-top(last.calls)[0].x,45);
 const stored=recordingGraphics();new WorkshopDrawing(stored.graphics).render(freeze({...base,production:{stage:'stored',selected:null,target:null,blank:{id:'blank',shape:'block',length:60,width:40,height:20},part:{shape:'block',length:60,width:40,height:15,sections:[]}}}),0);
 assert.equal(stored.calls.filter(c=>c.name==='fillStyle'&&c.args[0]===0xd6e1e2).length,1);
});

test('multiple finished machines and two stores draw one physical part at its actual location',()=>{
 const {graphics,calls}=recordingGraphics();const view:WorkshopDrawingData={grid:{width:5,height:1},selected:null,nodes:[{id:'blank',type:'blank'},{id:'one',type:'lathe'},{id:'two',type:'lathe'},{id:'mid',type:'warehouse'},{id:'final',type:'warehouse'}],placements:[{nodeId:'blank',x:0,y:0},{nodeId:'one',x:1,y:0},{nodeId:'two',x:2,y:0},{nodeId:'mid',x:3,y:0},{nodeId:'final',x:4,y:0}],production:{stage:'stored',selected:null,target:null,blank:{id:'blank',shape:'cylinder',diameter:20,length:60},part:{sections:[{diameter:12,length:30}]},location:{kind:'warehouse',id:'mid'},machines:{one:{stage:'finished',itemId:null},two:{stage:'empty',itemId:null}},warehouses:{mid:{itemId:'blank'},final:{itemId:null}}}};
 new WorkshopDrawing(graphics).render(freeze(view),0);assert.equal(calls.filter(c=>c.name==='fillStyle'&&c.args[0]===0x9db0b9).length,2);const metal=calls[calls.findIndex(c=>c.name==='fillStyle'&&c.args[0]===0x9db0b9)+1];assert.equal(metal.args[0][0].x,projectCell(3,0).x-17);
});

test('a drag preview renders one actual part at the pointer and never a duplicate at its source',()=>{
 const {graphics,calls}=recordingGraphics();
 const view=freeze<WorkshopDrawingData>({grid:{width:3,height:1},selected:null,
  nodes:[{id:'blank',type:'blank'},{id:'machine',type:'lathe'},{id:'store',type:'warehouse'}],
  placements:[{nodeId:'blank',x:0,y:0},{nodeId:'machine',x:1,y:0},{nodeId:'store',x:2,y:0}],
  draggedPart:{x:700,y:200,length:45,radius:9},
  production:{stage:'finished',selected:'blank',target:'warehouse',location:{kind:'machine',id:'machine'},
   machines:{machine:{stage:'finished',itemId:'blank'}},blank:{id:'blank',diameter:20,length:60},part:{sections:[{diameter:12,length:30}]}}});
 const before=JSON.stringify(view);
 new WorkshopDrawing(graphics).render(view,0);
 const surfaces=calls.filter(c=>c.name==='fillStyle'&&c.args[0]===0x9db0b9);
 assert.equal(surfaces.length,2);
 const first=calls[calls.indexOf(surfaces[0])+1];
 assert.equal(first.args[0][0].x,700);
 assert.equal(JSON.stringify(view),before);
});
