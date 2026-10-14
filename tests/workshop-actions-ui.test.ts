import {test, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {FactoryCore} from '../src/core';
import {compileLevel} from '../src/compiler';
import {exampleLevel, locatedPlacements, millingLevel, intermediateLevel} from '../src/level';
import {PlanningCore} from '../src/planning';
import {toyAxleLevel} from '../src/playerLevel';
import {partPose, objectBounds, type PartPose} from '../src/presentation/workshopGeometry';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost:5173'});
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent'] as const) Object.defineProperty(globalThis, key, {value: dom.window[key], configurable: true});
Object.defineProperty(globalThis, 'navigator', {value: dom.window.navigator, configurable: true});
Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
class Pointer extends dom.window.MouseEvent {
  pointerId: number;
  isPrimary: boolean;
  constructor(type: string, init: MouseEventInit & {pointerId?: number; isPrimary?: boolean}) {super(type, init); this.pointerId = init.pointerId ?? 1; this.isPrimary = init.isPrimary ?? true;}
}
Object.defineProperty(dom.window, 'PointerEvent', {value: Pointer});
dom.window.HTMLElement.prototype.setPointerCapture = () => {};
dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({left: 100, top: 100, width: 510, height: 330, x: 100, y: 100, right: 610, bottom: 430, toJSON: () => ({})});
const {createElement, useReducer} = await import('react');
const {render, fireEvent, cleanup, act} = await import('@testing-library/react');
const {WorkshopInteractions} = await import('../src/WorkshopInteractions');
afterEach(cleanup);

function setup(level = exampleLevel(), runtime?: FactoryCore) {
  const core = runtime ?? new FactoryCore(compileLevel(level));
  core.command('start');
  const previews: (PartPose | null)[] = [];
  const onDragChange = (pose: PartPose | null) => {previews.push(pose);};
  let refreshView = () => {};
  function Harness() {
    const [, refresh] = useReducer(x => x + 1, 0);
    refreshView = refresh;
    return createElement(WorkshopInteractions, {level, core, onUpdate: refresh, onDragChange});
  }
  const view = render(createElement(Harness));
  function client(point: {x: number; y: number}) {return {clientX: 100 + point.x / 2, clientY: 100 + point.y / 2, pointerId: 1, isPrimary: true, button: 0};}
  function beginDrag(to: {x: number; y: number}) {
    const item = view.getByRole('button', {name: /Выбрать (заготовку|готовую деталь|деталь на складе)$/});
    const source = locatedPlacements(level).find(p => p.nodeId === core.state.location!.id)!;
    const node = level.nodes.find(n => n.id === source.nodeId)!;
    const pose = partPose(source, node.type, node.params.kind === 'mill');
    fireEvent.pointerDown(item, client({x: pose.x + pose.length / 2, y: pose.y + 5}));
    fireEvent.pointerMove(item, client(to));
    return item;
  }
  function drag(to: {x: number; y: number}, cancel = false) {
    const item = beginDrag(to);
    if (cancel) fireEvent.pointerCancel(item, client(to));
    else fireEvent.pointerUp(item, client(to));
  }
  function target(id: string) {
    const p = locatedPlacements(level).find(p => p.nodeId === id)!;
    return objectBounds(p, level.nodes.find(n => n.id === id)!.params.kind === 'mill');
  }
  return {core, view, previews, drag, target, beginDrag, client, refresh: () => act(refreshView)};
}

test('scene UI: object clicks open only contextual actions, button transfers remain usable', () => {
  const {view, core} = setup();
  assert.equal(view.queryByRole('group'), null);
  fireEvent.click(view.getByRole('button', {name: 'Выбрать заготовку'}));
  assert.ok(view.getByRole('group', {name: /Действия:/}));
  fireEvent.click(view.getByRole('button', {name: 'Установить в станок'}));
  fireEvent.click(view.getByRole('button', {name: 'Выбрать Токарный станок'}));
  fireEvent.click(view.getByRole('button', {name: 'Обработать 1 / 1'}));
  assert.equal(core.state.stage, 'processing');
  assert.equal((view.getByRole('button', {name: 'Обработать 1 / 1'}) as HTMLButtonElement).disabled, true);
  act(() => core.tick(3000));
  fireEvent.click(view.getByRole('button', {name: 'Выбрать Токарный станок'}));
  fireEvent.click(view.getByRole('button', {name: 'Отправить на склад'}));
  fireEvent.click(view.getByRole('button', {name: 'Выбрать Склад'}));
  assert.equal(core.state.completed, true);
});

test('scene UI: scaled pointer dragging installs and stores turning and milling parts', () => {
  for (const level of [exampleLevel(), millingLevel()]) {
    const {view, core, previews, drag, target} = setup(level);
    drag(target('lathe'));
    assert.equal(core.state.stage, 'loaded');
    assert.ok(previews.some(p => p !== null));
    assert.equal(previews.at(-1), null);
    fireEvent.click(view.getByRole('button', {name: 'Обработать 1 / 1'}));
    act(() => core.tick(3000));
    drag(target('warehouse'));
    assert.equal(core.state.completed, true);
    assert.equal(core.state.count, 1);
    cleanup();
  }
});

test('scene UI: outside release, pointer cancellation and Escape preserve the source', () => {
  const {core, view, drag, target} = setup();
  drag({x: 10, y: 10});
  assert.equal(core.state.location?.kind, 'table');
  assert.equal(core.state.target, null);
  assert.ok(view.getByRole('status').textContent?.includes('отменено'));
  drag(target('lathe'), true);
  assert.equal(core.state.location?.kind, 'table');
  assert.equal(core.state.target, null);
  fireEvent.click(view.getByRole('button', {name: 'Выбрать заготовку'}));
  fireEvent.click(view.getByRole('button', {name: 'Установить в станок'}));
  fireEvent.keyDown(window, {key: 'Escape'});
  assert.equal(core.state.target, null);
  assert.equal(view.queryByRole('group'), null);
});

test('scene UI: reset during dragging clears the preview and an old pointer release cannot move the new blank', () => {
  const {core, previews, beginDrag, target, client, refresh} = setup();
  const destination = target('lathe');
  const item = beginDrag(destination);
  assert.equal(core.state.target, 'machine');
  core.reset(); refresh();
  assert.equal(previews.at(-1), null);
  core.command('start'); refresh();
  fireEvent.pointerUp(item, client(destination));
  assert.equal(core.state.location?.kind, 'table');
  assert.equal(core.state.target, null);
  assert.equal(core.log.filter(e => e.type === 'blank-installed').length, 0);
});

test('scene UI: intermediate-store gestures retrieve the same part only into the next compatible machine', () => {
  const {core, view, drag, target, refresh} = setup(intermediateLevel());
  const confirm = () => {while (core.state.activeHint) core.command('continue-hint'); refresh();};
  drag(target('lathe')); confirm();
  fireEvent.click(view.getByRole('button', {name: 'Обработать 1 / 1'}));
  act(() => {core.tick(3000); confirm();});
  drag(target('warehouse')); confirm();
  const firstPart = core.state.item;
  drag(target('lathe'));
  assert.equal(core.state.warehouses.warehouse.count, 1);
  drag(target('lathe-2')); confirm();
  assert.equal(core.state.location?.id, 'lathe-2');
  assert.deepEqual(core.state.item, firstPart);
  assert.equal(core.state.warehouses.warehouse.count, 0);
});

test('scene UI: a player plan uses its generated attempt IDs for dragging and contextual actions', () => {
  const planning = new PlanningCore(toyAxleLevel());
  assert.ok(planning.setPlan({blankId: 'steel-stock', machineId: 'lathe-choice', pointId: 'machine-point', operations: [
    {id: 'a', kind: 'turning', diameter: 12, length: 20, toolId: 'passing-choice'},
    {id: 'b', kind: 'turning', diameter: 8, length: 20, toolId: 'passing-choice'},
  ]}));
  assert.ok(planning.startManufacturing());
  const {core, view, drag, target, refresh} = setup(planning.runtimeLevel!, planning.runtime!);
  drag(target(core.resources.machine.id));
  assert.equal(core.state.stage, 'loaded');
  fireEvent.click(view.getByRole('button', {name: 'Обработать 1 / 2'}));
  act(() => core.tick(3000));
  refresh();
  fireEvent.click(view.getByRole('button', {name: 'Обработать 2 / 2'}));
  act(() => core.tick(3000));
  refresh();
  drag(target(core.resources.warehouse.id));
  assert.equal(planning.assessment?.success, true);
  assert.equal(core.state.completed, true);
});
