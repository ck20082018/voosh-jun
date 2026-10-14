import type { OperationSpec, Params, Section } from './level';
export type Dimensions = {
    shape: 'cylinder';
    diameter: number;
    length: number;
} | {
    shape: 'block';
    length: number;
    width: number;
    height: number;
};
export type Blank = Dimensions & {
    id: string;
    name: string;
    material: string;
};
export type Part = Dimensions & {
    blankId: string;
    material: string;
    sections: Section[];
    operationIds: string[];
};
export type Requirements = Dimensions & {
    id: string;
    name: string;
    material: string;
    sections: Section[];
};
// Millimetres: absolute tolerance 0.000001 mm plus relative 1e-9 for arithmetic rounding.
export function near(a: number, b: number): boolean { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 + 1e-9 * Math.max(Math.abs(a), Math.abs(b)); }
export function dimensions(p: Record<string, unknown>, prefix = ''): Dimensions {
    const key = (name: string) => prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name;
    return p[key('shape')] === 'block' ? { shape: 'block', length: Number(p[key('length')]), width: Number(p[key('width')]), height: Number(p[key('height')]) } : { shape: 'cylinder', diameter: Number(p[key('diameter')]), length: Number(p[key('length')]) };
}
export function sameDimensions(a: Dimensions, b: Dimensions): boolean { return a.shape === b.shape && near(a.length, b.length) && (a.shape === 'cylinder' && b.shape === 'cylinder' ? near(a.diameter, b.diameter) : a.shape === 'block' && b.shape === 'block' && near(a.width, b.width) && near(a.height, b.height)); }
export function sameOperations(actual: readonly OperationSpec[], expected: readonly OperationSpec[]): boolean { return actual.length === expected.length && actual.every((a, i) => { const b = expected[i]; return a.kind === b.kind && near(a.seconds, b.seconds) && (a.kind === 'turning' && b.kind === 'turning' ? near(a.diameter, b.diameter) && near(a.length, b.length) : a.kind === 'milling' && b.kind === 'milling' && near(a.depth, b.depth)); }); }
export function applyOperation(blank: Blank, previous: Part | null, op: OperationSpec): Part {
    const base: Part = previous ? structuredClone(previous) : { ...(blank.shape === 'cylinder' ? { shape: 'cylinder' as const, diameter: blank.diameter, length: blank.length } : { shape: 'block' as const, length: blank.length, width: blank.width, height: blank.height }), blankId: blank.id, material: blank.material, sections: [], operationIds: [] };
    if (op.kind === 'turning' && base.shape === 'cylinder') {
        base.sections.push({ diameter: op.diameter, length: op.length });
        if (near(base.sections.reduce((sum, s) => sum + s.length, 0), base.length))
            base.diameter = Math.max(...base.sections.map(s => s.diameter));
    }
    else if (op.kind === 'milling' && base.shape === 'block')
        base.height -= op.depth;
    else
        throw new Error('Операция несовместима с заготовкой.');
    base.operationIds.push(op.id);
    return base;
}
export function expectedResult(blank: Blank, ops: readonly OperationSpec[]): Part { return ops.reduce<Part | null>((p, o) => applyOperation(blank, p, o), null)!; }
export function matches(part: Part | null, expected: Requirements): boolean { return !!part && part.material === expected.material && sameDimensions(part, expected) && (expected.shape === 'cylinder' && expected.sections.length === 0 ? part.sections.every(s => near(s.diameter, expected.diameter)) : part.sections.length === expected.sections.length && part.sections.every((s, i) => near(s.diameter, expected.sections[i].diameter) && near(s.length, expected.sections[i].length))); }
export function dimensionText(d: Dimensions): string { return d.shape === 'cylinder' ? `Ø${d.diameter} × ${d.length} мм` : `${d.length} × ${d.width} × ${d.height} мм`; }

export interface Configuration {
    machineKind?: string;
    toolKind?: string;
    blank?: Dimensions & {material:string};
    operations?: OperationSpec[];
}
export interface ConfigurationCheck {actual:Configuration;expected:Configuration}
export function matchesConfiguration({actual,expected}:ConfigurationCheck):boolean {
    if(expected.machineKind!==undefined&&actual.machineKind!==expected.machineKind)return false;
    if(expected.toolKind!==undefined&&actual.toolKind!==expected.toolKind)return false;
    if(expected.blank&&(!actual.blank||actual.blank.material!==expected.blank.material||!sameDimensions(actual.blank,expected.blank)))return false;
    if(expected.operations&&(!actual.operations||!sameOperations(actual.operations,expected.operations)))return false;
    return true;
}

// In free planning, neighbouring sections with the same diameter describe the same geometry.
export function cylinderProfile(part:Dimensions & {sections:readonly Section[]}):Section[]{
 if(part.shape!=='cylinder')return [];
 const out:Section[]=[];const shoulder=Math.max(0,part.length-part.sections.reduce((s,o)=>s+o.length,0));
 for(const section of [...(shoulder>1e-6?[{diameter:part.diameter,length:shoulder}]:[]),...part.sections]){
  if(section.length<=1e-6)continue;const last=out[out.length-1];if(last&&near(last.diameter,section.diameter))last.length+=section.length;else out.push({...section});
 }return out;
}
export function matchesFreeResult(part:Part|null,expected:Requirements):boolean{
 if(!part||part.material!==expected.material||!sameDimensions(part,expected))return false;
 if(part.shape==='block')return true;
 const actual=cylinderProfile(part),wanted=cylinderProfile(expected);
 return actual.length===wanted.length&&actual.every((s,i)=>near(s.diameter,wanted[i].diameter)&&near(s.length,wanted[i].length));
}
