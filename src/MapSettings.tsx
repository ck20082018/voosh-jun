import type { Level } from './level';
import { setMapSize, setPointCount, type MapChange } from './map';
export function MapSettings({ level, onChange }: {
    level: Level;
    onChange: (change: MapChange) => void;
}) { return <section><h3>Настройки карты</h3>{(['width', 'height'] as const).map(key => <label key={key}>{key === 'width' ? 'Ширина карты, клеток' : 'Высота карты, клеток'}<input type="number" min={1} max={8} value={level.grid[key]} onChange={e => onChange(setMapSize(level, key === 'width' ? Number(e.target.value) : level.grid.width, key === 'height' ? Number(e.target.value) : level.grid.height))}/></label>)}<label>Количество точек<input type="number" min={0} max={level.grid.width * level.grid.height} value={level.grid.points.length} onChange={e => onChange(setPointCount(level, Number(e.target.value)))}/></label><p className="muted">Занятые точки защищены. Сначала снимите или переместите объекты, затем уменьшайте карту.</p></section>; }
