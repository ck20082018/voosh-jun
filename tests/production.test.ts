import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Production } from '../src/production';
test('full cycle, invalid and repeated clicks never duplicate a part', () => {
  const p = new Production();
  p.dispatch('machine'); p.dispatch('warehouse'); p.dispatch('process');
  assert.equal(p.state.stage, 'table');
  p.dispatch('select'); p.dispatch('select'); p.dispatch('warehouse');
  assert.equal(p.state.count, 0);
  p.dispatch('machine'); p.dispatch('machine'); p.dispatch('process');
  p.tick(1500);
  const mid = p.state;
  for (const a of ['select','machine','warehouse','process'] as const) p.dispatch(a);
  assert.deepEqual(p.state, mid);
  p.tick(1499); assert.equal(p.state.stage,'processing');
  p.tick(1); assert.equal(p.state.stage,'finished');
  p.dispatch('warehouse'); assert.equal(p.state.count,0);
  p.dispatch('select'); p.dispatch('select'); p.dispatch('warehouse');
  for(let i=0;i<10;i++) { p.dispatch('warehouse'); p.dispatch('process'); p.dispatch('select'); p.dispatch('machine'); }
  assert.deepEqual(p.state,{stage:'stored',selected:false,elapsed:3000,count:1});
});
test('reset during processing cancels completion and allows a new cycle', () => {
  const p = new Production();
  p.dispatch('select'); p.dispatch('machine'); p.dispatch('process'); p.tick(1200);
  p.dispatch('reset'); p.tick(10000);
  assert.deepEqual(p.state,{stage:'table',selected:false,elapsed:0,count:0});
  p.dispatch('select'); p.dispatch('machine'); p.dispatch('process'); p.tick(3000);
  p.dispatch('select'); p.dispatch('warehouse'); assert.equal(p.state.count,1);
  p.dispatch('reset'); assert.equal(p.state.count,0);
});
test('state snapshots cannot mutate production',()=>{const p=new Production();const s=p.state as {count:number};s.count=100;assert.equal(p.state.count,0);});
