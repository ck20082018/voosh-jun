import {lazy,Suspense,useMemo,useState} from 'react';
import type {TurningGeometry} from '../turningGeometry';
import type {DrawingSelection} from '../drawingGeometry';
import {INK,makeSheet,selectionOnSheet,scaleLabel,type DrawingMetadata,type Primitive,type SheetSettings} from '../drawing/sheet';
import {downloadDrawing,primitivePath,sheetPDF,sheetSVG} from '../drawing/export';
import metrics from '../drawing/fontMetrics.json';
import fontURL from '../drawing/Onest-Regular.ttf?url';
import './part-inspector.css';
const PartViewer=lazy(()=>import('./PartViewer'));
export interface EngineeringProps {geometry:Readonly<TurningGeometry>;metadata:DrawingMetadata;settings?:SheetSettings;selection?:DrawingSelection|null;onSelect?:(s:DrawingSelection|null)=>void;onSettingsChange?:(s:SheetSettings)=>void;result?:Readonly<TurningGeometry>}
export default function EngineeringSheet(props:EngineeringProps){
 const [settings,setSettings]=useState<SheetSettings>(props.settings??{}),[mode,setMode]=useState<'teaching'|'clean'>('teaching'),[source,setSource]=useState<'order'|'actual'>('order'),[selection,setSelection]=useState<DrawingSelection|null>(props.selection??null),[open3D,setOpen3D]=useState(false),[zoom,setZoom]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const geometry=source==='actual'&&props.result?props.result:props.geometry;
 const sheet=useMemo(()=>makeSheet(geometry,props.metadata,settings),[geometry,props.metadata,settings]);
 const selected=props.selection===undefined?selection:props.selection;
 const select=(s:DrawingSelection|null)=>{setSelection(s);props.onSelect?.(s);};
 const change=(s:SheetSettings)=>{setSettings(s);props.onSettingsChange?.(s);};
 const exportDrawing=async(kind:'svg'|'pdf')=>{setBusy(true);setError('');try{if(sheet.warnings.length)throw Error('Исправьте размещение: выберите больший формат, меньший масштаб или сбросьте смещение надписи.');if(kind==='svg')downloadDrawing(await sheetSVG(sheet),'drawing.svg','image/svg+xml');else downloadDrawing((await sheetPDF(sheet)).buffer as ArrayBuffer,'drawing.pdf','application/pdf');}catch(e){setError(e instanceof Error?e.message:'Не удалось экспортировать чертёж.');}finally{setBusy(false);}};
 return <section className="engineering-sheet" aria-label="Чертёж на листе">
 <style>{`@font-face{font-family:DrawingOnest;src:url('${fontURL}') format('truetype');font-weight:400}`}</style>
 <div className="inspector-toolbar">
 <label>Режим<select aria-label="Режим чертежа" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="teaching">Учебный</option><option value="clean">Чистовой</option></select></label>
 <label>Формат<select value={settings.format??'A4'} onChange={e=>change({...settings,format:e.target.value as 'A4'|'A3'})}><option>A4</option><option>A3</option></select></label>
 <label>Масштаб изображения<select value={settings.scale??1} onChange={e=>change({...settings,scale:Number(e.target.value) as SheetSettings['scale']})}>{([.25,.5,1,2,4] as const).map(k=><option key={k} value={k}>{scaleLabel(k)}</option>)}</select></label>
 {props.result&&<label>Источник<select value={source} onChange={e=>{setSource(e.target.value as typeof source);select(null);}}><option value="order">Заказ</option><option value="actual">Фактическая деталь</option></select></label>}
 <label><input type="checkbox" checked={settings.views?.includes('end')??false} onChange={e=>change({...settings,views:e.target.checked?['end']:[]})}/>Торцевой вид</label>
 <button type="button" onClick={()=>setZoom(z=>Math.min(3,z+.25))} aria-label="Увеличить лист">+</button><button type="button" onClick={()=>setZoom(z=>Math.max(.5,z-.25))} aria-label="Уменьшить лист">−</button><button type="button" onClick={()=>setZoom(1)}>Общий вид листа</button>
 {selected&&<button type="button" onClick={()=>change({...settings,detail:{z0:selected.z0,z1:selected.z1,scale:2,surface:selected.surface==='inner'?'inner':'outer'}})}>Увеличить участок</button>}{settings.detail&&<button type="button" onClick={()=>change({...settings,detail:undefined})}>Убрать выносной элемент</button>}
 <button type="button" disabled={busy} onClick={()=>void exportDrawing('svg')}>Экспорт SVG</button><button type="button" disabled={busy} onClick={()=>void exportDrawing('pdf')}>Экспорт PDF</button><button type="button" aria-pressed={open3D} onClick={()=>setOpen3D(v=>!v)}>{open3D?'Закрыть 3D':'Открыть 3D'}</button>
 </div>
 <p>{source==='order'?'Независимые требования заказа':'Фактическая геометрия результата'}. Размеры в миллиметрах. {geometry.spans.some(s=>s.inner0||s.inner1)?'Главное изображение — продольный разрез по оси симметрии.':''} Чистовой экспорт не содержит учебного выделения.</p>
 <div className="engineering-sheet__scroll"><svg className="engineering-sheet__paper" style={{width:`${zoom*100}%`}} viewBox={`0 0 ${sheet.width} ${sheet.height}`} width={`${sheet.width}mm`} height={`${sheet.height}mm`} role="img" aria-label={`Лист ${sheet.format}: ${props.metadata.title}, ${scaleLabel(sheet.scale)}`}>
 {sheet.items.map((p,i)=>p.kind==='text'?<g key={i} data-dimension={p.dimension?.id} role={p.dimension&&mode==='teaching'?'button':undefined} tabIndex={p.dimension&&mode==='teaching'?0:undefined} aria-label={p.dimension?`Размер ${p.text}`:undefined} onClick={()=>{if(p.dimension&&mode==='teaching')select(p.dimension);}} onKeyDown={e=>{if(p.dimension&&mode==='teaching'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select(p.dimension);}}}><rect {...p.box} fill="white" stroke="none"/><text x={p.x} y={p.y} fontFamily="DrawingOnest" fontSize={p.height/metrics.capRatio} fill="black" textAnchor={p.anchor} transform={p.rotation?`rotate(${p.rotation} ${p.x} ${p.y})`:undefined}>{p.text}</text></g>:<SheetPath key={i} primitive={p}/>)}
 {mode==='teaching'&&selected&&<g className="engineering-sheet__selection" aria-label={`Выбрано Z${selected.z0}–${selected.z1}`}>{selectionOnSheet(geometry,selected,sheet).map((p,i)=>p.kind!=='text'&&<path key={i} d={primitivePath(p)}/>)}</g>}
 </svg></div>
 {sheet.warnings.map(w=><p key={w} role="alert">{w}</p>)}{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Подготовка векторного файла…</p>}
 {selected&&mode==='teaching'&&<p role="status">Выбрано: Z{selected.z0}–{selected.z1}; {selected.surface==='inner'?'внутренняя поверхность':selected.surface==='outer'?'наружная поверхность':'длина'}. Выделение показано отдельной штриховой линией. <button type="button" onClick={()=>select(null)}>Снять выделение</button></p>}
 {props.onSettingsChange&&selected?.id&&<fieldset><legend>Автор: смещение надписи на листе, мм</legend>{(['x','y'] as const).map(axis=><label key={axis}>{axis}<input type="number" step=".5" value={settings.dimensionOffsets?.[selected.id!]?.[axis]??0} onChange={e=>{const id=selected.id!,old=settings.dimensionOffsets?.[id]??{x:0,y:0};change({...settings,dimensionOffsets:{...settings.dimensionOffsets,[id]:{...old,[axis]:Number(e.target.value)}}});}}/></label>)}<button type="button" onClick={()=>change({...settings,dimensionOffsets:{...settings.dimensionOffsets,[selected.id!]:{x:0,y:0}}})}>Сбросить смещение</button></fieldset>}
 {open3D&&<Suspense fallback={<p role="status">Загрузка 3D…</p>}><PartViewer geometry={geometry} title={props.metadata.title} selection={mode==='teaching'?selected:null}/></Suspense>}
 <p>Печать: 100% / «Фактический размер». «Вписать в страницу» меняет масштаб. Размер страницы: {sheet.width} × {sheet.height} мм. Экранное увеличение листа на экспорт не влияет.</p>
 <p>Оформление поддерживаемых учебных деталей основано на проверенных правилах ЕСКД. Допуски и шероховатость не заданы; это учебный чертёж, не полный производственный документ.</p>
 </section>;
}
function SheetPath({primitive:p}:{primitive:Exclude<Primitive,{kind:'text'}>}){return <path d={primitivePath(p)} fill={p.kind==='path'&&p.fill?'black':'none'} stroke="black" strokeWidth={INK[p.ink].width} strokeDasharray={INK[p.ink].dash?.join(' ')} data-line-type={p.ink} data-hatch={p.kind==='path'?p.role:undefined}/>;}
