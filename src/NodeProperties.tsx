import { useEffect, useRef } from 'react';
import { registry, TOOLS, operations, sections, defaultOperation, sourceNode, type Level, type LevelNode, type Params, type ParamValue, type OperationSpec, type Section } from './level';
import { uploadImage, MAX_TOTAL_IMAGE_BYTES, validateImageData } from './images';
import { dimensions, expectedResult } from './manufacturing';
import { validateLevel } from './validation';
export function OperationList({ value, onChange, label = 'Операции' }: {
    value: OperationSpec[];
    onChange: (v: OperationSpec[]) => void;
    label?: string;
}) {
    return <fieldset><legend>{label}</legend>{value.map((op, i) => <div key={op.id}><strong>{i + 1}. {op.kind === 'turning' ? 'Продольное точение' : 'Фрезерование плоскости'}</strong>
  {(op.kind === 'turning' ? ['diameter', 'length', 'seconds'] : ['depth', 'seconds']).map(key => <label key={key}>{({ diameter: 'Конечный диаметр, мм', length: 'Длина участка, мм', depth: 'Глубина снятия, мм', seconds: 'Обработка, секунд' } as Record<string, string>)[key]}<input aria-label={`${label} ${i + 1}: ${key}`} type="number" min={0} step="any" value={Number(op[key as keyof typeof op])} onChange={e => onChange(value.map((o, j) => j === i ? { ...o, [key]: Number(e.target.value) } : o))}/></label>)}
  <button disabled={i === 0} aria-label={`Переместить операцию ${i + 1} вверх`} onClick={() => { const copy = [...value]; [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]]; onChange(copy); }}>↑</button><button disabled={i === value.length - 1} aria-label={`Переместить операцию ${i + 1} вниз`} onClick={() => { const copy = [...value]; [copy[i + 1], copy[i]] = [copy[i], copy[i + 1]]; onChange(copy); }}>↓</button><button onClick={() => onChange(value.filter((_, j) => j !== i))}>Удалить операцию {i + 1}</button>
 </div>)}<button disabled={value.length >= 20} onClick={() => onChange([...value, defaultOperation('turning')])}>+ Продольное точение</button><button disabled={value.length >= 20} onClick={() => onChange([...value, defaultOperation('milling')])}>+ Фрезерование плоскости</button><p className="muted">Точение создаёт последовательные отдельные участки; фрезерование снимает верхнюю плоскость. Совместимость проверяется перед запуском.</p></fieldset>;
}
function SectionList({ value, onChange }: {
    value: Section[];
    onChange: (v: Section[]) => void;
}) { return <fieldset><legend>Требуемые участки</legend>{value.map((s, i) => <div key={i}>{(['diameter', 'length'] as const).map(key => <label key={key}>{key === 'diameter' ? 'Диаметр' : 'Длина'} участка {i + 1}, мм<input type="number" step="any" value={s[key]} onChange={e => onChange(value.map((v, j) => j === i ? { ...v, [key]: Number(e.target.value) } : v))}/></label>)}<button onClick={() => onChange(value.filter((_, j) => j !== i))}>Удалить участок {i + 1}</button></div>)}<button onClick={() => onChange([...value, { diameter: 12, length: 30 }])}>+ Участок</button></fieldset>; }
export function NodeProperties({ node, level, onPatch, onNotice }: {
    node: LevelNode;
    level: Level;
    onPatch: (p: Params) => void;
    onNotice: (s: string) => void;
}) {
    const alive = useRef(true);
    const uploadSequence = useRef(0);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    function update(key: string, value: ParamValue) { const patch: Params = { [key]: value }; if (node.type === 'tool' && key === 'category')
        patch.kind = value === 'milling' ? 'face' : 'passing'; if (node.type === 'part' && key === 'shape')
        patch.sections = []; onPatch(patch); }
    return <>{registry[node.type].parameters.filter(p => (!p.when || p.when(node.params)) && !(node.type === 'check' && ['expectedMaterial', 'expectedShape'].includes(p.key) && node.params.checkBlank !== true)).map(p => <label key={p.key}>{p.label}{p.type === 'boolean' ? <input type="checkbox" style={{ width: 'auto', marginLeft: 8 }} checked={node.params[p.key] === true} onChange={e => update(p.key, e.target.checked)}/> : p.type === 'textarea' ? <textarea value={String(node.params[p.key] ?? '')} onChange={e => update(p.key, e.target.value)}/> : p.type === 'select' ? <select value={String(node.params[p.key])} onChange={e => update(p.key, e.target.value)}>{(node.type === 'tool' && p.key === 'kind' ? TOOLS[node.params.category as keyof typeof TOOLS] ?? [] : p.options ?? []).map(o => <option value={o.value} key={o.value}>{o.label}</option>)}</select> : <input type={p.type === 'number' ? 'number' : 'text'} step="any" value={String(node.params[p.key] ?? '')} onChange={e => update(p.key, p.type === 'number' ? Number(e.target.value) : e.target.value)}/>}</label>)}
 {node.type === 'intro' && <section><label>Изображение (PNG, JPEG, WebP)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file)
        return; const seq = ++uploadSequence.current; try {
        const image = await uploadImage(file);
        let total = validateImageData(image).bytes;
        for (const n of level.nodes)
            if (n.id !== node.id && n.type === 'intro' && n.params.image)
                total += validateImageData(String(n.params.image)).bytes;
        if (total > MAX_TOTAL_IMAGE_BYTES)
            throw new Error('Изображения уровня превышают 1 МиБ суммарно.');
        if (alive.current && seq === uploadSequence.current) {
            update('image', image);
            onNotice('Изображение загружено. Сохраните уровень.');
        }
    }
    catch (error) {
        if (alive.current && seq === uploadSequence.current)
            onNotice(`Изображение не изменено: ${(error as Error).message}`);
    } }}/></label><p className="muted">До 512 КиБ, 2048 × 2048 пикселей; суммарно до 1 МиБ на уровень.</p>{node.params.image && <><img src={String(node.params.image)} alt={String(node.params.text || 'Изображение вступления')} style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }}/><button onClick={() => { uploadSequence.current++; update('image', ''); }}>Удалить изображение</button></>}</section>}
 {node.type === 'process' && <OperationList value={operations(node)} onChange={v => update('operations', v)}/>}
 {node.type === 'check' && node.params.checkProcess === true && <OperationList label="Ожидаемые операции" value={operations(node, 'expectedOperations')} onChange={v => update('expectedOperations', v)}/>}
 {node.type === 'part' && <>{node.params.shape === 'cylinder' && <SectionList value={sections(node)} onChange={v => update('sections', v)}/>}<button onClick={() => { try {
        const m = sourceNode(level, node, 'machine'), b = sourceNode(level, m, 'blank'), p = sourceNode(level, m, 'process');
        if (!m || !b || !p)
            throw new Error('Подключите заготовку и техпроцесс к станку, а станок к детали.');
        const errors = validateLevel(level).filter(e => [m.id, b.id, p.id].includes(e.nodeId ?? ''));
        if (errors.length)
            throw new Error(errors[0].message);
        const result = expectedResult({ id: b.id, name: String(b.params.name), material: String(b.params.material), ...dimensions(b.params) }, operations(p));
        const patch: Params = { ...dimensions(result), material: result.material, sections: result.sections };
        onPatch(patch);
        onNotice('Требования скопированы один раз. Дальше они редактируются независимо.');
    }
    catch (e) {
        onNotice((e as Error).message);
    } }}>Заполнить из техпроцесса</button><p className="muted">Требования не меняются автоматически при изменении операций.</p></>}
 </>;
}
