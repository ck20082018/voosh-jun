import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exampleLevel, intermediateLevel, welcomeLevel, makeNode, connect, placeObject, locatedPlacements, type Level } from '../src/level';
import { FactoryCore } from '../src/core';
import { compileLevel } from '../src/compiler';
import { validateLevel } from '../src/validation';
import { setMapSize, setPointCount, togglePoint, movePoint } from '../src/map';
import { parseLevel, serializeLevel, loadLevel, saveDraft, STORAGE_KEY, V2_STORAGE_KEY } from '../src/storage';
function engine(l: Level) { assert.deepEqual(validateLevel(l), []); return new FactoryCore(compileLevel(l)); }
function hintId(c: FactoryCore) { return c.state.activeHint?.id; }
function confirm(c: FactoryCore) { let guard = 0; while (c.state.activeHint) {
    assert.ok(++guard < 30);
    assert.equal(c.command('continue-hint'), true);
} }
function install(c: FactoryCore) { c.command('start'); c.click('blank'); c.command('install'); assert.equal(c.click('lathe'), true); }
function firstStage(c: FactoryCore) { install(c); confirm(c); assert.equal(c.command('process'), true); c.tick(3000); confirm(c); c.click('blank'); assert.equal(c.command('store'), true); assert.equal(c.click('warehouse'), true); }
function addEventHint(l: Level, id: string, action: string, patch: Record<string, string | boolean> = {}) { const after = makeNode('after', id + '-event'), hint = makeNode('hint', id); Object.assign(after.params, { action }); Object.assign(hint.params, patch); l.nodes.push(after, hint); connect(l, after.id, 'event', hint.id, 'event'); return hint; }
test('two machines transfer the same physical item, preserve geometry/history and finish at the final store', () => {
    const c = engine(intermediateLevel());
    assert.equal(c.itemIdForOutput('wait'), null);
    assert.equal(c.click('lathe-2'), false);
    firstStage(c);
    const p = c.state.item!;
    assert.equal(c.state.activeNodeId, 'wait-2');
    assert.equal(c.state.location?.id, 'warehouse');
    assert.equal(c.itemIdForOutput('wait'), 'blank');
    assert.equal(c.itemIdForOutput('warehouse'), 'blank');
    assert.equal(c.itemIdForOutput('wait-2'), null);
    assert.deepEqual(p.sections, [{ diameter: 12, length: 30 }]);
    assert.equal(c.command('take'), true);
    assert.equal(c.click('lathe'), false);
    assert.equal(c.click('unknown'), false);
    assert.equal(c.state.warehouses.warehouse.count, 1);
    assert.equal(c.command('cancel'), true);
    assert.equal(c.state.warehouses.warehouse.itemId, 'blank');
    assert.equal(c.command('take'), true);
    assert.equal(c.click('lathe-2'), true);
    assert.deepEqual(c.state.item, p);
    assert.equal(c.state.location?.id, 'lathe-2');
    assert.equal(c.state.warehouses.warehouse.count, 0);
    assert.equal(c.state.machines.lathe.itemId, null);
    assert.equal(c.state.machines['lathe-2'].itemId, 'blank');
    assert.equal(c.itemIdForOutput('warehouse'), null);
    assert.equal(c.itemIdForOutput('wait'), 'blank');
    assert.equal(c.command('process'), true);
    assert.equal(c.command('process'), false);
    assert.equal(c.click('warehouse'), false);
    c.tick(2000);
    assert.deepEqual(c.state.item!.sections, [{ diameter: 12, length: 30 }, { diameter: 8, length: 15 }]);
    assert.deepEqual(c.state.item!.operationIds, ['process-1', 'second-section']);
    assert.equal(c.state.machines.lathe.operationIndex, 0);
    c.click('blank');
    c.command('store');
    assert.equal(c.click('final-store'), true);
    assert.equal(c.state.completed, true);
    assert.equal(c.state.warehouses['final-store'].count, 1);
    assert.equal(c.state.warehouses.warehouse.count, 0);
    assert.equal(c.itemIdForOutput('wait-2'), 'blank');
    assert.equal(c.command('take'), false);
    const state = c.state;
    for (let i = 0; i < 5; i++) {
        c.click('final-store');
        c.command('store');
        c.command('take');
        c.tick(9999);
    }
    assert.deepEqual(c.state, state);
    assert.equal(c.log.filter(e => e.type === 'item-retrieved').length, 1);
});
test('actual wait output is explicitly compatible with the next blank input and two references never duplicate inventory', () => {
    const l = intermediateLevel();
    const edge = l.edges.find(e => e.target === 'lathe-2' && e.targetHandle === 'blank')!;
    edge.source = 'wait';
    edge.sourceHandle = 'detail';
    const c = engine(l);
    assert.equal(c.itemFromOutput('wait'), null);
    firstStage(c);
    assert.equal(c.itemFromOutput('wait')!.blankId, c.itemFromOutput('warehouse')!.blankId);
    c.command('take');
    assert.equal(c.click('lathe-2'), true);
    assert.equal(c.state.warehouses.warehouse.count, 0);
    assert.equal(Object.values(c.state.machines).filter(m => m.itemId === 'blank').length, 1);
    c.command('process');
    c.tick(2000);
    c.click('blank');
    c.command('store');
    c.click('final-store');
    assert.equal(c.state.completed, true);
});
test('second stage compatibility uses accumulated sections and actual remaining dimensions, not result requirements', () => {
    const l = intermediateLevel();
    (l.nodes.find(n => n.id === 'process-2')!.params.operations as {
        length: number;
    }[])[0].length = 40;
    assert.throws(() => compileLevel(l), /оставшуюся/);
    const bad = intermediateLevel();
    bad.nodes.find(n => n.id === 'lathe-2')!.params.kind = 'mill';
    assert.throws(() => compileLevel(bad), /Фрезерный/);
    const order = intermediateLevel();
    order.edges.find(e => e.source === 'task' && e.sourceHandle === 'out')!.target = 'wait-2';
    assert.ok(validateLevel(order).some(e => e.message.includes('предшествовать')));
    const c = engine(intermediateLevel());
    install(c);
    confirm(c);
    c.command('process');
    c.tick(1000);
    c.reset();
    c.tick(99999);
    assert.equal(c.state.location?.kind, 'table');
    assert.deepEqual(c.state.item!.sections, []);
    assert.equal(c.state.warehouses.warehouse.count, 0);
    assert.equal(c.itemIdForOutput('wait'), null);
    firstStage(c);
    c.command('take');
    c.click('lathe-2');
    c.command('process');
    c.tick(500);
    c.reset();
    c.tick(99999);
    assert.equal(c.state.location?.kind, 'table');
    assert.deepEqual(c.state.item!.operationIds, []);
});
test('action hints only follow successful events, respect the selected object, and do not advance execution', () => {
    const c = engine(intermediateLevel());
    c.command('process');
    c.click('lathe');
    assert.equal(c.state.activeHint, null);
    install(c);
    assert.equal(hintId(c), 'installed-hint');
    assert.equal(c.state.activeNodeId, 'wait');
    assert.equal(c.command('process'), false);
    assert.equal(c.click('warehouse'), false);
    confirm(c);
    c.click('lathe');
    assert.equal(c.state.activeHint, null);
    c.command('process');
    c.command('process');
    c.tick(2999);
    assert.equal(c.state.activeHint, null);
    c.tick(1);
    assert.equal(hintId(c), 'processed-hint');
    assert.equal(c.state.activeNodeId, 'wait');
    confirm(c);
    c.tick(9999);
    assert.equal(c.state.activeHint, null);
    assert.equal(c.log.filter(e => e.type === 'hint-shown').length, 2);
});
test('hint queue confirms in order; reset/dispose clear it and once/each differ across operations', () => {
    const l = exampleLevel();
    l.nodes.find(n => n.id === 'process')!.params.operations = [{ id: 'one', kind: 'turning', diameter: 12, length: 20, seconds: 1 }, { id: 'two', kind: 'turning', diameter: 8, length: 10, seconds: 1 }];
    l.nodes.find(n => n.id === 'part')!.params.sections = [{ diameter: 12, length: 20 }, { diameter: 8, length: 10 }];
    addEventHint(l, 'once', 'processing-finished', { display: 'modal', frequency: 'once' });
    addEventHint(l, 'each', 'processing-finished', { display: 'modal', frequency: 'each' });
    const c = engine(l);
    install(c);
    c.command('process');
    c.tick(1000);
    assert.equal(hintId(c), 'once');
    assert.equal(c.state.hintQueue[0].id, 'each');
    assert.equal(c.command('continue-hint'), true);
    assert.equal(hintId(c), 'each');
    assert.equal(c.state.activeNodeId, 'wait');
    confirm(c);
    c.command('process');
    c.tick(1000);
    assert.equal(hintId(c), 'each');
    assert.equal(c.state.hintQueue.length, 0);
    c.reset();
    assert.equal(c.state.activeHint, null);
    assert.deepEqual(c.state.hintQueue, []);
    install(c);
    c.command('process');
    c.tick(1000);
    assert.equal(hintId(c), 'once');
    c.dispose();
    assert.equal(c.state.activeHint, null);
    assert.equal(c.subscriptionCount, 0);
    c.tick(99999);
    assert.equal(c.command('continue-hint'), false);
});
test('sequential hints can confirm or continue immediately while event hints never share execution', () => {
    const l = welcomeLevel();
    const h = makeNode('hint', 'help');
    h.params.confirm = false;
    l.nodes.push(h);
    l.edges = l.edges.filter(e => e.source !== 'intro');
    connect(l, 'intro', 'out', 'help', 'in');
    connect(l, 'help', 'out', 'finish', 'in');
    const c = engine(l);
    c.command('start');
    assert.equal(c.state.completed, true);
    assert.equal(c.state.panelHints[0].id, 'help');
    h.params.confirm = true;
    const d = engine(l);
    d.command('start');
    assert.equal(d.state.completed, false);
    assert.equal(d.state.activeHint?.id, 'help');
    d.command('continue-hint');
    assert.equal(d.state.completed, true);
    const event = makeNode('after', 'event');
    event.params.action = 'configuration-checked';
    l.nodes.push(event);
    connect(l, 'event', 'event', 'help', 'event');
    assert.ok(validateLevel(l).some(e => e.message.includes('обоим')));
});
test('storage/retrieval/check hints are successful-only; frequency applies per attempt', () => {
    const l = intermediateLevel();
    addEventHint(l, 'stored', 'part-stored', { confirm: false, frequency: 'each' });
    addEventHint(l, 'taken', 'item-retrieved', { confirm: false, frequency: 'each' });
    const c = engine(l);
    firstStage(c);
    assert.equal(c.state.panelHints.filter(h => h.id === 'stored').length, 1);
    c.command('take');
    c.command('cancel');
    assert.equal(c.state.panelHints.filter(h => h.id === 'taken').length, 0);
    c.command('take');
    c.click('lathe-2');
    assert.equal(c.state.panelHints.filter(h => h.id === 'taken').length, 1);
    c.click('lathe-2');
    assert.equal(c.state.panelHints.filter(h => h.id === 'taken').length, 1);
});
test('points permit placement, block occupied deletion/shrink and move with stable IDs', () => {
    const l = exampleLevel();
    assert.equal(placeObject(l, 'blank', 3, 3), null);
    assert.equal(togglePoint(l, 0, 2).level, l);
    assert.match(togglePoint(l, 0, 2).error!, /занята/);
    assert.equal(setPointCount(l, 2).level, l);
    assert.equal(setMapSize(l, 2, 2).level, l);
    const small = setPointCount(l, 3);
    assert.equal(small.error, undefined);
    assert.equal(small.level.grid.points.length, 3);
    const bigger = setPointCount(small.level, 5).level;
    assert.deepEqual(bigger.grid.points.slice(3).map(p => [p.x, p.y]), [[0, 0], [1, 0]]);
    const free = bigger.grid.points[3];
    const moved = movePoint(bigger, free.id, 3, 3);
    assert.equal(moved.error, undefined);
    assert.equal(moved.level.grid.points.find(p => p.id === free.id)!.x, 3);
    assert.equal(placeObject(moved.level, 'blank', 3, 3)?.placements.find(p => p.nodeId === 'blank')?.pointId, free.id);
    assert.ok(setPointCount(l, 26).error);
});
test('v2 map migration retains images, node geometry, placements and old storage; v3 round trip is exact', () => {
    const old = JSON.parse(readFileSync(new URL('./fixtures/v2-production.json', import.meta.url), 'utf8'));
    old.nodes.find((n: {
        id: string;
    }) => n.id === 'intro').size = { width: 420, height: 280 };
    const raw = JSON.stringify(old);
    const l = parseLevel(raw);
    assert.equal(l.version, 3);
    assert.equal(l.nodes.filter(n => n.type === 'map').length, 1);
    assert.deepEqual(locatedPlacements(l).map(p => ({ nodeId: p.nodeId, x: p.x, y: p.y })), old.placements);
    assert.deepEqual(l.nodes.find(n => n.id === 'intro')!.size, { width: 420, height: 280 });
    assert.equal(l.nodes.find(n => n.type === 'warehouse')!.params.mode, 'final');
    assert.deepEqual(parseLevel(serializeLevel(l)), l);
    const data = new Map([[V2_STORAGE_KEY, raw]]);
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const loaded = loadLevel(storage)!;
    saveDraft(storage, loaded);
    assert.equal(data.get(V2_STORAGE_KEY), raw);
    assert.ok(data.has(STORAGE_KEY));
    assert.deepEqual(parseLevel(serializeLevel(intermediateLevel())), intermediateLevel());
});
test('wait detail can feed an independent result check; only successful checks trigger event hints', () => {
    for (const correct of [true, false]) {
        const l = intermediateLevel();
        const check = makeNode('check', 'result-check'), requirements = makeNode('part', 'check-requirements'), bad = makeNode('finish', 'bad-result');
        check.params.checkResult = true;
        if (!correct)
            requirements.params.sections = [{ diameter: 11, length: 30 }];
        l.nodes.push(check, requirements, bad);
        l.edges = l.edges.filter(e => !(e.source === 'wait' && e.sourceHandle === 'out'));
        connect(l, 'wait', 'out', 'result-check', 'in');
        connect(l, 'wait', 'detail', 'result-check', 'detail');
        connect(l, 'part', 'part', 'result-check', 'requirements');
        if (!correct) {
            l.edges.find(e => e.target === 'result-check' && e.targetHandle === 'requirements')!.source = 'check-requirements';
        }
        connect(l, 'lathe', 'machine', 'check-requirements', 'machine');
        connect(l, 'result-check', 'correct', 'wait-2', 'in');
        connect(l, 'result-check', 'incorrect', 'bad-result', 'in');
        addEventHint(l, 'checked-hint', 'configuration-checked', { confirm: false });
        const c = engine(l);
        firstStage(c);
        assert.equal(c.log.find(e => e.type === 'configuration-checked')!.result, correct);
        assert.equal(c.state.panelHints.filter(h => h.id === 'checked-hint').length, correct ? 1 : 0);
        assert.equal(c.state.completed, !correct);
        if (correct)
            assert.equal(c.state.activeNodeId, 'wait-2');
    }
});
test('a compiled consumer waits safely if its actual wait output has not become available', () => {
    const l = intermediateLevel();
    const compiled = compileLevel(l);
    assert.equal(compiled.mode, 'production');
    if (compiled.mode !== 'production')
        return;
    compiled.scenario.push({ id: 'pending-check', type: 'check', params: { success: 'yes', error: 'no' } });
    compiled.checks['pending-check'] = { actual: {}, expected: {}, detailSource: { kind: 'wait', id: 'wait' }, resultRequirements: compiled.waits.wait.requirements };
    compiled.entry = 'pending-check';
    const c = new FactoryCore(compiled);
    assert.equal(c.state.activeNodeId, 'pending-check');
    assert.equal(c.log.some(e => e.type === 'configuration-checked'), false);
    assert.equal(c.itemFromOutput('wait'), null);
    assert.equal(c.state.completed, false);
    c.dispose();
    assert.equal(c.subscriptionCount, 0);
});
test('event-free references do not make final warehouses valid blank sources and ambiguous technical cycles fail', () => {
    const l = intermediateLevel();
    l.nodes.find(n => n.id === 'warehouse')!.params.mode = 'final';
    assert.throws(() => compileLevel(l), /порт|склад/);
    const cyclic = intermediateLevel();
    const first = cyclic.edges.find(e => e.target === 'lathe' && e.targetHandle === 'blank')!;
    first.source = 'warehouse';
    first.sourceHandle = 'blank';
    assert.ok(validateLevel(cyclic).some(e => e.message.includes('Циклы')));
});
test('a non-confirming modal continues its scenario immediately and leaves its message in the panel', () => {
    const l = welcomeLevel();
    const h = makeNode('hint', 'help');
    Object.assign(h.params, { confirm: false, display: 'modal' });
    l.nodes.push(h);
    l.edges = l.edges.filter(e => e.source !== 'intro');
    connect(l, 'intro', 'out', 'help', 'in');
    connect(l, 'help', 'out', 'finish', 'in');
    const c = engine(l);
    c.command('start');
    assert.equal(c.state.completed, true);
    assert.equal(hintId(c), 'help');
    assert.equal(c.state.panelHints[0].id, 'help');
    assert.equal(c.command('continue-hint'), true);
    assert.equal(c.state.activeHint, null);
    assert.equal(c.log.filter(e => e.type === 'level-completed').length, 1);
});
test('reset during successful retrieval cannot emit the old install event into the new attempt', () => {
    const c = engine(intermediateLevel());
    firstStage(c);
    c.subscribe(e => { if (e.type === 'item-retrieved')
        c.reset(); });
    c.command('take');
    c.click('lathe-2');
    assert.equal(c.state.location?.kind, 'table');
    assert.equal(c.log.some(e => e.type === 'blank-installed'), false);
    assert.equal(c.state.activeHint, null);
});
test('sequential milling keeps the actual incoming height and rejects removal beyond that height', () => {
    const l = intermediateLevel();
    Object.assign(l.nodes.find(n => n.id === 'blank')!.params, { shape: 'block', width: 40, height: 20 });
    Object.assign(l.nodes.find(n => n.id === 'tool')!.params, { category: 'milling', kind: 'face' });
    for (const id of ['lathe', 'lathe-2'])
        l.nodes.find(n => n.id === id)!.params.kind = 'mill';
    l.nodes.find(n => n.id === 'process')!.params.operations = [{ id: 'mill-one', kind: 'milling', depth: 5, seconds: 3 }];
    l.nodes.find(n => n.id === 'process-2')!.params.operations = [{ id: 'mill-two', kind: 'milling', depth: 4, seconds: 2 }];
    Object.assign(l.nodes.find(n => n.id === 'part')!.params, { shape: 'block', width: 40, height: 15, sections: [] });
    Object.assign(l.nodes.find(n => n.id === 'part-2')!.params, { shape: 'block', width: 40, height: 11, sections: [] });
    const c = engine(l);
    firstStage(c);
    const first = c.state.item!;
    assert.equal(first.shape, 'block');
    if (first.shape === 'block')
        assert.equal(first.height, 15);
    c.command('take');
    assert.deepEqual(c.targetIds, ['lathe-2']);
    c.click('lathe-2');
    assert.deepEqual(c.state.item, first);
    c.command('process');
    c.tick(2000);
    const second = c.state.item!;
    if (second.shape === 'block')
        assert.equal(second.height, 11);
    assert.deepEqual(second.operationIds, ['mill-one', 'mill-two']);
    c.click('blank');
    c.command('store');
    c.click('final-store');
    assert.equal(c.state.completed, true);
    l.nodes.find(n => n.id === 'process-2')!.params.operations = [{ id: 'too-deep', kind: 'milling', depth: 16, seconds: 2 }];
    assert.throws(() => compileLevel(l), /фактическую высоту/);
});
test('unknown object IDs, including inherited dictionary names, cannot change the item state', () => {
    const c = engine(exampleLevel());
    c.command('start');
    for (const id of ['unknown', 'constructor', 'toString', '__proto__']) {
        const s = c.state;
        assert.equal(c.click(id), false);
        assert.deepEqual(c.state, s);
    }
    c.click('blank');
    c.command('install');
    for (const id of ['constructor', 'toString', '__proto__'])
        assert.equal(c.click(id), false);
    assert.equal(c.state.location?.kind, 'table');
});
test('v2 conditional configuration migrates with its image and keeps the original check behavior', () => {
    const base = JSON.parse(readFileSync(new URL('./fixtures/v2-production.json', import.meta.url), 'utf8'));
    const check = { id: 'legacy-check', type: 'check', position: { x: 900, y: -300 }, params: { checkMachine: true, expectedMachine: 'lathe', checkTool: false, expectedTool: 'passing', checkBlank: false, expectedMaterial: 'Сталь', expectedShape: 'cylinder', expectedDiameter: 20, expectedLength: 60, expectedWidth: 40, expectedHeight: 20, checkProcess: false, expectedOperations: [{ id: 'expected-op', kind: 'turning', diameter: 12, length: 30, seconds: 3 }], success: 'Подходит', error: 'Не подходит' } };
    base.nodes.push(check, { id: 'wrong', type: 'finish', position: { x: 1200, y: -300 }, params: { text: 'Неверная конфигурация' } });
    base.edges = base.edges.filter((e: {
        source: string;
    }) => e.source !== 'intro');
    base.edges.push({ id: 'intro-check', source: 'intro', sourceHandle: 'out', target: 'legacy-check', targetHandle: 'in' }, { id: 'check-task', source: 'legacy-check', sourceHandle: 'correct', target: 'task', targetHandle: 'in' }, { id: 'check-wrong', source: 'legacy-check', sourceHandle: 'incorrect', target: 'wrong', targetHandle: 'in' }, { id: 'machine-check', source: 'lathe', sourceHandle: 'machine', target: 'legacy-check', targetHandle: 'machine' });
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    base.nodes.find((n: {
        id: string;
    }) => n.id === 'intro').params.image = png;
    const l = parseLevel(JSON.stringify(base));
    assert.equal(l.nodes.find(n => n.id === 'intro')!.params.image, png);
    assert.equal(l.nodes.find(n => n.id === 'legacy-check')!.params.checkResult, false);
    const c = engine(l);
    c.command('start');
    assert.equal(c.state.activeNodeId, 'wait');
    assert.equal(c.log.find(e => e.type === 'configuration-checked')!.result, true);
});

test('a second sequential machine cannot reread the original blank definition after that item has moved',()=>{
 const l=intermediateLevel();const edge=l.edges.find(e=>e.target==='lathe-2'&&e.targetHandle==='blank')!;edge.source='blank';edge.sourceHandle='blank';assert.ok(validateLevel(l).some(e=>e.message.includes('а не исходную заготовку заново')));
});
