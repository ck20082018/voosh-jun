import type { Dimensions } from './manufacturing';
import { dimensionText } from './manufacturing';
import { shaftSegments, type ShaftSection } from './presentation/partGeometry';
export function PartPreview({ part, label }: {
    part: Readonly<Dimensions> & {
        readonly material?: string;
        readonly sections?: readonly ShaftSection[];
    };
    label: string;
}) {
    return <figure className="part-preview"><svg viewBox="0 0 260 145" role="img" aria-label={label}>
 {part.shape === 'cylinder' ? shaftSegments(part.length, part.diameter, part.sections ?? [], 190, 28).map((s, i) => { const x = 30 + s.offset, y = 49 + s.offset * .24, l = s.length, r = s.radius; return <g key={i}><polygon points={`${x},${y - r} ${x + l},${y - r + l * .24} ${x + l},${y + r + l * .24} ${x},${y + r}`} fill="#9db0b9"/><ellipse cx={x} cy={y} rx={r * .4} ry={r} fill="#d6e1e2"/><ellipse cx={x + l} cy={y + l * .24} rx={r * .4} ry={r} fill="#6e8794"/><path d={`M${x + 3} ${y - r * .5} L${x + l - 3} ${y - r * .5 + l * .24}`} stroke="#edf4ef" strokeWidth="2"/></g>; }) : <g><polygon points="30,40 210,65 190,95 10,70" fill="#d6e1e2"/><polygon points={`10,70 190,95 190,${95 + part.height} 10,${70 + part.height}`} fill="#9db0b9"/><polygon points={`190,95 210,65 210,${65 + part.height} 190,${95 + part.height}`} fill="#6e8794"/></g>}
 </svg><figcaption>{label}: {part.material} · {dimensionText(part)}{part.sections?.map((s, i) => <span key={i}><br />Участок {i + 1}: Ø{s.diameter} × {s.length} мм</span>)}</figcaption></figure>;
}
