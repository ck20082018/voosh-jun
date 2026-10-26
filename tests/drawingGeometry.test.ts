import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import {DRAWING_FIXTURES} from '../src/drawingFixtures';
import {drawingDimensions,dimensionValue,drawingFrame,projectMeridian,projectVolume,materialStrips,sectionContours,clippedSpans,volumeFaces,compareDrawing,operationDrawingRegion,dimensionText} from '../src/drawingGeometry';
import {validateGeometry,type TurningGeometry} from '../src/turningGeometry';
import {InteractiveDrawing,GeometryPreview} from '../src/screens/InteractiveDrawing';
import {DrawingSheet} from '../src/screens/DrawingSheet';
import {PartPreview} from '../src/PartPreview';
import {millingLevel,exampleLevel} from '../src/level';
import {compileLevel} from '../src/compiler';
const fixture=(id:string)=>DRAWING_FIXTURES.find(f=>f.id===id)!;
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.freeze(v);for(const child of Object.values(v))freeze(child);}return v;}
test('all teaching fixtures validate; views use the same mm radii and axial lengths',()=>{
 for(const f of DRAWING_FIXTURES){
  assert.ok(validateGeometry(f.geometry).ok,f.id);
  const frame=drawingFrame(f.geometry);
  for(const s of f.geometry.spans){
   const a=projectMeridian(s.z0,s.outer0,frame),b=projectMeridian(s.z1,s.outer1,frame);
   assert.ok(Math.abs((b.x-a.x)/frame.scale-(s.z1-s.z0))<1e-8);
   assert.ok(Math.abs((frame.axis-a.y)/frame.scale-s.outer0)<1e-8);
   const p=projectVolume(s.z0,s.outer0,Math.PI/2,frame);
   assert.ok(Math.abs((210+s.z0*frame.scale*.12-p.y)/(frame.scale*.82)-s.outer0)<1e-8);
  }
  for(const d of drawingDimensions(f.geometry))assert.ok(dimensionValue(f.geometry,d));
  assert.ok(volumeFaces(f.geometry,frame,true).every(face=>!face.path.includes('NaN')));
 }
});
test('section hatch quadrilaterals stop at inner contour: no material over blind, through or stepped void',()=>{
 for(const id of ['blind','through','inner-step','inner-groove']){
  const g=fixture(id).geometry,frame=drawingFrame(g),strips=materialStrips(g,frame);
  assert.equal(strips.length,g.spans.length*2);
  g.spans.forEach((s,i)=>{
   for(const [j,sign] of [[0,1],[1,-1]]){
    const coords=[...strips[i*2+j].matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(m=>({x:Number(m[1]),y:Number(m[2])}));
    assert.equal(coords.length,4);
    assert.ok(Math.abs(coords[2].y-(frame.axis-sign*s.inner1*frame.scale))<.001);
    assert.ok(Math.abs(coords[3].y-(frame.axis-sign*s.inner0*frame.scale))<.001);
    if(Math.min(s.inner0,s.inner1)>0)assert.ok(coords.every(p=>Math.abs(frame.axis-p.y)>=Math.min(s.inner0,s.inner1)*frame.scale-.001));
   }
  });
 }
});
test('comparison detects swapped ramps, internal errors, extra holes and short/long result without mutating requirements',()=>{
 const original=freeze(structuredClone(fixture('inner-step').geometry)),actual=structuredClone(original);
 actual.spans=actual.spans.map((s,i)=>i?{...s,inner0:4,inner1:4}:s);
 assert.ok(compareDrawing(original,actual).some(d=>d.dimension.kind==='inner'));
 const copy=structuredClone(original);renderToString(createElement(InteractiveDrawing,{geometry:original,result:actual,title:'Сравнение'}));assert.deepEqual(original,copy);
 const ramp:TurningGeometry={length:20,spans:[{z0:0,z1:20,outer0:10,outer1:8,inner0:0,inner1:0}]};
 const reversed={length:20,spans:[{...ramp.spans[0],outer0:8,outer1:10}]};
 assert.ok(compareDrawing(ramp,reversed).some(d=>d.dimension.kind==='outer'));
 const hole={length:20,spans:[{...ramp.spans[0],inner0:2,inner1:2}]};assert.ok(compareDrawing(ramp,hole,{dimensions:[]}).some(d=>d.dimension.kind==='inner'));
 for(const length of [10,30]){
  const changed={length,spans:[{...ramp.spans[0],z1:length}]};
  const diff=compareDrawing(ramp,changed).find(d=>d.dimension.id==='total-length')!;
  assert.equal(diff.actual,`${length} мм`);
 }
});
test('operation-region mapping and author dimensions never change production geometry',()=>{
 const g=freeze(structuredClone(fixture('stepped').geometry));
 const r=operationDrawingRegion({kind:'outside-turn',z0:20,z1:40,diameter:16},60);
 assert.deepEqual(r,{z0:20,z1:40,surface:'outer'});
 assert.deepEqual(operationDrawingRegion({kind:'drill',diameter:8,depth:25},60),{z0:35,z1:60,surface:'inner'});
 assert.deepEqual(operationDrawingRegion({kind:'face',length:50},60),{z0:50,z1:60,surface:'length'});
 const dims=drawingDimensions(g,{dimensions:[{id:'custom',kind:'outer',surface:'outer',z0:20,z1:40,label:'Посадка'}]});assert.equal(dims.length,1);assert.equal(dimensionText(g,dims[0]),'Ø16 мм');
 const html=renderToString(createElement(InteractiveDrawing,{geometry:g,title:'Выбор',selection:r}));
 assert.match(html,/data-selected-region="20:40:outer"/);assert.doesNotMatch(html,/data-selected-region="0:20:outer"/);
 const volume=renderToString(createElement(GeometryPreview,{geometry:g,label:'Объём'}));assert.match(volume,/data-surface="outer"/);
});
test('legacy cylinder drawing and preview use migrated profile; block rendering stays available',()=>{
 for(const level of [exampleLevel(),millingLevel()]){
  const c=compileLevel(level);assert.ok(c.mode==='production');
  const html=renderToString(createElement(DrawingSheet,{title:level.name,blank:c.blank,ops:c.operations,requirements:Object.values(c.waits)[0].requirements}));
  assert.ok(!/NaN|undefined/.test(html));assert.match(html,c.blank.shape==='cylinder'?/interactive-drawing/:/Чертёж бруска/);
  const preview=renderToString(createElement(PartPreview,{label:'Заготовка',part:c.blank}));assert.match(preview,/Заготовка/);assert.ok(!preview.includes('NaN'));
 }
});
test('blind-hole bottoms and internal steps have annular volume faces, not a helical mesh',()=>{
 const g=fixture('blind').geometry,faces=volumeFaces(g,drawingFrame(g),true);
 assert.ok(faces.some(f=>f.surface==='end'&&f.z0===20&&f.z1===20));
 assert.ok(faces.some(f=>f.surface==='inner'));assert.ok(faces.some(f=>f.surface==='cut'));
 const thread=fixture('thread');assert.ok(volumeFaces(thread.geometry,drawingFrame(thread.geometry),true).length<200);
});

test('section contours leave bore mouths open and do not create seams inside continuous material',()=>{
 const g=fixture('blind').geometry,f=drawingFrame(g);
 const lines=sectionContours(g,f).map(path=>[...path.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(m=>({x:Number(m[1]),y:Number(m[2])})));
 const endX=projectMeridian(g.length,0,f).x;
 const endLines=lines.filter(line=>line.length===2&&line.every(p=>Math.abs(p.x-endX)<.001));
 assert.equal(endLines.length,2);
 assert.ok(endLines.every(line=>line.every(p=>Math.abs(p.y-f.axis)>=4*f.scale-.001)),'no line across open mouth');
 const bottomX=projectMeridian(20,0,f).x;
 const bottom=lines.filter(line=>line.length===2&&line.every(p=>Math.abs(p.x-bottomX)<.001));
 assert.ok(bottom.every(line=>line.every(p=>Math.abs(p.y-f.axis)<=4*f.scale+.001)),'no artificial seam through solid wall');
});

test('invalid editing selection does not repartition or visually corrupt requirements',()=>{
 const g=freeze(structuredClone(fixture('stepped').geometry));
 assert.deepEqual(clippedSpans(g,50,20),[]);
 const html=renderToString(createElement(InteractiveDrawing,{geometry:g,title:'Заказ',selection:{z0:50,z1:20,surface:'outer'}}));
 assert.match(html,/Некорректный интервал операции/);assert.doesNotMatch(html,/data-selected-region=/);
});
