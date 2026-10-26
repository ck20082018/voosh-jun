/** Millimetres. Z=0 is the chuck-side end; +Z points toward the free end. */
export interface ProfileSpan {
  z0: number; z1: number;
  outer0: number; outer1: number;
  inner0: number; inner1: number;
}
export interface TurningGeometry { length: number; spans: readonly ProfileSpan[] }
export interface TurningSetup { chuckSide: 'z0'; gripLength: number }
export type TurningOperation =
  | { kind: 'outside-turn'; z0: number; z1: number; diameter: number }
  | { kind: 'face'; length: number }
  | { kind: 'groove'; z0: number; z1: number; diameter: number }
  | { kind: 'chamfer'; end: 'free'; axialLength: number; radialDepth: number }
  | { kind: 'drill'; diameter: number; depth: number }
  | { kind: 'bore'; z0: number; z1: number; diameter: number }
  | { kind: 'thread'; surface: 'outer' | 'inner'; z0: number; z1: number; pitch: number; depth: number };
export type GeometryErrorCode = 'invalid-geometry' | 'invalid-setup' | 'invalid-size' | 'outside-stock' | 'chuck-collision' | 'adds-material' | 'wall-breakthrough' | 'unsupported-operation';
export type GeometryResult<T> = { ok: true; value: T } | { ok: false; error: { code: GeometryErrorCode; message: string } };
export const GEOMETRY_TOLERANCE_MM = 1e-6;
const close = (a: number, b: number) => Math.abs(a - b) <= GEOMETRY_TOLERANCE_MM;
const fail = (code: GeometryErrorCode, message: string): GeometryResult<never> => ({ ok: false, error: { code, message } });
const finite = (...values: number[]) => values.every(Number.isFinite);
export function validateGeometry(g: TurningGeometry): GeometryResult<TurningGeometry> {
  if (!finite(g.length) || g.length <= 0 || !g.spans.length) return fail('invalid-geometry', 'Длина детали должна быть положительной, профиль — непустым.');
  let end = 0;
  for (const s of g.spans) {
    if (!finite(s.z0,s.z1,s.outer0,s.outer1,s.inner0,s.inner1) || !close(s.z0,end) || s.z1 <= s.z0 || s.z0 < 0 || Math.min(s.outer0,s.outer1) <= 0 || Math.min(s.inner0,s.inner1) < 0 || s.inner0 > s.outer0 || s.inner1 > s.outer1)
      return fail('invalid-geometry', 'Профиль должен покрывать Z без пропусков; радиусы неотрицательны, внутренний не больше наружного.');
    end = s.z1;
  }
  return close(end,g.length) ? { ok: true, value: structuredClone(g) } : fail('invalid-geometry', 'Профиль не покрывает длину детали.');
}
const radius = (s: ProfileSpan, z: number, inner: boolean) => {
  const a = inner ? s.inner0 : s.outer0, b = inner ? s.inner1 : s.outer1;
  return a + (b - a) * (z - s.z0) / (s.z1 - s.z0);
};
function clip(s: ProfileSpan, z0: number, z1: number): ProfileSpan {
  return { z0,z1,outer0:radius(s,z0,false),outer1:radius(s,z1,false),inner0:radius(s,z0,true),inner1:radius(s,z1,true) };
}
/** Canonical spans merge only collinear continuous surfaces, preserving steps. */
export function normalizeGeometry(g: TurningGeometry): TurningGeometry {
  const spans: ProfileSpan[] = [];
  for (const s of g.spans) {
    const p = spans.at(-1);
    const continued = (v0:number,v1:number,a:number,b:number,z:number) => v1+(v1-v0)/(b-a)*(z-b);
    if (p && close(p.z1,s.z0) && close(p.outer1,s.outer0) && close(p.inner1,s.inner0)
      && close(continued(p.outer0,p.outer1,p.z0,p.z1,s.z1),s.outer1)
      && close(continued(p.inner0,p.inner1,p.z0,p.z1,s.z1),s.inner1)) {
      p.z1=s.z1; p.outer1=s.outer1; p.inner1=s.inner1;
    } else spans.push({...s});
  }
  return {length:g.length,spans};
}
export function sameGeometry(a: TurningGeometry, b: TurningGeometry): boolean {
  if (!validateGeometry(a).ok || !validateGeometry(b).ok || !close(a.length,b.length)) return false;
  // Compare on the common partition, including both sides of every step.
  const cuts = [...new Set([...a.spans,...b.spans].flatMap(s=>[s.z0,s.z1]))].sort((x,y)=>x-y);
  return cuts.slice(1).every((z1,i)=>{
    const z0=cuts[i]; if(z1-z0<=GEOMETRY_TOLERANCE_MM)return true;
    const mid=(z0+z1)/2, x=a.spans.find(s=>s.z0<=mid&&s.z1>=mid), y=b.spans.find(s=>s.z0<=mid&&s.z1>=mid);
    return !!x&&!!y&&[false,true].every(inner=>[z0,z1].every(z=>close(radius(x,z,inner),radius(y,z,inner))));
  });
}
/** Explicit migration: old sections follow the unprocessed chuck-side shoulder. */
export function migrateLegacyProfile(diameter: number, length: number, sections: readonly { diameter: number; length: number }[]): GeometryResult<TurningGeometry> {
  if (!finite(diameter,length) || diameter<=0 || length<=0 || sections.some(s=>!finite(s.diameter,s.length)||s.diameter<=0||s.length<=0)) return fail('invalid-size','Размеры старой детали должны быть положительными.');
  const shoulder=length-sections.reduce((sum,s)=>sum+s.length,0);
  if (shoulder < -GEOMETRY_TOLERANCE_MM) return fail('outside-stock','Сумма длин старых участков превышает длину детали.');
  let z=0;
  const spans=[...(shoulder>GEOMETRY_TOLERANCE_MM?[{diameter,length:shoulder}]:[]),...sections].map(s=>{
    const span={z0:z,z1:z+s.length,outer0:s.diameter/2,outer1:s.diameter/2,inner0:0,inner1:0};z=span.z1;return span;
  });
  return validateGeometry(normalizeGeometry({length,spans}));
}
export function applyTurningGeometry(g: TurningGeometry, setup: TurningSetup, op: TurningOperation): GeometryResult<TurningGeometry> {
  const valid=validateGeometry(g); if(!valid.ok)return valid;
  if(setup.chuckSide!=='z0'||!finite(setup.gripLength)||setup.gripLength<=0||setup.gripLength>=g.length) return fail('invalid-setup','Укажите положительную длину закрепления у Z=0, меньше длины детали.');
  if(op.kind!=='outside-turn'&&op.kind!=='face')return fail('unsupported-operation','Эта операция пока не реализована.');
  if(op.kind==='face') {
    if(!finite(op.length)||op.length<=0)return fail('invalid-size','Конечная длина должна быть положительной.');
    if(op.length>g.length)return fail('adds-material','Подрезка не может увеличивать длину детали.');
    if(op.length<=setup.gripLength)return fail('chuck-collision','Свободный торец не может находиться внутри патрона.');
    return {ok:true,value:normalizeGeometry({length:op.length,spans:g.spans.filter(s=>s.z0<op.length).map(s=>clip(s,s.z0,Math.min(s.z1,op.length)))})};
  }
  if(!finite(op.z0,op.z1,op.diameter)||op.diameter<=0||op.z0<0||op.z1<=op.z0)return fail('invalid-size','Нужны положительный диаметр и интервал Z0 < Z1.');
  if(op.z1>g.length)return fail('outside-stock','Интервал выходит за свободный торец.');
  if(op.z0<setup.gripLength)return fail('chuck-collision','Инструмент не может входить в область патрона.');
  const spans:ProfileSpan[]=[];
  for(const s of g.spans) {
    const cuts=[s.z0,...[op.z0,op.z1].filter(z=>z>s.z0&&z<s.z1),s.z1].sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++) {
      const p=clip(s,cuts[i-1],cuts[i]);
      if(p.z0>=op.z0&&p.z1<=op.z1) {
        const r=op.diameter/2;
        if(r>Math.min(p.outer0,p.outer1))return fail('adds-material','Заданный диаметр больше существующей поверхности на части интервала.');
        if(r<Math.max(p.inner0,p.inner1))return fail('wall-breakthrough','Наружный радиус не может быть меньше радиуса отверстия.');
        p.outer0=r;p.outer1=r;
      }
      spans.push(p);
    }
  }
  return {ok:true,value:normalizeGeometry({length:g.length,spans})};
}

/** Shared exact meridian data for both a drawing and a mesh builder. Steps have two vertices at the same Z. */
export function turningSurfaceData(g: TurningGeometry): GeometryResult<{
  length: number; outer: readonly {z:number;radius:number}[]; inner: readonly {z:number;radius:number}[];
}> {
  const valid=validateGeometry(g);if(!valid.ok)return valid;
  return {ok:true,value:{length:g.length,
    outer:g.spans.flatMap(s=>[{z:s.z0,radius:s.outer0},{z:s.z1,radius:s.outer1}]),
    inner:g.spans.flatMap(s=>[{z:s.z0,radius:s.inner0},{z:s.z1,radius:s.inner1}])}};
}
