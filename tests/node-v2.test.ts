import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exampleLevel,locatedPlacements, millingLevel, twoOperationsLevel, checkLevel, welcomeLevel, operations, connect, makeNode, type Level } from '../src/level';
import { validateLevel } from '../src/validation';
import { compileLevel } from '../src/compiler';
import { FactoryCore } from '../src/core';
import { near, matches } from '../src/manufacturing';
import { parseLevel, parseLevelWithImages, serializeLevel, loadLevel, saveDraft, STORAGE_KEY, LEGACY_STORAGE_KEY } from '../src/storage';
import { decodeImage, uploadImage, validateImageData, MAX_IMAGE_BYTES, MAX_JSON_BYTES } from '../src/images';
function core(level: Level) { assert.deepEqual(validateLevel(level), []); return new FactoryCore(compileLevel(level)); }
function run(c: FactoryCore) { while (c.state.intro)
    c.command('start'); assert.equal(c.click(c.resources.blank.id), true); assert.equal(c.command('install'), true); assert.equal(c.click(c.resources.machine.id), true); for (let i = 0; i < c.resources.operations.length; i++) {
    assert.equal(c.command('process'), true);
    c.tick(c.currentOperation.seconds * 1000);
} assert.equal(c.state.stage, 'finished'); assert.equal(c.click(c.resources.blank.id), true); assert.equal(c.command('store'), true); assert.equal(c.click(c.resources.warehouse.id), true); }
test('both production examples manufacture real geometry, complete once and emit structured events', () => {
    for (const l of [exampleLevel(), millingLevel(), twoOperationsLevel()]) {
        const c = core(l);
        run(c);
        assert.equal(c.state.completed, true);
        assert.equal(c.state.count, 1);
        const p = c.state.part!;
        if (l.id === 'first-plane') {
            assert.equal(p.shape, 'block');
            if (p.shape === 'block') {
                assert.equal(p.height, 15);
                assert.equal(p.width, 40);
                assert.equal(p.length, 60);
            }
        }
        else
            assert.equal(p.sections.length, l.id === 'two-operations' ? 2 : 1);
        assert.equal(c.log.filter(e => e.type === 'processing-finished').length, c.resources.operations.length);
        const stored = c.log.find(e => e.type === 'part-stored')!;
        assert.equal(stored.warehouseId, 'warehouse');
        assert.deepEqual(stored.part, p);
        const state = c.state;
        for (let i = 0; i < 5; i++) {
            c.command('store');
            c.command('process');
            c.click('warehouse');
            c.tick(99999);
        }
        assert.deepEqual(c.state, state);
    }
});
test('result requirements stay independent: wrong material, form, dimensions or any section block completion', () => {
    const changes = [{ material: 'Алюминий' }, { shape: 'block', sections: [] }, { diameter: 19 }, { length: 59 }, { sections: [{ diameter: 11, length: 30 }] }];
    for (const patch of changes) {
        const l = exampleLevel();
        Object.assign(l.nodes.find(n => n.type === 'part')!.params, patch);
        const c = core(l);
        run(c);
        assert.equal(c.state.count, 1);
        assert.equal(c.state.completed, false);
        assert.equal(c.state.activeNodeId, 'wait');
    }
    const l = twoOperationsLevel();
    const part = l.nodes.find(n => n.type === 'part')!;
    part.params.sections = [{ diameter: 13, length: 30 }, { diameter: 8, length: 15 }];
    const c = core(l);
    run(c);
    assert.equal(c.state.completed, false);
    const m = millingLevel();
    m.nodes.find(n => n.type === 'part')!.params.height = 14;
    const mc = core(m);
    run(mc);
    assert.equal(mc.state.completed, false);
});
test('changing a valid process changes the actual part without changing its independent requirements', () => {
    const l = millingLevel();
    Object.assign(operations(l.nodes.find(n => n.type === 'process')!)[0], { depth: 4 });
    const c = core(l);
    run(c);
    assert.equal(c.state.part?.shape, 'block');
    if (c.state.part?.shape === 'block')
        assert.equal(c.state.part.height, 16);
    assert.equal(c.resources.waits.wait.requirements.shape, 'block');
    assert.equal(c.state.completed, false);
    const tolerance = structuredClone(c.resources.waits.wait.requirements);
    if (tolerance.shape === 'block')
        tolerance.height = 16 + 0.0000001;
    assert.equal(matches(c.state.part, tolerance), true);
    assert.equal(near(1, 1.01), false);
});
test('configuration check selects correct and incorrect paths once, and requirements are independent', () => {
    const l = checkLevel();
    const c = core(l);
    c.command('start');
    assert.equal(c.state.activeNodeId, 'wait');
    assert.equal(c.log.find(e => e.type === 'configuration-checked')!.result, true);
    run(c);
    assert.equal(c.state.completed, true);
    const wrong = checkLevel();
    wrong.nodes.find(n => n.type === 'check')!.params.expectedMaterial = 'Алюминий';
    const w = core(wrong);
    w.command('start');
    assert.equal(w.state.activeNodeId, 'explanation');
    assert.equal(w.state.playing, false);
    assert.equal(w.command('process'), false);
    w.command('start');
    assert.equal(w.state.completed, true);
    assert.equal(w.state.count, 0);
    w.command('start');
    assert.equal(w.log.filter(e => e.type === 'configuration-checked').length, 1);
    const differentOps = checkLevel();
    operations(differentOps.nodes.find(n => n.type === 'check')!, 'expectedOperations')[0].seconds = 2;
    const d = core(differentOps);
    d.command('start');
    assert.equal(d.state.activeNodeId, 'explanation');
});
test('check input requirements follow flags, and physically impossible configurations are validation errors', () => {
    const l = checkLevel();
    l.edges = l.edges.filter(e => !(e.target === 'check' && e.targetHandle === 'tool'));
    assert.ok(validateLevel(l).some(e => e.nodeId === 'check' && e.message.includes('Инструмент')));
    l.nodes.find(n => n.type === 'check')!.params.checkTool = false;
    assert.deepEqual(validateLevel(l), []);
    for (const patch of [{ shape: 'block' }, { diameter: 10 }]) {
        const bad = exampleLevel();
        Object.assign(bad.nodes.find(n => n.type === 'blank')!.params, patch);
        assert.throws(() => compileLevel(bad));
    }
    for (const kind of ['facing', 'cutoff', 'end']) {
        const bad = exampleLevel();
        bad.nodes.find(n => n.type === 'tool')!.params.kind = kind;
        assert.throws(() => compileLevel(bad));
    }
    const bad = millingLevel();
    Object.assign(operations(bad.nodes.find(n => n.type === 'process')!)[0], { depth: 20 });
    assert.throws(() => compileLevel(bad));
    const mix = exampleLevel();
    mix.nodes.find(n => n.type === 'process')!.params.operations = [{ id: 'bad', kind: 'milling', depth: 1, seconds: 1 }];
    assert.throws(() => compileLevel(mix));
});
test('cycles, parallel output, dangling references and duplicate single data input fail; branch reconvergence works', () => {
    const l = checkLevel();
    connect(l, 'check', 'correct', 'explanation', 'in');
    assert.ok(validateLevel(l).some(e => e.message.includes('Параллельные')));
    const cycle = checkLevel();
    connect(cycle, 'explanation', 'out', 'check', 'in');
    assert.ok(validateLevel(cycle).some(e => e.message.includes('Циклы')));
    const duplicate = exampleLevel();
    connect(duplicate, 'blank', 'blank', 'lathe', 'blank');
    assert.ok(validateLevel(duplicate).some(e => e.message.includes('несколько связей')));
    const dangling = exampleLevel();
    dangling.edges[0].target = 'missing';
    assert.throws(() => compileLevel(dangling));
    const text = welcomeLevel();
    const check = makeNode('check', 'check');
    text.nodes.push(check);
    text.edges = text.edges.filter(e => e.source !== 'intro');
    connect(text, 'intro', 'out', 'check', 'in');
    connect(text, 'check', 'correct', 'finish', 'in');
    connect(text, 'check', 'incorrect', 'finish', 'in');
    const c = core(text);
    c.command('start');
    assert.equal(c.state.completed, true);
});
test('multiple text introductions and editor geometry have no effect on production or outcome', () => {
    const l = welcomeLevel();
    const intro = makeNode('intro', 'second');
    intro.params.title = '';
    intro.params.text = 'Второе вступление';
    l.nodes.push(intro);
    l.edges = l.edges.filter(e => e.source !== 'intro');
    connect(l, 'intro', 'out', 'second', 'in');
    connect(l, 'second', 'out', 'finish', 'in');
    const c = core(l);
    c.command('start');
    assert.equal(c.state.activeNodeId, 'second');
    c.command('start');
    assert.equal(c.state.completed, true);
    const prod = exampleLevel();
    prod.nodes.forEach(n => { n.position = { x: -1000, y: 9999 }; n.size = { width: 890, height: 890 }; });
    const p = core(prod);
    run(p);
    assert.equal(p.state.completed, true);
    assert.equal('size' in p.resources.blank, false);
});
test('reset during milling and each turning operation cancels previous work and prevents duplicate results', () => {
    for (const l of [millingLevel(), twoOperationsLevel()]) {
        const c = core(l);
        c.command('start');
        c.click('blank');
        c.command('install');
        c.click('lathe');
        if (l.id === 'two-operations') {
            c.command('process');
            c.tick(3000);
        }
        c.command('process');
        c.tick(500);
        const part = c.state.part;
        for (let i = 0; i < 3; i++) {
            assert.equal(c.command('process'), false);
            assert.equal(c.command('store'), false);
            assert.equal(c.click('blank'), false);
        }
        assert.deepEqual(c.state.part, part);
        c.reset();
        c.tick(100000);
        assert.equal(c.state.stage, 'table');
        assert.equal(c.state.part, null);
        assert.equal(c.state.count, 0);
        assert.equal(c.state.operationIndex, 0);
        run(c);
        assert.equal(c.state.count, 1);
        c.dispose();
        const state = c.state;
        c.tick(100000);
        assert.deepEqual(c.state, state);
    }
});
test('supported v1 levels migrate with text, placements, node sizes and ordered operations', () => {
    for (const name of ['turning', 'two-operations', 'welcome']) {
        const old = JSON.parse(readFileSync(new URL(`./fixtures/v1-${name}.json`, import.meta.url), 'utf8'));
        const l = parseLevel(JSON.stringify(old));
        assert.equal(l.version, 4);
        assert.deepEqual(locatedPlacements(l).map(p=>({nodeId:p.nodeId,x:p.x,y:p.y})), old.placements);
        assert.equal(l.nodes.find(n => n.type === 'intro')!.params.text, old.nodes.find((n: {
            type: string;
        }) => n.type === 'intro').params.text);
        assert.deepEqual(l.nodes.find(n => n.type === 'intro')!.size, { width: 420, height: 280 });
        assert.equal(l.nodes.find(n => n.type === 'task') && l.edges.some(e => e.target === 'task' && e.targetHandle !== 'in'), name === 'welcome' ? undefined : false);
        const c = core(l);
        if (name === 'welcome') {
            c.command('start');
            assert.equal(c.state.completed, true);
        }
        else {
            run(c);
            assert.equal(c.state.completed, true);
            assert.equal(c.state.part?.sections.length, name === 'two-operations' ? 2 : 1);
            assert.deepEqual(c.resources.operations.map(o => o.id), name === 'two-operations' ? ['turning', 'turning-2'] : ['turning']);
        }
    }
});
test('migration and storage failures preserve old data and do not overwrite a current project', () => {
    const raw = readFileSync(new URL('./fixtures/v1-turning.json', import.meta.url), 'utf8');
    const map = new Map([[LEGACY_STORAGE_KEY, raw]]);
    const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
    const l = loadLevel(store)!;
    assert.equal(l.version, 4);
    assert.equal(map.get(LEGACY_STORAGE_KEY), raw);
    assert.equal(map.has(STORAGE_KEY), false);
    saveDraft(store, l);
    assert.equal(map.get(LEGACY_STORAGE_KEY), raw);
    const broken = JSON.parse(raw);
    broken.edges = broken.edges.filter((e: {
        targetHandle: string;
    }) => e.targetHandle !== 'operation');
    assert.throws(() => parseLevel(JSON.stringify(broken)), /Миграция v1 невозможна/);
    const previous = serializeLevel(l);
    assert.throws(() => saveDraft({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } }, l), /localStorage/);
    assert.equal(serializeLevel(l), previous);
});
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('introduction raster survives save/reload/export/import and all entry points decode it', async () => {
    const l = welcomeLevel();
    l.nodes[1].params.image = PNG;
    const map = new Map<string, string>();
    const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
    saveDraft(store, l);
    assert.equal(loadLevel(store)!.nodes[1].params.image, PNG);
    let decoded = 0;
    const imported = await parseLevelWithImages(serializeLevel(l), async (data) => { assert.equal(data, PNG); decoded++; return { width: 1, height: 1 }; });
    assert.deepEqual(imported, l);
    assert.equal(decoded, 1);
    const file = new File([Uint8Array.from(atob(PNG.split(',')[1]), x => x.charCodeAt(0))], 'image.png', { type: 'image/png' });
    assert.equal(await uploadImage(file, async () => ({ width: 1, height: 1 })), PNG);
});
test('image validation rejects SVG/HTML, fake MIME, undecodable data, oversized files and resolution; JSON limit matches images', async () => {
    for (const raw of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGgxPg==', 'blob:temporary', PNG.replace('image/png', 'image/jpeg')])
        assert.throws(() => validateImageData(raw));
    await assert.rejects(() => decodeImage(PNG, async () => { throw new Error('invalid raster'); }), /invalid raster/);
    await assert.rejects(() => decodeImage(PNG, async () => ({ width: 2049, height: 1 })), /2048/);
    const l = welcomeLevel();
    l.nodes[1].params.image = PNG;
    await assert.rejects(() => parseLevelWithImages(serializeLevel(l), async () => { throw new Error('corrupt'); }), /corrupt/);
    await assert.rejects(() => uploadImage(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'large.png', { type: 'image/png' })), /512/);
    assert.throws(() => parseLevel(' '.repeat(MAX_JSON_BYTES + 1)), /2 МиБ/);
    assert.deepEqual(parseLevel(serializeLevel(l)), l);
});
test('reset from an event callback invalidates the remainder of old scenario activation', () => {
    const c = core(exampleLevel());
    c.subscribe(e => { if (e.type === 'node-completed' && e.nodeId === 'task')
        c.reset(); });
    c.command('start');
    assert.equal(c.state.activeNodeId, 'intro');
    assert.equal(c.state.playing, false);
    assert.equal(c.state.stage, 'table');
    assert.equal(c.subscriptionCount, 0);
});
test('turning the whole length changes actual cylinder diameter and supports a uniform cylinder requirement', () => {
    const l = exampleLevel();
    Object.assign(operations(l.nodes.find(n => n.type === 'process')!)[0], { diameter: 12, length: 60 });
    Object.assign(l.nodes.find(n => n.type === 'part')!.params, { diameter: 12, sections: [] });
    const c = core(l);
    run(c);
    assert.equal(c.state.completed, true);
    const p = c.state.part!;
    assert.equal(p.shape, 'cylinder');
    if (p.shape === 'cylinder')
        assert.equal(p.diameter, 12);
});
test('reset during configuration or completion events cannot advance or complete the new run', () => {
    const c = core(checkLevel());
    c.subscribe(e => { if (e.type === 'configuration-checked')
        c.reset(); });
    c.command('start');
    assert.equal(c.state.activeNodeId, 'intro');
    assert.equal(c.state.completed, false);
    const w = core(welcomeLevel());
    w.subscribe(e => { if (e.type === 'node-completed' && e.nodeId === 'finish')
        w.reset(); });
    w.command('start');
    assert.equal(w.state.activeNodeId, 'intro');
    assert.equal(w.log.some(e => e.type === 'level-completed'), false);
});

test('image dimensions are limited before decoding, including PNG, JPEG and WebP headers',async()=>{
 const png=Uint8Array.from(atob(PNG.split(',')[1]),x=>x.charCodeAt(0));png[16]=0;png[17]=0;png[18]=16;png[19]=0;
 const url='data:image/png;base64,'+btoa(String.fromCharCode(...png));let decoded=false;await assert.rejects(()=>decodeImage(url,async()=>{decoded=true;return {width:4096,height:1};}),/2048/);assert.equal(decoded,false);
 const jpeg=Uint8Array.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,217]);const j=validateImageData('data:image/jpeg;base64,'+btoa(String.fromCharCode(...jpeg)));assert.equal(j.width,1);assert.equal(j.height,1);
 const webp=new Uint8Array(30);webp.set(new TextEncoder().encode('RIFF'));webp.set(new TextEncoder().encode('WEBPVP8X'),8);webp[16]=10;const w=validateImageData('data:image/webp;base64,'+btoa(String.fromCharCode(...webp)));assert.equal(w.width,1);assert.equal(w.height,1);
});
