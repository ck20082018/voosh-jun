import { useEffect, useState, type ReactNode } from 'react';
import type { Level } from '../level';
import { operationsOf, type MissionSpec, type OperationSpec } from '../platform/missions';
import type { MissionStatus } from '../platform/progress';
import { Icon, type IconName } from '../ui/Icon';

/** Данные для чертежа, восстановленные из уровня (нужны на хабе и карте, где ядро не запущено). */
export function drawingOf(level: Level): { blank: { diameter: number; length: number; material: string }; ops: OperationSpec[]; title: string } {
  const blank = level.nodes.find(n => n.type === 'blank');
  return {
    title: level.name,
    blank: { diameter: Number(blank?.params.diameter) || 20, length: Number(blank?.params.length) || 60, material: String(blank?.params.material ?? 'Сталь') },
    ops: operationsOf(level),
  };
}

/** Простой маршрутизатор по location.hash: #/map, #/mission/precision и т.д. */
export function navigate(hash: string) { if (location.hash !== hash) location.hash = hash; }
export function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function Stars({ count, max = 3, size = 16 }: { count: number; max?: number; size?: number }) {
  return (
    <span className="stars-row" role="img" aria-label={`Оценка: ${count} из ${max}`}>
      {Array.from({ length: max }, (_, i) => <Icon key={i} name="star" size={size} className={i < count ? 'is-on' : ''} />)}
    </span>
  );
}

export function Difficulty({ value }: { value: 1 | 2 | 3 }) {
  return (
    <span className="difficulty" role="img" aria-label={`Сложность ${value} из 3`}>
      {[1, 2, 3].map(i => <i key={i} className={i <= value ? 'is-on' : ''} />)}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div><span className="eyebrow">{eyebrow}</span><h1 className="t-h1">{title}</h1></div>
      {children && <div className="page-head__side">{children}</div>}
    </header>
  );
}

export const STATUS_ICON: Record<MissionStatus, IconName> = { locked: 'lock', available: 'play', 'in-progress': 'activity', passed: 'check', max: 'medal' };
export const STATUS_TONE: Record<MissionStatus, 'neutral' | 'teal' | 'amber' | 'green'> = { locked: 'neutral', available: 'teal', 'in-progress': 'amber', passed: 'green', max: 'green' };

export const missionNumber = (missions: MissionSpec[], id: string) => missions.findIndex(m => m.id === id) + 1;
export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};
