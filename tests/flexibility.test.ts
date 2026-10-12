import {test} from 'node:test';
import assert from 'node:assert/strict';
import {welcomeLevel,twoOperationsLevel,exampleLevel} from '../src/level';
import {validateLevel} from '../src/validation';
import {compileLevel} from '../src/compiler';
import {FactoryCore} from '../src/core';
import {parseLevel,serializeLevel} from '../src/storage';
import {updateLevelFromFlow} from '../src/editorFlow';
import {connectionIssue,addLevelConnection} from '../src/connections';
test('welcome-only level validates, loads and finishes without production resources',()=>{
 const level=welcomeLevel();assert.deepEqual(validateLevel(level),[]);assert.deepEqual(parseLevel(serializeLevel(level)),level);
 const compiled=compileLevel(level);assert.equal(compiled.mode,'welcome');assert.equal('blank' in compiled,false);
 const core=new FactoryCore(compiled);assert.equal(core.state.intro,true);assert.equal(core.can('process'),false);core.tick(9999);assert.equal(core.state.completed,false);core.command('start');assert.equal(core.state.completed,true);assert.equal(core.state.count,0);
 core.command('start');assert.equal(core.log.filter(e=>e.type==='level-completed').length,1);core.reset();assert.equal(core.state.intro,true);
});
test('two operations run in order, cannot store intermediate part, retain both sections',()=>{
 const level=twoOperationsLevel();assert.deepEqual(validateLevel(level),[]);const core=new FactoryCore(compileLevel(level));core.command('start');core.click('blank');core.command('install');core.click('lathe');
 assert.equal(core.currentOperation.diameter,12);core.command('process');assert.equal(core.command('process'),false);core.tick(3000);
 assert.equal(core.state.stage,'loaded');assert.equal(core.state.operationIndex,1);assert.equal(core.state.part?.sections.length,1);core.click('blank');assert.equal(core.command('store'),false);assert.equal(core.click('warehouse'),true);assert.equal(core.state.count,0);
 core.click('lathe');assert.equal(core.currentOperation.diameter,8);core.command('process');core.tick(1999);assert.equal(core.state.stage,'processing');core.tick(1);assert.equal(core.state.stage,'finished');assert.equal(core.command('process'),false);
 assert.deepEqual(core.state.part?.sections,[{diameter:12,length:30},{diameter:8,length:15}]);core.click('blank');core.command('store');core.click('warehouse');assert.equal(core.state.completed,true);assert.equal(core.state.count,1);
 assert.equal(core.log.filter(e=>e.type==='processing-finished').length,2);
});
test('reset during the second operation removes intermediate state and starts with operation one',()=>{
 const core=new FactoryCore(compileLevel(twoOperationsLevel()));core.command('start');core.click('blank');core.command('install');core.click('lathe');core.command('process');core.tick(3000);core.command('process');core.tick(1000);core.reset();core.tick(9000);assert.equal(core.state.operationIndex,0);assert.equal(core.state.part,null);assert.equal(core.state.stage,'table');assert.equal(core.subscriptionCount,0);
});
test('operation chains reject excessive section length and cycles',()=>{
 const level=twoOperationsLevel();level.nodes.find(n=>n.id==='turning-2')!.params.length=40;assert.ok(validateLevel(level).some(e=>e.message.includes('Суммарная')));
 level.edges.push({id:'cycle',source:'turning-2',sourceHandle:'operation',target:'turning',targetHandle:'previous'});assert.ok(validateLevel(level).some(e=>e.message.includes('Циклы')));
});
test('node resizing persists separately from measurements and survives strict JSON import',()=>{
 const level=welcomeLevel();const resized=updateLevelFromFlow(level,[{type:'dimensions',id:'intro',dimensions:{width:420,height:280},resizing:false,setAttributes:true}]);assert.deepEqual(resized.nodes.find(n=>n.id==='intro')!.size,{width:420,height:280});assert.deepEqual(parseLevel(serializeLevel(resized)),resized);
 const invalid=structuredClone(resized);invalid.nodes[1].size!.width=-10;assert.throws(()=>parseLevel(serializeLevel(invalid)));
});
test('connection commands prevent duplicates, occupied inputs and incompatible types',()=>{
 const level=exampleLevel();const edge={source:'blank',sourceHandle:'blank',target:'lathe',targetHandle:'tool'};
 assert.match(connectionIssue(level,edge)!,/разные типы/);assert.equal(addLevelConnection(level,edge,'bad'),level);
 const duplicate=level.edges[0];assert.match(connectionIssue(level,duplicate)!,/уже существует/);
 const free=welcomeLevel();free.edges=[];const added=addLevelConnection(free,{source:'start',sourceHandle:'out',target:'intro',targetHandle:'in'},'new');assert.equal(added.edges.length,1);assert.equal(addLevelConnection(added,added.edges[0],'duplicate'),added);
});
