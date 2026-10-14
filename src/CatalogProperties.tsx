import type { Level, LevelNode, Params, AllowedOperation } from './level';
import { allowedOperations, catalogReferences } from './catalog';
export function CatalogProperties({ level, node, onPatch }: {
    level: Level;
    node: LevelNode;
    onPatch: (p: Params) => void;
}) {
    return <section><p>Варианты ссылаются на обычные ноды. Они не создают предметы в цехе. Выберите 1–5 в каждой категории.</p>{([['blankIds', 'blank', 'Заготовки'], ['machineIds', 'lathe', 'Станки'], ['toolIds', 'tool', 'Инструменты']] as const).map(([key, type, title]) => <fieldset key={key}><legend>{title}</legend>{level.nodes.filter(n => n.type === type).map(n => { const ids = catalogReferences(node, key); return <label key={n.id}><input type="checkbox" checked={ids.includes(n.id)} onChange={e => onPatch({ [key]: e.target.checked ? [...ids, n.id] : ids.filter(id => id !== n.id) })}/>{String(n.params.name)} <small>{n.id}</small></label>; })}</fieldset>)}<fieldset><legend>Разрешённые операции и длительность</legend>{(['turning', 'milling'] as const).map(kind => { const rules = allowedOperations(node), rule = rules.find(o => o.kind === kind); const change = (next: AllowedOperation[]) => onPatch({ allowedOperations: next }); return <div key={kind}><label><input type="checkbox" checked={!!rule} onChange={e => change(e.target.checked ? [...rules, { kind, seconds: 3 }] : rules.filter(o => o.kind !== kind))}/>{kind === 'turning' ? 'Продольное точение' : 'Фрезерование плоскости'}</label>{rule && <label>Длительность, с<input type="number" min="0.1" step="any" value={rule.seconds} onChange={e => change(rules.map(o => o.kind === kind ? { ...o, seconds: Number(e.target.value) } : o))}/></label>}</div>; })}</fieldset></section>;
}
