import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlanningCore, checkPlayerPlan, type PlayerPlan, type Assessment } from '../src/planning';
import { toyAxleLevel } from '../src/playerLevel';
import { validateLevel } from '../src/validation';
import { exampleLevel, makeNode, type Level } from '../src/level';
import { compileLevel } from '../src/compiler';
import { FactoryCore } from '../src/core';
import { groupNodes, moveGroup, setGroupMember, ungroup } from '../src/groups';
import { reconcileEditorNodes, updateLevelFromFlow } from '../src/editorFlow';
import { parseLevel, serializeLevel, loadLevel, saveDraft, V3_STORAGE_KEY, STORAGE_KEY } from '../src/storage';
const plan = (): PlayerPlan => ({ blankId: 'steel-stock', machineId: 'lathe-choice', pointId: 'machine-point', operations: [{ id: 'player-a', kind: 'turning', diameter: 12, length: 20, toolId: 'passing-choice' }, { id: 'player-b', kind: 'turning', diameter: 8, length: 20, toolId: 'passing-choice' }] });
function start(p = plan(), level = toyAxleLevel()) { const c = new PlanningCore(level); assert.equal(c.setPlan(p), true); assert.deepEqual(c.preview.errors, []); assert.equal(c.startManufacturing(), true); return c; }
function install(c: PlanningCore) { const r = c.runtime!; assert.equal(r.command('start'), true); assert.equal(r.click(r.resources.blank.id), true); assert.equal(r.command('install'), true); assert.equal(r.click(r.currentMachine.id), true); return r; }
function finish(c: PlanningCore) { const r = install(c); for (const op of r.currentMachine.operations) {
    assert.equal(r.command('process'), true);
    r.tick(op.seconds * 1000);
} assert.equal(r.click(r.resources.blank.id), true); assert.equal(r.command('store'), true); assert.equal(r.click(r.currentWarehouse.id), true); return r; }
test('toy axle is a grouped valid independent author level with meaningful catalog alternatives', () => { const l = toyAxleLevel(); assert.deepEqual(validateLevel(l), []); assert.equal(l.groups.length, 3); assert.equal(l.nodes.filter(n => n.type === 'blank').length, 3); assert.equal(l.placements.length, 2); assert.throws(() => compileLevel(l), /PlanningCore/); assert.deepEqual(parseLevel(serializeLevel(l)), l); });
test('preview and repeated checks apply production rules without real items, inventory, events or author mutations', () => { const l = toyAxleLevel(), before = serializeLevel(l), c = new PlanningCore(l); c.setPlan(plan()); const draft = c.plan; for (let i = 0; i < 4; i++) {
    assert.deepEqual(c.preview.errors, []);
    assert.equal(c.preview.part?.sections.length, 2);
    assert.equal(c.runtime, null);
    assert.equal(c.assessment, null);
} assert.deepEqual(c.plan, draft); assert.equal(serializeLevel(l), before); const preview = c.preview; preview.part!.sections[0].diameter = 100; assert.equal(c.preview.part?.sections[0].diameter, 12); assert.equal(c.startManufacturing(), true); assert.deepEqual(c.runtime!.state.item?.sections, []); assert.equal(c.runtime!.state.count, 0); assert.equal(c.runtime!.log.some(e => e.type === 'processing-finished'), false); });
test('technical guards reject too small stock, wrong machine/tools and excessive/invalid parameters', () => { for (const patch of [{ blankId: 'steel-small' }, { machineId: 'mill-choice' }])
    assert.ok(checkPlayerPlan(toyAxleLevel(), { ...plan(), ...patch }).errors.length); for (const toolId of ['facing-choice', 'face-choice', null]) {
    const p = plan();
    p.operations[0].toolId = toolId;
    assert.ok(checkPlayerPlan(toyAxleLevel(), p).errors.length);
} for (const value of [0, -1, 21, NaN, Infinity]) {
    const p = plan();
    p.operations[0] = { ...p.operations[0], kind: 'turning', diameter: value, length: 20 };
    assert.ok(checkPlayerPlan(toyAxleLevel(), p).errors.length);
} const p = plan(); p.operations[0] = { id: 'long', kind: 'turning', length: 50, diameter: 12, toolId: 'passing-choice' }; assert.ok(checkPlayerPlan(toyAxleLevel(), p).errors.length); const c = new PlanningCore(toyAxleLevel()); assert.equal(c.startManufacturing(), false); assert.equal(c.chooseBlank('unknown'), false); assert.equal(c.placeMachine('table-point'), false); assert.equal(c.placeMachine('off-map'), false); assert.equal(c.runtime, null); });
test('author durations are frozen, ordered per-operation tools are retained, and plan commands cannot edit manufacturing', () => { const p = plan(); Object.assign(p.operations[0], { seconds: 99 }); const c = start(p); assert.equal(c.runtime!.currentOperation.seconds, 2); const r = install(c), before = c.fixedPlan; assert.equal(c.chooseBlank('aluminium-stock'), false); assert.equal(c.chooseMachine('mill-choice'), false); assert.equal(c.placeMachine('machine-alternative'), false); assert.equal(c.addOperation('turning'), false); assert.equal(c.setPlan(plan()), false); assert.equal(c.startManufacturing(), false); assert.equal(r.command('process'), true); const state = r.state; assert.equal(r.command('process'), false); assert.equal(r.command('store'), false); assert.equal(r.click(r.currentWarehouse.id), false); assert.equal(c.retry(), false); assert.deepEqual(r.state, state); r.tick(2000); assert.equal(r.log.find(e => e.type === 'processing-started')?.toolId, 'passing-choice'); assert.deepEqual(c.fixedPlan, before); const copy = c.fixedPlan!; copy.operations = []; assert.equal(c.fixedPlan!.operations.length, 2); });
test('correct two-operation and three-operation plans manufacture identical geometry and complete once', () => { for (const three of [false, true]) {
    const p = plan();
    if (three)
        p.operations = [{ id: 'split-a', kind: 'turning', diameter: 12, length: 10, toolId: 'passing-choice' }, { id: 'split-b', kind: 'turning', diameter: 12, length: 10, toolId: 'passing-choice' }, p.operations[1]];
    const c = start(p);
    const r = finish(c);
    assert.equal(c.assessment?.success, true);
    assert.equal(r.state.completed, true);
    assert.equal(r.state.count, 1);
    const before = r.state;
    for (let i = 0; i < 3; i++) {
        assert.equal(r.command('store'), false);
        assert.equal(r.click(r.currentWarehouse.id), false);
        r.tick(99999);
    }
    assert.deepEqual(r.state, before);
    assert.equal(r.log.filter(e => e.type === 'level-completed').length, 1);
    assert.equal(r.log.filter(e => e.type === 'part-stored').length, 1);
    assert.equal(r.log.filter(e => e.type === 'processing-finished').length, three ? 3 : 2);
} });
test('valid wrong-result plans run, expose actual differences, and retry from fresh original stock retaining the draft', () => { for (const wrongMaterial of [false, true]) {
    const p = plan();
    if (wrongMaterial)
        p.blankId = 'aluminium-stock';
    else
        p.operations[0] = { id: 'wrong-section', kind: 'turning', diameter: 14, length: 20, toolId: 'passing-choice' };
    const c = start(p), r = finish(c);
    assert.equal(r.state.completed, false);
    assert.equal(c.assessment?.success, false);
    assert.ok(c.assessment!.differences.length);
    if (wrongMaterial)
        assert.ok(c.assessment!.differences.some(d => d.characteristic === 'Материал'));
    const old = r.state.item!.blankId;
    assert.equal(c.retry(), true);
    assert.equal(c.retry(), false);
    assert.deepEqual(c.plan, p);
    assert.equal(r.state.disposed, true);
    assert.equal(c.assessment, null);
    assert.equal(c.runtime, null);
    assert.equal(c.setPlan(plan()), true);
    assert.equal(c.startManufacturing(), true);
    assert.notEqual(c.runtime!.state.item!.blankId, old);
    assert.deepEqual(c.runtime!.state.item!.sections, []);
    assert.equal(c.runtime!.state.count, 0);
    assert.equal(c.runtime!.log.some(e => e.type === 'part-stored'), false);
    const fresh = c.runtime!.state;
    r.tick(999999);
    assert.deepEqual(c.runtime!.state, fresh);
    finish(c);
    assert.equal((c.assessment as Assessment | null)?.success, true);
} });
test('full reset during every operation cancels the runtime and clears the plan without stale completion', () => { for (const index of [0, 1]) {
    const c = start(), r = install(c);
    if (index) {
        r.command('process');
        r.tick(2000);
    }
    r.command('process');
    r.tick(500);
    c.reset();
    assert.equal(c.runtime, null);
    assert.deepEqual(c.plan.operations, []);
    assert.equal(c.plan.blankId, null);
    assert.equal(r.state.disposed, true);
    const state = r.state;
    r.tick(99999);
    assert.deepEqual(r.state, state);
    assert.equal(c.setPlan(plan()), true);
    assert.equal(c.startManufacturing(), true);
    assert.equal(c.runtime!.state.count, 0);
    assert.deepEqual(c.runtime!.state.item!.sections, []);
} });
test('a plan preserves different tools per operation on a milling level and uses actual processed height', () => { const l = toyAxleLevel(); l.nodes.find(n => n.id === 'steel-stock')!.params.shape = 'block'; Object.assign(l.nodes.find(n => n.id === 'requirements')!.params, { shape: 'block', sections: [], height: 12 }); const second = makeNode('tool', 'end-choice'); Object.assign(second.params, { name: 'Концевая фреза', category: 'milling', kind: 'end' }); l.nodes.push(second); (l.nodes.find(n => n.type === 'catalog')!.params.toolIds as string[]).push(second.id); const p: PlayerPlan = { ...plan(), machineId: 'mill-choice', operations: [{ id: 'm1', kind: 'milling', depth: 5, toolId: 'face-choice' }, { id: 'm2', kind: 'milling', depth: 3, toolId: 'end-choice' }] }; const c = start(p, l), r = finish(c); assert.equal(c.assessment?.success, true); assert.deepEqual(r.log.filter(e => e.type === 'processing-started').map(e => e.toolId), ['face-choice', 'end-choice']); });
test('catalog validation rejects missing/duplicate/out-of-kind references, bad durations and ready process constraints', () => { for (const key of ['blankIds', 'machineIds', 'toolIds']) {
    const l = toyAxleLevel();
    l.nodes.find(n => n.type === 'catalog')!.params[key] = ['missing'];
    assert.ok(validateLevel(l).length);
} for (const change of [(l: Level) => { l.nodes.find(n => n.type === 'catalog')!.params.allowedOperations = [{ kind: 'turning', seconds: 0 }]; }, (l: Level) => { l.nodes.push(makeNode('process', 'preset')); }, (l: Level) => { l.grid.points = l.grid.points.filter(p => !p.id.startsWith('machine')); }]) {
    const l = toyAxleLevel();
    change(l);
    assert.ok(validateLevel(l).length);
} });
test('group membership and ungroup preserve world node coordinates and all graph links; groups never compile', () => { const original = exampleLevel(); const grouped = groupNodes(original, ['start', 'intro'], 'group-a', 'Вступление'); assert.deepEqual(grouped.nodes.map(n => n.position), original.nodes.map(n => n.position)); assert.deepEqual(compileLevel(grouped), compileLevel(original)); const duplicate = groupNodes(grouped, ['start', 'task'], 'group-b'); assert.equal(duplicate, grouped); const added = setGroupMember(grouped, 'task', 'group-a'); assert.equal(added.nodes.find(n => n.id === 'task')!.groupId, 'group-a'); const removed = setGroupMember(added, 'start', null); assert.equal(removed.nodes.find(n => n.id === 'start')!.groupId, undefined); const plain = ungroup(removed, 'group-a'); assert.deepEqual(plain.nodes, original.nodes); assert.deepEqual(plain.edges, original.edges); });
test('group drag moves nodes once; child drag converts relative coordinates and frame resize preserves world coordinates', () => {
    const l = groupNodes(exampleLevel(), ['start', 'intro'], 'g'), g = l.groups[0];
    const shifted = moveGroup(l, 'g', { x: g.position.x + 100, y: g.position.y + 40 });
    assert.equal(shifted.nodes[0].position.x, l.nodes[0].position.x + 100);
    const flow = reconcileEditorNodes(l, null, []);
    assert.equal(flow[0].type, 'frame');
    const startNode = flow.find(n => n.id === 'start')!;
    assert.equal(startNode.parentId, 'g');
    assert.equal(startNode.position.x + g.position.x, l.nodes[0].position.x);
    const moved = updateLevelFromFlow(l, [{ type: 'position', id: 'g', position: { x: g.position.x + 100, y: g.position.y + 40 } }, { type: 'position', id: 'start', position: startNode.position }]);
    assert.deepEqual(moved.nodes.map(n => n.position), shifted.nodes.map(n => n.position));
    const dragged = updateLevelFromFlow(moved, [{ type: 'position', id: 'start', position: { x: startNode.position.x + 15, y: startNode.position.y + 20 } }]);
    assert.equal(dragged.nodes[0].position.x, moved.nodes[0].position.x + 15);
    const resized = updateLevelFromFlow(dragged, [{ type: 'position', id: 'g', position: { x: 0, y: 0 } }, { type: 'dimensions', id: 'g', dimensions: { width: 800, height: 700 }, resizing: true }]);
    assert.deepEqual(resized.nodes.map(n => n.position), dragged.nodes.map(n => n.position));
    assert.deepEqual(resized.groups[0].size, { width: 800, height: 700 });
    const deleted = updateLevelFromFlow(resized, [{ type: 'remove', id: 'g' }]);
    assert.equal(deleted.groups.length, 0);
    assert.deepEqual(deleted.nodes.map(n => n.position), resized.nodes.map(n => n.position));
    assert.ok(deleted.nodes.every(n => !n.groupId));
    assert.deepEqual(deleted.edges, l.edges);
});
test('group round trip persists absolute coordinates, names/colors/sizes and rejects dangling membership or nested frames', () => { const l = groupNodes(exampleLevel(), ['start', 'intro'], 'g', 'Тест', '#123456'); assert.deepEqual(parseLevel(serializeLevel(l)), l); for (const mutate of [(bad: Level) => { bad.nodes[0].groupId = 'missing'; }, (bad: Level) => { bad.groups.push({ ...bad.groups[0] }); }, (bad: Level) => { bad.groups[0].size.width = 199; }]) {
    const bad = structuredClone(l);
    mutate(bad);
    assert.throws(() => parseLevel(serializeLevel(bad), { allowIncomplete: true }));
} const nested = structuredClone(l); (nested.groups[0] as unknown as Record<string, unknown>).groupId = 'g'; assert.throws(() => parseLevel(serializeLevel(nested))); });
test('v3 migration preserves map, geometry, hints and intermediate graph behavior and archives old storage', () => { const raw = readFileSync(new URL('./fixtures/v3-intermediate.json', import.meta.url), 'utf8'), old = JSON.parse(raw), l = parseLevel(raw); assert.equal(l.version, 4); assert.equal(l.productionMode, 'ready'); assert.deepEqual(l.groups, []); assert.deepEqual(l.nodes, old.nodes); assert.deepEqual(l.grid, old.grid); assert.deepEqual(l.edges, old.edges); assert.deepEqual(l.placements, old.placements); assert.deepEqual(validateLevel(l), []); assert.equal(new FactoryCore(compileLevel(l)).isWelcome, false); const data = new Map([[V3_STORAGE_KEY, raw]]); const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } }; saveDraft(storage, loadLevel(storage)!); assert.equal(data.get(V3_STORAGE_KEY), raw); assert.ok(data.has(STORAGE_KEY)); });
test('selection edits preserve operations; only chosen instances are placed and catalog data never changes', () => { const l = toyAxleLevel(), before = serializeLevel(l), c = new PlanningCore(l); c.setPlan(plan()); assert.equal(c.chooseMachine('mill-choice'), true); assert.deepEqual(c.plan.operations, plan().operations); assert.ok(c.preview.errors.length); assert.equal(c.chooseMachine('lathe-choice'), true); assert.equal(c.placeMachine('machine-alternative'), true); assert.equal(c.chooseBlank('aluminium-stock'), true); assert.equal(c.chooseBlank('steel-stock'), true); assert.equal(c.setPlan({ ...c.plan, operations: [...c.plan.operations, { id: 'foreign-tool', kind: 'turning', diameter: 8, length: 1, toolId: 'not-in-catalog' }] }), false); assert.equal(c.startManufacturing(), true); const scene = c.runtimeLevel!; assert.equal(scene.nodes.filter(n => n.type === 'blank').length, 1); assert.equal(scene.nodes.filter(n => n.type === 'lathe').length, 1); assert.equal(scene.placements.length, 3); assert.equal(scene.nodes.some(n => ['steel-small', 'steel-stock', 'aluminium-stock', 'mill-choice', 'lathe-choice'].includes(n.id)), false); assert.equal(serializeLevel(l), before); assert.equal(scene.placements.find(p => p.nodeId === c.runtime!.currentMachine.id)!.pointId, 'machine-alternative'); });
test('duration and operation IDs are not result constraints and runtime IDs cannot collide with author nodes', () => { const l = toyAxleLevel(); l.nodes.find(n => n.type === 'catalog')!.params.allowedOperations = [{ kind: 'turning', seconds: 0.1 }]; const finishNode = l.nodes.find(n => n.type === 'finish')!; const old = finishNode.id; finishNode.id = 'attempt-1-blank'; l.edges = l.edges.map(e => e.target === old ? { ...e, target: finishNode.id } : e); const p = plan(); p.operations = p.operations.map((o, i) => ({ ...o, id: `route-of-child-${i}` })); const c = start(p, l); assert.notEqual(c.runtime!.resources.blank.id, 'attempt-1-blank'); finish(c); assert.equal(c.assessment?.success, true); assert.equal(c.runtime!.state.completed, true); });
