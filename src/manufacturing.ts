import { applyTurningGeometry, validateGeometry, migrateLegacyProfile, sameGeometry, type TurningGeometry, type TurningSetup, type TurningOperation, type GeometryResult } from './turningGeometry';
import {checkTurningTool,findTurningTool} from './turningTools';
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
    initialBoreDiameter?:number;
    id: string;
    name: string;
    material: string;
};
export type Part = Dimensions & {
    geometry?: TurningGeometry;
    surfaceQuality?: number;
    lastCutDepth?: number;
    blankId: string;
    material: string;
    sections: Section[];
    operationIds: string[];
};
export type Requirements = Dimensions & {
    minQuality?: number;
    maxLastCutDepth?: number;
    id: string;
    name: string;
    material: string;
    geometry?: TurningGeometry;
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
    if (op.kind === 'turning' && op.surfacePass) {
        const p:Part=previous??blankPart(blank);
        const pass=op.surfacePass;
        const beforeGeometry=geometryOf(p);
        if(!beforeGeometry.ok)throw new Error(beforeGeometry.error.message);
        if(!pass.toolId&&pass.target.kind!=='outside-turn'&&pass.target.kind!=='face')throw new Error('Для новой операции необходимо явно выбрать инструмент.');
        if(pass.toolId){const check=checkTurningTool(beforeGeometry.value,pass.target,findTurningTool(pass.toolId));if(!check.ok)throw new Error(check.error.message);}
        const result=applyTurningOperation(p,pass.setup??{chuckSide:'z0',gripLength:pass.grip},pass.target,op.id);
        if(!result.ok)throw new Error(result.error.message);
        const before=geometryOf(p),after=geometryOf(result.value);
        if(before.ok&&after.ok&&!sameGeometry(before.value,after.value)){
            result.value.surfaceQuality=pass.quality;result.value.lastCutDepth=pass.removedDepth;
        }
        return result.value;
    }
    const base: Part = previous ? structuredClone(previous) : blankPart(blank);
    if (op.kind === 'turning' && base.shape === 'cylinder') {
        if (!Number.isFinite(op.diameter) || op.diameter <= 0 || !Number.isFinite(op.length) || op.length <= 0 || blank.shape !== 'cylinder' || op.diameter > blank.diameter)
            throw new Error('Точение требует положительных размеров и не может увеличивать исходный диаметр.');
        if (base.geometry) {
            const legacy = migrateLegacyProfile(base.diameter, base.length, base.sections);
            if (!legacy.ok || !sameGeometry(legacy.value, base.geometry)) throw new Error('Для поверхностного профиля используйте applyTurningOperation, а не старую операцию добавления участка.');
        }
        base.sections.push({ diameter: op.diameter, length: op.length });
        if (near(base.sections.reduce((sum, s) => sum + s.length, 0), base.length))
            base.diameter = Math.max(...base.sections.map(s => s.diameter));
    }
    else if (op.kind === 'milling' && base.shape === 'block')
        base.height -= op.depth;
    else
        throw new Error('Операция несовместима с заготовкой.');
    if (base.shape === 'cylinder') {
        const migrated = migrateLegacyProfile(base.diameter, base.length, base.sections);
        if (!migrated.ok) throw new Error(migrated.error.message);
        base.geometry = migrated.value;
    }
    base.operationIds.push(op.id);
    return base;
}
export function expectedResult(blank: Blank, ops: readonly OperationSpec[]): Part { return ops.reduce<Part | null>((p, o) => applyOperation(blank, p, o), null)!; }
export function matches(part: Part | null, expected: Requirements): boolean {
    return matchesFreeResult(part, expected);
}
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
 if(!part||part.material!==expected.material||part.shape!==expected.shape)return false;
 if(expected.minQuality!==undefined&&(part.surfaceQuality??0)<expected.minQuality)return false;
 if(expected.maxLastCutDepth!==undefined&&(part.lastCutDepth??Infinity)>expected.maxLastCutDepth)return false;
 if(part.shape==='block')return sameDimensions(part,expected);
 if(expected.shape!=='cylinder')return false;
 const actual=geometryOf(part),wanted=geometryOf(expected);
 return actual.ok&&wanted.ok&&sameGeometry(actual.value,wanted.value);
}

/** Shared read model for drawings and visualization; no DOM, no projection units. */
export function geometryOf(part: Dimensions & {sections: readonly Section[]; geometry?: TurningGeometry}): GeometryResult<TurningGeometry> {
 if(part.shape!=='cylinder')return {ok:false,error:{code:'invalid-geometry',message:'Прямоугольная деталь не имеет осесимметричного профиля.'}};
 return part.geometry ? validateGeometry(part.geometry) : migrateLegacyProfile(part.diameter,part.length,part.sections);
}

/** Preview and manufacture call the same atomic function. Identity and material are retained. */
export function applyTurningOperation(part: Part, setup: TurningSetup, operation: TurningOperation, operationId: string): GeometryResult<Part> {
 const before=geometryOf(part); if(!before.ok)return before;
 const result=applyTurningGeometry(before.value,setup,operation); if(!result.ok)return result;
 const geometry=result.value;
 return {ok:true,value:{...structuredClone(part),length:geometry.length,geometry,
   operationIds:[...part.operationIds,operationId]}};
}

/** Atomic route evaluation for preview and execution adapters: failure exposes no intermediate part. */
export function applyTurningRoute(part: Part, setup: TurningSetup, operations: readonly {id:string;operation:TurningOperation}[]): GeometryResult<Part> {
 const initial=geometryOf(part);if(!initial.ok)return initial;
 const accessible=applyTurningGeometry(initial.value,setup,{kind:'face',length:initial.value.length});if(!accessible.ok)return accessible;
 let current=structuredClone(part);
 for(const step of operations){
  const next=applyTurningOperation(current,setup,step.operation,step.id);
  if(!next.ok)return next;
  current=next.value;
 }
 return {ok:true,value:current};
}

/** Tube stock is explicit; solid/rectangular blanks keep their existing representation. */
export function blankPart(blank:Blank):Part {
 const part:Part={...dimensions(blank),blankId:blank.id,material:blank.material,sections:[],operationIds:[]};
 if(blank.initialBoreDiameter!==undefined){
  if(blank.shape!=='cylinder'||!Number.isFinite(blank.initialBoreDiameter)||blank.initialBoreDiameter<=0||blank.initialBoreDiameter>blank.diameter-2)throw new Error('Исходное отверстие должно оставлять не менее 1 мм стенки.');
  part.geometry={length:blank.length,spans:[{z0:0,z1:blank.length,outer0:blank.diameter/2,outer1:blank.diameter/2,inner0:blank.initialBoreDiameter/2,inner1:blank.initialBoreDiameter/2}]};
 }
 return part;
}
