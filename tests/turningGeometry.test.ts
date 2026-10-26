import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyTurningGeometry as cut, migrateLegacyProfile, validateGeometry, sameGeometry, turningSurfaceData, type GeometryResult, type TurningGeometry} from '../src/turningGeometry';
import {applyTurningRoute, applyTurningOperation, applyOperation, expectedResult, matches, geometryOf, type Part} from '../src/manufacturing';
import {exampleLevel, twoOperationsLevel, millingLevel, intermediateLevel} from '../src/level';
import {compileLevel} from '../src/compiler';
const value=<T>(r:GeometryResult<T>):T=>{assert.ok(r.ok,JSON.stringify(r));return r.value;};
const stock=()=>value(migrateLegacyProfile(20,60,[]));
const setup={chuckSide:'z0' as const,gripLength:10};
const turn=(diameter:number,z0=20,z1=50)=>({kind:'outside-turn' as const,diameter,z0,z1});
const part=():Part=>({shape:'cylinder',diameter:20,length:60,blankId:'original',material:'Сталь',sections:[],operationIds:[]});
test('repeated radial passes change only the interval; equivalent routes compare by surfaces',()=>{
 const original=stock(),copy=structuredClone(original);
 const first=value(cut(original,setup,turn(18))),second=value(cut(first,setup,turn(16)));
 assert.deepEqual(original,copy);
 assert.deepEqual(second.spans.map(s=>[s.z0,s.z1,s.outer0]),[[0,20,10],[20,50,8],[50,60,10]]);
 assert.ok(sameGeometry(second,value(cut(original,setup,turn(16)))));
 assert.ok(sameGeometry(second,value(cut(value(cut(original,setup,turn(16,20,35))),setup,turn(16,35,50)))));
 assert.ok(sameGeometry(second,value(cut(second,setup,turn(16)))));
});
test('face removes free end and clips linear inner/outer spans without moving origin',()=>{
 const g:TurningGeometry={length:60,spans:[{z0:0,z1:60,outer0:10,outer1:7,inner0:0,inner1:3}]};
 const result=value(cut(g,setup,{kind:'face',length:40}));
 assert.equal(result.length,40);assert.equal(result.spans[0].outer1,8);assert.equal(result.spans[0].inner1,2);
 assert.equal(g.length,60);
});
test('invalid operations are atomic and report stable codes',()=>{
 const g=stock(),copy=structuredClone(g);
 for(const [op,code] of [[turn(22),'adds-material'],[turn(-1),'invalid-size'],[turn(10,-1),'invalid-size'],[turn(10,5),'chuck-collision'],[turn(10,30,70),'outside-stock'],[{kind:'face',length:61},'adds-material'],[{kind:'face',length:10},'chuck-collision'],[{kind:'face',length:NaN},'invalid-size'],[{kind:'thread',surface:'outer',z0:20,z1:30,pitch:1,depth:.5},'unsupported-operation']] as const){
  const r=cut(g,setup,op);assert.ok(!r.ok);assert.equal(r.error.code,code);assert.ok(r.error.message.length>5);assert.deepEqual(g,copy);
 }
 assert.equal(cut(g,{chuckSide:'z0',gripLength:0},turn(10)).ok,false);
});
test('blind/through bores, steps, radius vs diameter and breakthrough constraints',()=>{
 const g:TurningGeometry={length:60,spans:[{z0:0,z1:30,outer0:10,outer1:10,inner0:0,inner1:0},{z0:30,z1:60,outer0:10,outer1:10,inner0:3,inner1:3}]};
 assert.ok(validateGeometry(g).ok);
 const r=value(cut(g,setup,turn(18,30,60)));
 assert.equal(r.spans[1].outer0,9); // 1 mm radius removal = 2 mm diameter removal
 const through={length:60,spans:[{z0:0,z1:60,outer0:10,outer1:10,inner0:4,inner1:4}]};
 assert.ok(validateGeometry(through).ok);assert.equal(2*through.spans[0].inner0-2*g.spans[1].inner0,2);
 const bad=cut(g,setup,turn(4,30,60));assert.ok(!bad.ok);assert.equal(bad.error.code,'wall-breakthrough');
 assert.equal(validateGeometry({...g,spans:[{...g.spans[0],inner0:11}]}).ok,false);
 assert.equal(validateGeometry({...g,spans:[{...g.spans[0],z0:1}]}).ok,false);
 const surfaces=value(turningSurfaceData(g));assert.deepEqual(surfaces.inner.map(p=>[p.z,p.radius]),[[0,0],[30,0],[30,3],[60,3]]);
});
test('part identity, material, preview immutability, facing comparison and legacy migration',()=>{
 const p=part(),before=structuredClone(p);
 const q=value(applyTurningOperation(p,setup,turn(16),'pass1'));
 const r=value(applyTurningOperation(q,setup,{kind:'face',length:45},'face1'));
 assert.equal(r.blankId,p.blankId);assert.equal(r.material,p.material);assert.deepEqual(p,before);
 assert.ok(matches(r,{...part(),id:'target',name:'target',length:45,sections:[{diameter:16,length:25}]}));
 assert.equal(applyTurningOperation(r,setup,turn(22),'bad').ok,false);
 assert.throws(()=>applyOperation({shape:'cylinder',diameter:20,length:60,id:'original',name:'x',material:'Сталь'},r,{kind:'turning',id:'legacy',diameter:10,length:5,seconds:1}));
 const old=value(migrateLegacyProfile(20,60,[{diameter:12,length:30},{diameter:8,length:15}]));
 assert.deepEqual(old.spans.map(s=>[s.z0,s.z1,s.outer0]),[[0,15,10],[15,45,6],[45,60,4]]);
 assert.equal(migrateLegacyProfile(20,10,[{diameter:10,length:11}]).ok,false);
});
test('old compiled examples migrate without changing milling or routes',()=>{
 for(const l of [exampleLevel(),twoOperationsLevel(),millingLevel(),intermediateLevel()]){
  const c=compileLevel(l);assert.equal(c.mode,'production');if(c.mode!=='production')continue;
  const result=expectedResult(c.blank,c.operations);
  if(result.shape==='cylinder')assert.ok(geometryOf(result).ok);
  else {assert.equal(result.height,15);assert.equal(result.geometry,undefined);}
 }
});

test('whole route is atomic, equivalent linear partitions and internal profiles compare correctly',()=>{
 const p=part(),copy=structuredClone(p);
 const route=[{id:'one',operation:turn(18)},{id:'two',operation:turn(22)}];
 assert.equal(applyTurningRoute(p,setup,route).ok,false);assert.deepEqual(p,copy);
 const a:TurningGeometry={length:60,spans:[{z0:0,z1:60,outer0:10,outer1:7,inner0:1,inner1:4}]};
 const b:TurningGeometry={length:60,spans:[{z0:0,z1:30,outer0:10,outer1:8.5,inner0:1,inner1:2.5},{z0:30,z1:60,outer0:8.5,outer1:7,inner0:2.5,inner1:4}]};
 assert.ok(sameGeometry(a,b));
 const changed=structuredClone(b);changed.spans[1].inner1=5;assert.equal(sameGeometry(a,changed),false);
 const preview=value(applyTurningRoute(p,setup,[{id:'rough',operation:turn(18)},{id:'finish',operation:turn(16)}]));
 const manufactured=value(applyTurningOperation(value(applyTurningOperation(p,setup,turn(18),'rough')),setup,turn(16),'finish'));
 assert.deepEqual(preview,manufactured);assert.deepEqual(p,copy);
});
