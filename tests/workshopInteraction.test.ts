import test from 'node:test';
import assert from 'node:assert/strict';
import {FactoryCore} from '../src/core';
import {compileLevel} from '../src/compiler';
import {exampleLevel, intermediateLevel, millingLevel} from '../src/level';
import {beginPartDrag, finishPartDrag, cancelPartDrag} from '../src/workshopInteraction';
import {workshopPoint} from '../src/presentation/workshopGeometry';

function confirm(core: FactoryCore) {while (core.state.activeHint) assert.ok(core.command('continue-hint'));}
function move(core: FactoryCore, target: string) {
  const drag = beginPartDrag(core);
  assert.ok(drag);
  assert.ok(core.targetIds.includes(target));
  assert.ok(finishPartDrag(core, drag, target));
  confirm(core);
}

test('drag gestures run the same complete turning and milling commands as button transfers', () => {
  for (const level of [exampleLevel(), millingLevel()]) {
    const core = new FactoryCore(compileLevel(level));
    assert.equal(beginPartDrag(core), null, 'intro blocks gestures');
    assert.ok(core.command('start'));
    move(core, 'lathe');
    assert.deepEqual(core.state.location, {kind: 'machine', id: 'lathe'});
    assert.ok(core.command('process'));
    assert.equal(beginPartDrag(core), null, 'processing cannot move the part');
    core.tick(3000);
    move(core, 'warehouse');
    assert.equal(core.state.completed, true);
    assert.equal(core.state.count, 1);
    assert.equal(beginPartDrag(core), null, 'the final store cannot be emptied');
    assert.equal(core.log.filter(e => e.type === 'blank-installed').length, 1);
    assert.equal(core.log.filter(e => e.type === 'part-stored').length, 1);
  }
});

test('intermediate storage drag preserves the same item, dimensions and history into the next machine', () => {
  const core = new FactoryCore(compileLevel(intermediateLevel()));
  core.command('start');
  move(core, 'lathe');
  core.command('process'); core.tick(3000); confirm(core);
  move(core, 'warehouse');
  const item = core.state.item;
  const invalid = beginPartDrag(core)!;
  assert.equal(finishPartDrag(core, invalid, 'lathe'), false, 'used machine is not a valid destination');
  assert.equal(core.state.warehouses.warehouse.count, 1);
  assert.deepEqual(core.state.item, item);
  move(core, 'lathe-2');
  assert.deepEqual(core.state.item, item);
  assert.equal(core.state.warehouses.warehouse.count, 0);
  assert.equal(core.log.filter(e => e.type === 'item-retrieved').length, 1);
  core.command('process'); core.tick(3000); confirm(core);
  move(core, 'final-store');
  assert.equal(core.state.completed, true);
});

test('outside drops and explicit cancellation preserve the source and clear target selection', () => {
  const core = new FactoryCore(compileLevel(exampleLevel()));
  core.command('start');
  const before = core.state.item;
  for (const target of [null, 'warehouse', 'missing']) {
    const drag = beginPartDrag(core)!;
    assert.equal(finishPartDrag(core, drag, target), false);
    assert.deepEqual(core.state.location, {kind: 'table', id: 'blank'});
    assert.deepEqual(core.state.item, before);
    assert.equal(core.state.target, null);
  }
  const drag = beginPartDrag(core)!;
  cancelPartDrag(core, drag);
  assert.equal(core.state.target, null);
  assert.equal(core.state.count, 0);
  assert.equal(core.log.filter(e => e.type === 'blank-installed').length, 0);
});

test('reset, disposed core and repeated drops do not commit stale gestures', () => {
  const core = new FactoryCore(compileLevel(exampleLevel()));
  core.command('start');
  const stale = beginPartDrag(core)!;
  core.reset();
  assert.equal(finishPartDrag(core, stale, 'lathe'), false);
  assert.equal(core.state.stage, 'table');
  core.command('start');
  const drag = beginPartDrag(core)!;
  assert.ok(finishPartDrag(core, drag, 'lathe'));
  assert.equal(finishPartDrag(core, drag, 'lathe'), false);
  assert.equal(core.log.filter(e => e.type === 'blank-installed').length, 1);
  core.dispose();
  assert.equal(beginPartDrag(core), null);
});

test('pointer projection accounts for both the responsive canvas scale and its page offset', () => {
  assert.deepEqual(workshopPoint({x: 355, y: 265}, {left: 100, top: 100, width: 510, height: 330}), {x: 510, y: 330});
});
