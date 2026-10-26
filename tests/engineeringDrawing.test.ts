import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DRAWING_FIXTURES} from '../src/drawingFixtures';
import {INK,makeSheet,intersects,hatchPolygon,selectionOnSheet,textBox,type Primitive,type SheetSettings} from '../src/drawing/sheet';
import {sheetPDF,svgDocument} from '../src/drawing/export';
import {latheMeshes} from '../src/drawing/mesh';
import {exampleLevel} from '../src/level';
import {serializeLevel,parseLevel} from '../src/storage';
import {compileLevel} from '../src/compiler';
const fixture=(id:string)=>DRAWING_FIXTURES.find(f=>f.id===id)!;
const bytes=async()=>{const b=await readFile(new URL('../src/drawing/Onest-Regular.ttf',import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;};
test('sheet layouts: physical A4/A3, actual dimension values independent of scale, no overlapping dimension text on fixtures',()=>{
 for(const f of DRAWING_FIXTURES){const before=structuredClone(f.geometry),s=makeSheet(f.geometry,{title:f.title},f.display.sheet??{views:['end']});assert.deepEqual(s.warnings,[],f.id);
  const labels=s.items.filter((p):p is Extract<Primitive,{kind:'text'}>=>p.kind==='text'&&!!p.dimension);for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)assert.ok(!intersects(labels[i].box,labels[j].box),`${f.id} dimensions ${i}/${j}`);
  const small=makeSheet(f.geometry,{title:f.title},{scale:.5}),large=makeSheet(f.geometry,{title:f.title},{format:'A3',scale:2});assert.equal(s.width,210);assert.equal(large.width,420);assert.equal(s.height,297);
  const values=(a:typeof s)=>a.items.filter((p):p is Extract<Primitive,{kind:'text'}>=>p.kind==='text'&&!!p.dimension).map(p=>p.text);assert.deepEqual(values(small),values(large));assert.deepEqual(f.geometry,before);
 }
 assert.equal(INK.outline.width,.7);assert.ok(INK.thin.width>=INK.outline.width/3&&INK.thin.width<=INK.outline.width/2);
});
test('hatching is clipped to material only; view from free right end lies left of the main in projection',()=>{
 const g=fixture('through').geometry,s=makeSheet(g,{title:'Втулка'},{views:['end']});const {x,y,scale}=s.main;
 const end=s.items.filter(p=>p.kind==='circle');assert.ok(end.length>=2);assert.ok(end.every(p=>p.x<x));assert.ok(end.every(p=>p.y===y));
 for(const p of s.items)if(p.kind==='path'&&p.role==='hatch')for(const [px,py] of p.points){assert.ok(px>=x-1e-7&&px<=x+g.length*scale+1e-7);assert.ok(Math.abs(py-y)>=g.spans[0].inner0*scale-1e-7);}
 const occluded=makeSheet({length:60,spans:[{z0:0,z1:20,outer0:8,outer1:8,inner0:0,inner1:0},{z0:20,z1:40,outer0:10,outer1:10,inner0:0,inner1:0},{z0:40,z1:60,outer0:5,outer1:5,inner0:0,inner1:0}]},{title:'Ось'},{views:['end']});assert.deepEqual(occluded.items.filter(p=>p.kind==='circle').map(p=>p.r),[5,10]);
 const h=hatchPolygon([[0,0],[10,0],[10,10],[0,10]]);assert.ok(h.length);assert.ok(h.flat().every(([x,y])=>x>=0&&x<=10&&y>=0&&y<=10));
});
test('author offsets persist with v4 level, survive compilation and never change geometry; corrupt imports fail',()=>{
 const level=exampleLevel();level.drawing={sheet:{format:'A3',scale:1,dimensionOffsets:{'total-length':{x:5,y:-1}}}};
 const parsed=parseLevel(serializeLevel(level));assert.deepEqual(parsed.drawing,level.drawing);assert.deepEqual(compileLevel(parsed).drawing,level.drawing);
 const g=fixture('cylinder').geometry,base=makeSheet(g,{title:'Ось'}),moved=makeSheet(g,{title:'Ось'},level.drawing.sheet);
 const label=(s:typeof base)=>s.items.find((p):p is Extract<Primitive,{kind:'text'}>=>p.kind==='text'&&p.dimension?.id==='total-length')!;
 assert.equal(label(moved).kind,'text');if(label(base).kind==='text'&&label(moved).kind==='text')assert.equal(label(moved).x-label(base).x,5);
 const collision=makeSheet(g,{title:'Ось'},{dimensionOffsets:{'total-length':{x:0,y:-30}}});assert.ok(collision.warnings.length);assert.equal(label(collision).y,label(base).y);
 for(const sheet of [{scale:3},{scale:'2'},{format:['A4']},{format:'A0'},{dimensionOffsets:{bad:{x:null,y:0}}}])assert.throws(()=>parseLevel(JSON.stringify({...level,drawing:{sheet}})),/чертежа/);
});
test('order, actual, teaching overlay and exported clean SVG use independent data',()=>{
 const g=structuredClone(fixture('stepped').geometry),snapshot=structuredClone(g),s=makeSheet(g,{title:'Деталь'}),overlay=selectionOnSheet(g,{z0:20,z1:40,surface:'outer'},s),before=JSON.stringify(s);
 assert.ok(overlay.length);const svg=svgDocument(s,'TESTFONT');assert.ok(svg.includes('width="210mm"'));assert.ok(svg.includes('font/ttf;base64,TESTFONT'));assert.ok(!svg.includes('selection'));assert.ok(svg.includes('Ø20'));
 const actual=structuredClone(g);actual.spans=actual.spans.map(p=>({...p,outer0:p.outer0-1,outer1:p.outer1-1}));const actualSheet=makeSheet(actual,{title:'Факт'});assert.notDeepEqual(actualSheet.items,s.items);assert.equal(JSON.stringify(s),before);assert.deepEqual(g,snapshot);
});
test('vector PDF has exact physical page dimensions, Unicode font and no image XObjects',async()=>{
 const {PDFDocument,PDFName}=await import('pdf-lib');const font=await bytes();
 for(const settings of [{},{format:'A3',scale:2}] as SheetSettings[]){const s=makeSheet(fixture('through').geometry,{title:'Втулка',material:'Сталь'},settings),pdf=await sheetPDF(s,font),doc=await PDFDocument.load(pdf),page=doc.getPage(0);assert.equal(doc.getPageCount(),1);assert.ok(Math.abs(page.getWidth()*25.4/72-s.width)<1e-5);assert.ok(Math.abs(page.getHeight()*25.4/72-s.height)<1e-5);
  const resources=page.node.Resources()!;assert.ok(resources.has(PDFName.of('Font')));assert.ok(!resources.has(PDFName.of('XObject'))||resources.lookup(PDFName.of('XObject'))?.toString()==='<<\n>>');
 }
});
test('revolved mesh preserves millimetres, radial smooth normals, sharp edges and consistently outward triangles',()=>{
 for(const f of DRAWING_FIXTURES){const before=structuredClone(f.geometry);for(const cut of [false,true])for(const m of latheMeshes(f.geometry,cut)){
  assert.ok(m.indices.length);for(let i=0;i<m.positions.length;i+=3){assert.ok(Math.abs(Math.hypot(...m.normals.slice(i,i+3))-1)<1e-6);assert.ok(m.positions[i]>=-f.geometry.length/2-1e-7&&m.positions[i]<=f.geometry.length/2+1e-7);if(cut)assert.ok(m.positions[i+2]<=1e-6);}
  for(let i=0;i<m.indices.length;i+=3){const [a,b,c]=m.indices.slice(i,i+3).map(n=>n*3),p=m.positions,n=m.normals,ax=p[b]-p[a],ay=p[b+1]-p[a+1],az=p[b+2]-p[a+2],bx=p[c]-p[a],by=p[c+1]-p[a+1],bz=p[c+2]-p[a+2];assert.ok((ay*bz-az*by)*n[a]+(az*bx-ax*bz)*n[a+1]+(ax*by-ay*bx)*n[a+2]>0);}
  if(m.surface==='end')assert.ok(m.normals.every((v,i)=>i%3===0?Math.abs(v)===1:v===0));
  if(m.surface==='cut')assert.ok(m.normals.every((v,i)=>i%3===2?v===1:v===0));
 }assert.deepEqual(f.geometry,before);}
 const cylinder=latheMeshes(fixture('cylinder').geometry).find(m=>m.surface==='outer')!;assert.ok(cylinder.positions.length/3>=386);assert.ok(cylinder.normals[0]===0);assert.equal(cylinder.normals[1],1);
});
test('blind bottom and steps close only exposed material; through hole has no axial center caps; selection splits only the chosen interval',()=>{
 const through=fixture('through').geometry;for(const m of latheMeshes(through).filter(m=>m.surface==='end'))for(let i=0;i<m.positions.length;i+=3)assert.ok(Math.hypot(m.positions[i+1],m.positions[i+2])>=3-1e-6);
 const blind=latheMeshes(fixture('blind').geometry);assert.ok(blind.some(m=>m.surface==='end'&&m.z0===20));
 const selected=latheMeshes(fixture('cylinder').geometry,false,{z0:20,z1:30,surface:'outer'});assert.ok(selected.some(m=>m.selected));for(const m of selected.filter(m=>m.selected))assert.ok(m.z0===20&&m.z1===30&&m.surface==='outer');
 const surfaces=latheMeshes(fixture('stepped').geometry).filter(m=>m.surface==='end');assert.equal(surfaces.length,4);
});
