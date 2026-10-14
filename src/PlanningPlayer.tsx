import { useReducer, useState, type ReactNode } from 'react';
import type { Level } from './level';
import { PlanningCore, type PlayerOperation } from './planning';
import type { FactoryCore } from './core';
import { catalogReferences, allowedOperations } from './catalog';
import { dimensionText, dimensions } from './manufacturing';
import { PartPreview } from './PartPreview';
import { projectCell } from './presentation/workshopDrawing';
export function PlanningPlayer({ core, level, onExit, renderRuntime }: {
    core: PlanningCore;
    level: Level;
    onExit: () => void;
    renderRuntime: (runtime: FactoryCore, scene: Level, planning: PlanningCore, onChange: () => void) => ReactNode;
}) {
    const [, refresh] = useReducer(x => x + 1, 0);
    const [checked, setChecked] = useState(false);
    const [previewed, setPreviewed] = useState(false);
    const [error, setError] = useState('');
    if (core.runtime)
        return renderRuntime(core.runtime, core.runtimeLevel!, core, () => { setChecked(false); setPreviewed(false); refresh(); });
    const plan = core.plan, catalog = level.nodes.find(n => n.type === 'catalog')!, preview = core.preview, goal = level.nodes.find(n => n.type === 'part')!, intro = level.nodes.find(n => n.type === 'intro');
    const variants = (key: 'blankIds' | 'machineIds' | 'toolIds') => catalogReferences(catalog, key).map(id => level.nodes.find(n => n.id === id)!);
    function change(next: typeof plan) { if (core.setPlan(next)) {
        setPreviewed(false);
        setChecked(false);
        setError('');
        refresh();
    } }
    function updateOperation(id: string, patch: Partial<PlayerOperation>) { change({ ...plan, operations: plan.operations.map(o => o.id === id ? { ...o, ...patch } as PlayerOperation : o) }); }
    function reorder(index: number, delta: number) { const operations = [...plan.operations]; [operations[index], operations[index + delta]] = [operations[index + delta], operations[index]]; change({ ...plan, operations }); }
    const occupied = new Set(level.placements.map(p => p.pointId));
    return <main className="player-app planning-app"><header className="app-header"><div><h1>{level.name}</h1><p>План производства · режим «План игрока»</p></div><div><button onClick={() => { core.reset(); setChecked(false); setPreviewed(false); setError(''); refresh(); }}>Начать заново</button><button onClick={onExit}>← Вернуться в редактор</button></div></header>
 <div className="planning-layout"><section><div className="planning-card"><h2>{String(intro?.params.title ?? 'Задание')}</h2>{intro?.params.image && <img src={String(intro.params.image)} alt="Изображение задания" style={{ maxWidth: '100%', maxHeight: 220 }}/>}<p>{String(intro?.params.text ?? 'Составьте собственный план производства.')}</p><PartPreview label="Требуемая деталь" part={{ ...dimensions(goal.params), material: String(goal.params.material), sections: goal.params.sections as {
            diameter: number;
            length: number;
        }[] }}/></div>
 <fieldset className="planning-card"><legend>1. Заготовка</legend><div className="catalog-cards">{variants('blankIds').map(n => <button key={n.id} aria-pressed={plan.blankId === n.id} onClick={() => change({ ...plan, blankId: n.id })}><strong>{String(n.params.name)}</strong><PartPreview label="Заготовка" part={{ ...dimensions(n.params), material: String(n.params.material) }}/></button>)}</div></fieldset>
 <fieldset className="planning-card"><legend>2. Станок</legend><div className="catalog-cards">{variants('machineIds').map(n => <button key={n.id} aria-pressed={plan.machineId === n.id} onClick={() => change({ ...plan, machineId: n.id })}><span aria-hidden="true">{n.params.kind === 'lathe' ? '▧' : '▥'}</span><strong>{String(n.params.name)}</strong><p>{allowedOperations(catalog).filter(o => o.kind === (n.params.kind === 'lathe' ? 'turning' : 'milling')).map(o => o.kind === 'turning' ? 'Продольное точение цилиндра' : 'Фрезерование плоскости бруска').join(', ') || 'Нет разрешённых операций для этого станка'}</p></button>)}</div></fieldset>
 <section className="planning-card"><h2>3. Место станка</h2><p>Стол и склад закреплены автором. Выберите свободную разрешённую точку.</p><label>Точка станка<select aria-label="Точка станка" value={plan.pointId ?? ''} onChange={e => change({ ...plan, pointId: e.target.value || null })}><option value="">Не размещён</option>{level.grid.points.filter(p => !occupied.has(p.id)).map(p => <option key={p.id} value={p.id}>Клетка {p.x + 1}, {p.y + 1}</option>)}</select></label>
 <svg className="planning-map" viewBox={`0 100 1020 ${Math.max(360, (level.grid.width + level.grid.height) * 30 + 100)}`} role="img" aria-label="Размещение на карте">{Array.from({ length: level.grid.height }, (_, y) => Array.from({ length: level.grid.width }, (_, x) => { const c = projectCell(x, y), point = level.grid.points.find(p => p.x === x && p.y === y), placement = point && level.placements.find(p => p.pointId === point.id), name = placement ? String(level.nodes.find(n => n.id === placement.nodeId)?.params.name) : point?.id === plan.pointId ? 'Станок' : point ? 'Свободно' : ''; const choose = () => { if (point && !placement)
        change({ ...plan, pointId: point.id }); }; return <g key={`${x}:${y}`} role={point && !placement ? 'button' : undefined} tabIndex={point && !placement ? 0 : undefined} aria-label={point && !placement ? `Разместить станок: ${x + 1}, ${y + 1}` : undefined} onClick={choose} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose();
    } }}><polygon points={`${c.x},${c.y - 30} ${c.x + 58},${c.y} ${c.x},${c.y + 30} ${c.x - 58},${c.y}`} fill={placement ? '#b7c4ac' : point?.id === plan.pointId ? '#c9b67f' : point ? '#c4dedd' : '#e6ecdf'} stroke="#99ad9a"/>{name && <text x={c.x} y={c.y + 4} textAnchor="middle" fontSize="11">{name}</text>}</g>; }))}</svg></section></section>
 <section><section className="planning-card"><h2>Инструменты каталога</h2><div className="catalog-cards">{variants('toolIds').map(n => <article className="tool-card" key={n.id}><strong>{String(n.params.name)}</strong><p>{n.params.kind === 'passing' ? 'Продольное точение цилиндрических участков' : n.params.kind === 'facing' ? 'Подрезание торца; такая операция пока недоступна' : n.params.kind === 'cutoff' ? 'Отрезание; такая операция пока недоступна' : 'Фрезерование верхней плоскости бруска'}</p></article>)}</div><p>Инструмент выбирается отдельно в каждой операции.</p></section><fieldset className="planning-card"><legend>4. Операции по порядку</legend><p>Для каждой операции выберите инструмент и размеры. Время задаёт автор. Точение создаёт новые последовательные участки.</p>{plan.operations.map((o, i) => <section className="operation-card" key={o.id}><h3>{i + 1}. {o.kind === 'turning' ? 'Продольное точение' : 'Фрезерование плоскости'}</h3><label>Инструмент<select aria-label={`Инструмент операции ${i + 1}`} value={o.toolId ?? ''} onChange={e => updateOperation(o.id, { toolId: e.target.value || null })}><option value="">Выберите инструмент</option>{variants('toolIds').map(n => <option key={n.id} value={n.id}>{String(n.params.name)}</option>)}</select></label>{o.kind === 'turning' ? <><label>Диаметр, мм<input aria-label={`Диаметр операции ${i + 1}`} type="number" step="any" value={o.diameter} onChange={e => updateOperation(o.id, { diameter: Number(e.target.value) })}/></label><label>Длина участка, мм<input aria-label={`Длина операции ${i + 1}`} type="number" step="any" value={o.length} onChange={e => updateOperation(o.id, { length: Number(e.target.value) })}/></label></> : <label>Глубина снятия, мм<input aria-label={`Глубина операции ${i + 1}`} type="number" step="any" value={o.depth} onChange={e => updateOperation(o.id, { depth: Number(e.target.value) })}/></label>}<p>{o.kind === 'turning' ? `Результат: новый участок Ø${o.diameter} × ${o.length} мм на выбранном станке` : `Результат: высота бруска уменьшится на ${o.depth} мм`}</p><small>Длительность: {allowedOperations(catalog).find(r => r.kind === o.kind)?.seconds} с</small><div><button disabled={!i} aria-label={`Переместить операцию ${i + 1} вверх`} onClick={() => reorder(i, -1)}>↑</button><button disabled={i === plan.operations.length - 1} aria-label={`Переместить операцию ${i + 1} вниз`} onClick={() => reorder(i, 1)}>↓</button><button onClick={() => change({ ...plan, operations: plan.operations.filter(op => op.id !== o.id) })}>Удалить операцию {i + 1}</button></div></section>)}{allowedOperations(catalog).map(rule => <button key={rule.kind} disabled={plan.operations.length >= 20} onClick={() => { core.addOperation(rule.kind); setChecked(false); setPreviewed(false); refresh(); }}>+ {rule.kind === 'turning' ? 'Продольное точение' : 'Фрезерование плоскости'}</button>)}</fieldset>
 <section className="planning-card"><h2>5. Проверка и запуск</h2><p>Проверка оценивает выполнимость плана. Соответствие заданию проверяется после изготовления и сдачи на склад.</p><button onClick={() => setChecked(true)}>Проверить план</button><button onClick={() => { setChecked(true); setPreviewed(true); }}>Пробная обработка</button>{checked && <div role="status">{preview.errors.length ? <ul>{preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : <p>План технически допустим.</p>}{preview.warnings.map(w => <p key={w}>{w}</p>)}</div>}{previewed && preview.part && <><h3>После обработки</h3><PartPreview part={preview.part} label="Пробный результат"/><p>Это предварительный просмотр; настоящая заготовка ещё не обработана.</p></>}{error && <p role="alert">{error}</p>}<button className="primary" onClick={() => { setChecked(true); try {
        if (core.startManufacturing())
            refresh();
        else
            setError('Исправьте технические ошибки плана.');
    }
    catch (e) {
        setError((e as Error).message);
    } }}>Зафиксировать план и начать изготовление</button><p className="muted">До сдачи детали план зафиксирован. После результата можно изменить план и сделать новую попытку.</p></section></section></div></main>;
}
