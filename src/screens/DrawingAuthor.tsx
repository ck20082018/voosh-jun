import {lazy,Suspense,useState} from 'react';
import {sections,type Level} from '../level';
import {compileLevel} from '../compiler';
import {dimensions,geometryOf} from '../manufacturing';
const PartInspector=lazy(()=>import('./PartInspector'));
/** Author edits go through the editor's normal level setter, undo and persistence. */
export function DrawingAuthor({level,onChange}:{level:Level;onChange:(next:Level)=>void}){
 const [open,setOpen]=useState(false);let error='';
 let drawing:Parameters<typeof PartInspector>[0]|undefined;
 if(open)try{const compiled=level.productionMode==='ready'?compileLevel(level):undefined;if(compiled&&compiled.mode!=='production')throw Error('Чертёж доступен для производственного задания.');const part=level.nodes.find(n=>n.type==='part');const requirement=level.productionMode==='player'&&part?{...dimensions(part.params),material:typeof part.params.material==='string'?part.params.material:undefined,sections:sections(part)}:compiled?.mode==='production'?Object.values(compiled.waits).at(-1)?.requirements:undefined;if(!requirement||requirement.shape!=='cylinder')throw Error('Авторская компоновка этого листа поддерживает детали вращения.');const g=geometryOf(requirement);if(!g.ok)throw Error(g.error.message);drawing={geometry:g.value,metadata:{title:level.name,material:requirement.material},settings:level.drawing?.sheet,onSettingsChange:sheet=>onChange({...level,drawing:{...level.drawing,sheet}}),onClose:()=>setOpen(false)};}catch(e){error=e instanceof Error?e.message:'Ошибка чертежа.';}
 return <><button type="button" onClick={()=>{setOpen(true);}}>Настроить чертёж</button>{error&&<p role="alert">{error}</p>}{drawing&&<Suspense fallback={<p>Загрузка чертежа…</p>}><PartInspector {...drawing}/></Suspense>}</>;
}
