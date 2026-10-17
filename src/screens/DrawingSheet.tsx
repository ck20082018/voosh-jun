import { useId } from 'react';

interface Op { diameter: number; length: number }
interface DrawingProps {
  title: string;
  blank: { diameter: number; length: number; material: string };
  ops: Op[];
  /** Если задано, поверх чертежа показывается фактическое состояние детали и припуск, который ещё нужно снять. */
  actual?: { doneOps: number; progress: number };
  className?: string;
}

const W = 340, PAD = 36;

/** Технический чертёж детали: контур по заданию, размеры, фактическая форма и припуск. */
export function DrawingSheet({ title, blank, ops, actual, className }: DrawingProps) {
  const uid = useId().replace(/:/g, '');
  const k = (W - 2 * PAD) / blank.length;
  const R = (blank.diameter / 2) * k;
  const total = ops.reduce((s, o) => s + o.length, 0);
  const shoulder = Math.max(0, blank.length - total);
  const top = 40, cy = top + R, H = top + 2 * R + 82;

  interface Seg { x0: number; x1: number; req: number; act: number; d: number; len: number }
  const segs: Seg[] = [];
  let mm = 0;
  if (shoulder > 0) { segs.push({ x0: PAD, x1: PAD + shoulder * k, req: R, act: R, d: blank.diameter, len: shoulder }); mm = shoulder; }
  ops.forEach((op, i) => {
    const req = (Math.min(op.diameter, blank.diameter) / 2) * k;
    const done = actual ? i < actual.doneOps : false;
    const active = actual && i === actual.doneOps && actual.progress > 0;
    const x0 = PAD + mm * k, x1 = PAD + (mm + op.length) * k;
    if (active) {
      const xm = x0 + (x1 - x0) * actual.progress;
      segs.push({ x0, x1: xm, req, act: req, d: op.diameter, len: op.length * actual.progress }, { x0: xm, x1, req, act: R, d: op.diameter, len: op.length * (1 - actual.progress) });
    } else segs.push({ x0, x1, req, act: actual ? (done ? req : R) : req, d: op.diameter, len: op.length });
    mm += op.length;
  });

  // контур по чертежу (без дробления активной операции)
  const outline: Seg[] = [];
  mm = 0;
  if (shoulder > 0) { outline.push({ x0: PAD, x1: PAD + shoulder * k, req: R, act: R, d: blank.diameter, len: shoulder }); mm = shoulder; }
  ops.forEach(op => { outline.push({ x0: PAD + mm * k, x1: PAD + (mm + op.length) * k, req: (Math.min(op.diameter, blank.diameter) / 2) * k, act: 0, d: op.diameter, len: op.length }); mm += op.length; });
  const upper = outline.flatMap((s, i) => (i === 0 ? [[s.x0, cy - s.req], [s.x1, cy - s.req]] : [[s.x0, cy - s.req], [s.x1, cy - s.req]]));
  const lower = [...outline].reverse().flatMap(s => [[s.x1, cy + s.req], [s.x0, cy + s.req]]);
  const path = `M${[...upper, ...lower].map(p => p.map(n => n.toFixed(1)).join(' ')).join(' L')} Z`;

  const dimH = (x0: number, x1: number, y: number, label: string, key: string) => (
    <g key={key} className="dwg__dim">
      <line x1={x0} x2={x0} y1={y - 5} y2={cy - R - 2} className="dwg__ext" />
      <line x1={x1} x2={x1} y1={y - 5} y2={cy - R - 2} className="dwg__ext" />
      <line x1={x0 + 1} x2={x1 - 1} y1={y} y2={y} markerStart={`url(#${uid}a)`} markerEnd={`url(#${uid}b)`} />
      <text x={(x0 + x1) / 2} y={y - 4} textAnchor="middle">{label}</text>
    </g>
  );

  let cursor = shoulder > 0 ? shoulder : 0;
  const lengthDims = [
    ...(shoulder > 0 ? [dimH(PAD, PAD + shoulder * k, top - 14, String(shoulder), 'sh')] : []),
    ...ops.map((op, i) => { const x0 = PAD + cursor * k; cursor += op.length; return dimH(x0, PAD + cursor * k, top - 14, String(op.length), `op${i}`); }),
  ];
  const summary = `Чертёж: заготовка Ø${blank.diameter} × ${blank.length} мм; ${ops.map(o => `участок Ø${o.diameter} × ${o.length} мм`).join(', ')}`;

  return (
    <figure className={`dwg ${className ?? ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="dwg__svg">
        <defs>
          <marker id={`${uid}a`} viewBox="0 0 8 8" refX="1" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M8 1 1 4l7 3z" className="dwg__arrow" /></marker>
          <marker id={`${uid}b`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1l7 3-7 3z" className="dwg__arrow" /></marker>
          <pattern id={`${uid}h`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" className="dwg__hatch" /></pattern>
        </defs>
        {actual && segs.map((s, i) => (
          <g key={i}>
            <rect x={s.x0} y={cy - s.act} width={Math.max(0, s.x1 - s.x0)} height={2 * s.act} className="dwg__actual" />
            {s.act > s.req + 0.5 && <>
              <rect x={s.x0} y={cy - s.act} width={s.x1 - s.x0} height={s.act - s.req} fill={`url(#${uid}h)`} className="dwg__excess" />
              <rect x={s.x0} y={cy + s.req} width={s.x1 - s.x0} height={s.act - s.req} fill={`url(#${uid}h)`} className="dwg__excess" />
            </>}
          </g>
        ))}
        <path d={path} className="dwg__outline" fill="none" />
        <line x1={PAD - 16} x2={W - PAD + 16} y1={cy} y2={cy} className="dwg__center" />
        {lengthDims}
        {outline.map((s, i) => (
          <g key={i} className="dwg__dia">
            <text x={(s.x0 + s.x1) / 2} y={cy + R + 19} textAnchor="middle">Ø{s.d}</text>
            <line x1={(s.x0 + s.x1) / 2} x2={(s.x0 + s.x1) / 2} y1={cy + s.req + 3} y2={cy + R + 6} className="dwg__ext" />
          </g>
        ))}
        <g className="dwg__dim">
          <line x1={PAD} x2={PAD} y1={cy + R + 30} y2={cy + R + 56} className="dwg__ext" />
          <line x1={W - PAD} x2={W - PAD} y1={cy + R + 30} y2={cy + R + 56} className="dwg__ext" />
          <line x1={PAD + 1} x2={W - PAD - 1} y1={cy + R + 50} y2={cy + R + 50} markerStart={`url(#${uid}a)`} markerEnd={`url(#${uid}b)`} />
          <text x={W / 2} y={cy + R + 46} textAnchor="middle">{blank.length}</text>
        </g>
      </svg>
      <figcaption>
        <dl className="dwg__block">
          <div><dt>Деталь</dt><dd>{title}</dd></div>
          <div><dt>Материал</dt><dd>{blank.material}</dd></div>
          <div><dt>Заготовка</dt><dd>Ø{blank.diameter} × {blank.length} мм</dd></div>
        </dl>
        {actual && <p className="dwg__legend"><i className="dwg__key dwg__key--line" />по чертежу <i className="dwg__key dwg__key--fill" />деталь сейчас <i className="dwg__key dwg__key--hatch" />снять</p>}
      </figcaption>
    </figure>
  );
}
