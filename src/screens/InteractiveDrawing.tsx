import {useEffect,useId,useState} from 'react';
import type {TurningGeometry} from '../turningGeometry';
import {clippedSpans,compareDrawing,dimensionText,drawingDimensions,drawingFrame,materialStrips,meridianPaths,mm,pointsPath,projectMeridian,sectionContours,validDrawing,volumeContours,volumeFaces,type DrawingDisplay,type DrawingFrame,type DrawingSelection,type DrawingView} from '../drawingGeometry';
const VIEW_NAMES:Record<DrawingView,string>={main:'Главный вид',end:'Свободный торец',section:'Продольный разрез',detail:'Увеличенная деталь',volume:'Объёмная модель'};
const overlaps=(s:{z0:number;z1:number},r:DrawingSelection|null)=>!!r&&(s.z0===s.z1?s.z0>=r.z0&&s.z0<=r.z1:Math.min(s.z1,r.z1)>Math.max(s.z0,r.z0));
export interface InteractiveDrawingProps {
 geometry:TurningGeometry; title:string; display?:DrawingDisplay;
 result?:TurningGeometry; selection?:DrawingSelection|null; onSelect?:(selection:DrawingSelection|null)=>void;
 tool?:{kind?:'drill'|'bore';z:number;radius:number;direction:'z'|'x';rotating:boolean};
}
/** Readonly geometry in, selection callbacks out. No production rules or core access. */
export function InteractiveDrawing(props:InteractiveDrawingProps){
 const {geometry,result,title,display={},tool}=props;
 const uid=useId();
 const [local,setLocal]=useState<DrawingSelection|null>(null),[view,setView]=useState<DrawingView>(()=>geometry.spans.some(s=>s.inner0>0||s.inner1>0)?'section':'main'),[zoom,setZoom]=useState(1),[compare,setCompare]=useState(!!result),[cutaway,setCutaway]=useState(true);
 const requested=props.selection===undefined?local:props.selection;
 const selected=requested&&Number.isFinite(requested.z0)&&Number.isFinite(requested.z1)&&requested.z0>=0&&requested.z1>=requested.z0?requested:null;
 useEffect(()=>{if(selected?.surface==='inner'&&(!display.views||display.views.includes('section')))setView('section');},[selected?.surface,selected?.z0,selected?.z1,display.views]);
 const error=validDrawing(geometry)??(result?validDrawing(result):null);
 if(error)return <figure className="interactive-drawing"><p role="alert">{error}</p></figure>;
 const hasHole=geometry.spans.some(s=>s.inner0>0||s.inner1>0)||(result?.spans.some(s=>s.inner0>0||s.inner1>0)??false);
 const views=display.views?.length?[...new Set(display.views)]:hasHole?['main','end','section','volume'] as DrawingView[]:['main','volume'] as DrawingView[];
 const active=views.includes(view)?view:views[0];
 const shown=result&&!compare?result:geometry;
 const baseFrame=drawingFrame(geometry,...result?[result]:[]);
 const extent=Math.max(baseFrame.length,selected?.z1??0);
 const frame={...baseFrame,length:extent,scale:Math.min(490/extent,150/baseFrame.radius)};
 const dimensions=drawingDimensions(shown,display),differences=result?compareDrawing(geometry,result,display):[];
 const select=(s:DrawingSelection|null)=>{setLocal(s);props.onSelect?.(s);if(s?.surface==='inner'&&views.includes('section'))setView('section');};
 const focus=active==='detail'?(selected??(display.detail?{...display.detail,surface:'outer' as const}:null)):null;
 const f=focus?detailFrame(frame,focus,shown):frame;
 const center=focus?(focus.z0+focus.z1)/2:(shown.length/2);
 const cx=active==='end'?310:f.left+center*f.scale,cy=205;
 const paths=meridianPaths(shown,f);
 const highlight=selected?clippedSpans(shown,selected.z0,selected.z1):[];
 const selectedLabel=selected?`Выбран ${selected.surface==='inner'?'внутренний размер':selected.surface==='outer'?'наружный размер':'интервал'} Z${mm(selected.z0)}–${mm(selected.z1)} мм`:'Размер не выбран';
 return <figure className="interactive-drawing" aria-label={title}>
 <figcaption><strong>{title}</strong><span>Размеры в мм · геометрическая учебная схема</span></figcaption>
 <div className="idraw-toolbar" role="group" aria-label="Представления чертежа">
 {views.map(v=><button key={v} type="button" aria-pressed={active===v} onClick={()=>setView(v)}>{VIEW_NAMES[v]}</button>)}
 <button type="button" disabled={zoom>=3} aria-label="Увеличить чертёж" onClick={()=>setZoom(z=>Math.min(3,z+.5))}>+</button><button type="button" disabled={zoom<=.5} aria-label="Уменьшить чертёж" onClick={()=>setZoom(z=>Math.max(.5,z-.5))}>−</button><button type="button" onClick={()=>{setZoom(1);setView(views[0]);select(null);}}>Общий вид</button>
 {result&&<label><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/>Сравнить с заказом</label>}
 {active==='volume'&&hasHole&&<label><input type="checkbox" checked={cutaway} onChange={e=>setCutaway(e.target.checked)}/>Учебное раскрытие полости</label>}
 </div>
 {requested&&!selected&&<p role="status">Некорректный интервал операции: исправьте координаты. Геометрия заказа не изменена.</p>}
 <p className="idraw-status" role="status">{selectedLabel} · масштаб {Math.round(zoom*100)}%</p>
 <svg className="idraw-canvas" viewBox="0 0 620 410" role="img" aria-label={`${title} · ${VIEW_NAMES[active]} · ${selectedLabel}`}>
 <defs><pattern id={`${uid}-hatch`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V7" stroke="#69788a" strokeWidth="1"/></pattern><clipPath id={`${uid}-clip`}><rect x="10" y="20" width="600" height="365"/></clipPath></defs>
 <g clipPath={`url(#${uid}-clip)`}>
 <g transform={`translate(${cx} ${cy}) scale(${zoom}) translate(${-cx} ${-cy})`}>
 {active==='volume'?<><Volume geometry={shown} frame={frame} cutaway={cutaway&&hasHole} selected={selected}/>{compare&&result&&<g aria-label="Фактическая объёмная форма — пунктир">{volumeContours(result,frame,cutaway&&hasHole).map((path,i)=><path key={i} d={path} fill="none" stroke="#a84228" strokeWidth=".8" strokeDasharray="4 3"/>)}</g>}</>:
 active==='end'?<EndView geometry={shown} frame={frame} selected={selected} result={compare?result:undefined}/>:
 <>
 {active==='section'||active==='detail'?<g data-material-region="section">{materialStrips(shown,f).map((path,i)=><path key={i} d={path} fill={`url(#${uid}-hatch)`} stroke="none" data-hatched-material="true"/>)}</g>:<path d={paths.outer} fill="#c9d8de" stroke="#253a50" strokeWidth="2"/>}
 {active==='section'||active==='detail'?<g aria-label="Контуры материала">{sectionContours(shown,f).map((path,i)=><path key={i} d={path} fill="none" stroke="#253a50" strokeWidth="1.7"/>)}</g>:<path d={paths.outer} fill="none" stroke="#253a50" strokeWidth="2"/>}
 {hasHole&&active==='main'&&<path d={paths.inner} data-inner-contour="true" fill="none" stroke="#253a50" strokeWidth="1.6" strokeDasharray={active==='main'?'6 4':undefined}/>}
 {compare&&result&&<g aria-label="Фактический профиль — пунктир">{(active==='section'||active==='detail'?sectionContours(result,f):[meridianPaths(result,f).outer,meridianPaths(result,f).inner]).map((path,i)=><path key={i} d={path} fill="none" stroke="#a84228" strokeWidth="2" strokeDasharray="7 4"/>)}</g>}
 <line x1={f.left-15} x2={f.left+shown.length*f.scale+15} y1={f.axis} y2={f.axis} stroke="#647286" strokeDasharray="12 4 2 4"/>
 {active!=='detail'&&<><text x={f.left} y="375">Z=0 · сторона патрона</text><text x={f.left+shown.length*f.scale} y="375" textAnchor="end">Z={mm(shown.length)} · свободный торец</text></>}
 {selected&&<rect data-selection-envelope="true" x={f.left+selected.z0*f.scale} y="55" width={Math.max(1,(selected.z1-selected.z0)*f.scale)} height="280" fill="none" stroke="#814c12" strokeWidth="2" strokeDasharray="4 3"/>}
 {highlight.map((s,i)=><g key={i} data-selected-region={`${mm(s.z0)}:${mm(s.z1)}:${selected?.surface}`}>
 {selected?.surface==='inner'?<path d={pointsPath([projectMeridian(s.z0,s.inner0,f),projectMeridian(s.z1,s.inner1,f)],false)+' '+pointsPath([projectMeridian(s.z0,-s.inner0,f),projectMeridian(s.z1,-s.inner1,f)],false)} fill="none" stroke="#814c12" strokeDasharray="4 3" strokeWidth="3"/>:<path d={materialStrips({length:shown.length,spans:[s]},f).join(' ')} fill="#f4bf5b55" stroke="#814c12" strokeDasharray="4 3" strokeWidth="2.5"/>}
 <text x={f.left+(s.z0+s.z1)/2*f.scale} y="42" textAnchor="middle">Выбрано Z{mm(s.z0)}–{mm(s.z1)}</text></g>)}
 {tool&&<g aria-label="Положение инструмента"><path d={`M${projectMeridian(tool.z,tool.radius,f).x} ${projectMeridian(tool.z,tool.radius,f).y}${tool.kind==='drill'?`m0 ${-4*f.scale}h65v${8*f.scale}h-65z`:tool.kind==='bore'?'l12 8h42v8h-42z':'l12 -20h22v20z'}`} fill="#e7b54b" stroke="#253a50"/><text x={projectMeridian(tool.z,tool.radius,f).x} y={projectMeridian(tool.z,tool.radius,f).y-28}>{tool.direction==='x'?'↓ X':'← Z'}</text>{tool.rotating&&<text x="490" y="60">↻ Вращение</text>}</g>}
 {active==='detail'&&display.detail?.thread&&<g aria-label="Условное обозначение резьбы — не винтовая геометрия"><path d={threadLine(shown,f,display.detail)} stroke="#253a50" strokeWidth="1"/><text x="40" y="62">Резьба условно · P{mm(display.detail.thread.pitch)} мм · {display.detail.thread.surface==='inner'?'внутренняя':'наружная'}</text></g>}
 </>}
 </g></g>
 </svg>
 {active==='detail'&&<p>{display.detail?.label??(focus?'Увеличен выбранный участок':'Выберите размер для увеличения')}. Размеры исходные{focus?', масштаб увеличен':''}. {display.detail?.thread&&'Линия резьбы условная; профиль зубьев и винтовая поверхность не вычисляются.'}</p>}
 {active==='volume'&&<p>Объёмная учебная проекция{cutaway&&hasHole?' с удалённой четвертью для показа внутренней поверхности':''}. Раскрытие не изменяет геометрию детали.</p>}
 {compare&&result&&<p>Заказ — сплошная линия; фактический профиль — пунктир. ✕ означает несовпадение.</p>}
 <div className="idraw-dimensions" aria-label="Размеры детали">
 {dimensions.map(d=>{const diff=compare&&differences.find(x=>x.dimension.id===d.id);const chosen=selected?.id===d.id;return <button type="button" key={d.id} data-dimension-id={d.id} data-mismatch={!!diff} aria-pressed={chosen} onClick={()=>select({...d})}><b>{diff?'✕ ':chosen?'▶ ':''}{d.label??(d.kind==='inner'?'Внутренний диаметр':d.kind==='outer'?'Наружный диаметр':'Длина участка')}</b> {dimensionText(shown,d)}<small>Z{mm(d.z0)}–{mm(d.z1)}{diff?` · факт: ${diff.actual}`:''}</small></button>;})}
 </div>
 {selected?.surface==='inner'&&!views.includes('section')&&<p>Разрез скрыт автором этого задания; область отмечена в доступных видах.</p>}
 {compare&&result&&<div className="idraw-comparison" aria-label="Сравнение с заказом">{differences.length?<ul>{differences.map(d=><li key={d.dimension.id}><button type="button" onClick={()=>select(d.dimension)}>Показать несовпадение</button> ✕ {d.message}</li>)}</ul>:<p>✓ Геометрия соответствует заказу.</p>}</div>}
 <p className="idraw-note">Диаметр = 2 × радиус. Выделение обозначено контуром, штриховой линией и подписью, а не только цветом. Схема не заявляет соответствие стандартам оформления.</p>
 </figure>;
}
function detailFrame(f:DrawingFrame,region:DrawingSelection,g:TurningGeometry):DrawingFrame{
 const length=Math.max(.1,region.z1-region.z0),spans=clippedSpans(g,region.z0,region.z1);
 const radii=spans.flatMap(s=>region.surface==='inner'?[s.inner0,s.inner1]:[s.outer0,s.outer1]);
 const low=radii.length?Math.min(...radii):0,high=radii.length?Math.max(...radii):0;
 const scale=Math.min(480/length,280/Math.max(2,high-low)),r=(low+high)/2;
 return {...f,scale,left:60-region.z0*scale,axis:205+r*scale};
}
function EndView({geometry,frame,selected,result}:{geometry:TurningGeometry;frame:DrawingFrame;selected:DrawingSelection|null;result?:TurningGeometry}){
 const end=geometry.spans.at(-1)!,selectedAtEnd=!!selected&&selected.z0<geometry.length&&selected.z1>=geometry.length,k=Math.min(145/frame.radius,12),outer=end.outer1*k,inner=end.inner1*k;
 return <g transform="translate(310 205)"><path d={`M${outer} 0A${outer} ${outer} 0 1 0 ${-outer} 0A${outer} ${outer} 0 1 0 ${outer} 0 ${inner>0?`M${inner} 0A${inner} ${inner} 0 1 1 ${-inner} 0A${inner} ${inner} 0 1 1 ${inner} 0`:''}`} fill="#c9d8de" fillRule="evenodd" stroke="#253a50" strokeWidth="2"/>
 <circle cx="0" cy="0" r={outer} fill="none" stroke="#253a50"/>{inner>0&&<circle r={inner} fill="none" stroke="#253a50"/>}
 <line x1={-outer-20} x2={outer+20} y1="0" y2="0" stroke="#647286" strokeDasharray="12 4 2 4"/><line y1={-outer-20} y2={outer+20} x1="0" x2="0" stroke="#647286" strokeDasharray="12 4 2 4"/>
 {selectedAtEnd&&<circle data-selected-region={`${end.z0}:${end.z1}:${selected?.surface}`} r={selected?.surface==='inner'?inner:outer} fill="none" stroke="#814c12" strokeDasharray="4 3" strokeWidth="4"/>}
 {result&&<g aria-label="Фактический торец — пунктир"><circle r={result.spans.at(-1)!.outer1*k} fill="none" stroke="#a84228" strokeDasharray="6 4" strokeWidth="2"/>{result.spans.at(-1)!.inner1>0&&<circle r={result.spans.at(-1)!.inner1*k} fill="none" stroke="#a84228" strokeDasharray="6 4" strokeWidth="2"/>}</g>}
 <text x="0" y={outer+35} textAnchor="middle">Свободный торец Z={mm(geometry.length)}: Ø{mm(end.outer1*2)}{inner?` · отверстие Ø${mm(end.inner1*2)}`:' · сплошной'}</text>
 {selected&&!selectedAtEnd&&<text x="0" y={outer+55} textAnchor="middle">Выбранный участок находится за торцом; смотрите разрез.</text>}
 </g>;
}
function Volume({geometry,frame,cutaway,selected}:{geometry:TurningGeometry;frame:DrawingFrame;cutaway:boolean;selected:DrawingSelection|null}){
 const partition=selected?{length:geometry.length,spans:[...clippedSpans(geometry,0,selected.z0),...clippedSpans(geometry,selected.z0,selected.z1),...clippedSpans(geometry,selected.z1,geometry.length)]}:geometry;
 return <g aria-label="Объёмная форма по профилю">{volumeFaces(partition,frame,cutaway).map((face,i)=>{
 const chosen=overlaps(face,selected)&&(selected?.surface==='inner'?face.surface==='inner':selected?.surface==='outer'?face.surface==='outer':true);
 const color=face.surface==='inner'?'#758b9a':face.surface==='cut'?'#e0c88d':face.surface==='end'?'#a3bac6':`hsl(197 22% ${64+face.shade*12}%)`;
 return <path key={i} d={face.path} data-surface={face.surface} data-selected-region={chosen?`${mm(face.z0)}:${mm(face.z1)}:${selected?.surface}`:undefined} fill={chosen?'#e5c07d':color} stroke={chosen?'#814c12':'#526b7b'} strokeWidth={chosen?1.7:.45} strokeDasharray={chosen?'4 2':undefined}/>;
 })}{selected&&<text x="50" y="40">Выбрано Z{mm(selected.z0)}–{mm(selected.z1)} · {selected.surface==='inner'?'внутренняя поверхность':'наружная область'}</text>}</g>;
}

/** Compact, noninteractive view for catalog cards: no nested buttons inside selection buttons. */
export function GeometryPreview({geometry,label}:{geometry:TurningGeometry;label:string}){
 const error=validDrawing(geometry);if(error)return <p role="alert">{error}</p>;
 return <svg viewBox="0 0 620 410" role="img" aria-label={label}><Volume geometry={geometry} frame={drawingFrame(geometry)} cutaway={geometry.spans.some(s=>s.inner0>0||s.inner1>0)} selected={null}/></svg>;
}

function threadLine(g:TurningGeometry,f:DrawingFrame,detail:NonNullable<DrawingDisplay['detail']>){
 const s=clippedSpans(g,detail.z0,detail.z1)[0];if(!s)return '';
 const r=detail.thread?.surface==='inner'?s.inner0+.3:s.outer0-.3;
 return pointsPath([projectMeridian(detail.z0,r,f),projectMeridian(detail.z1,r,f)],false);
}
