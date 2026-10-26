import {useState} from 'react';
import {DRAWING_FIXTURES} from '../drawingFixtures';
import {millingLevel} from '../level';
import {compileLevel} from '../compiler';
import {applyOperation} from '../manufacturing';
import {PartPreview} from '../PartPreview';
import {DrawingSheet} from './DrawingSheet';
import {InteractiveDrawing} from './InteractiveDrawing';
/** Developer-only visual inspection; never a playable drilling/grooving command. */
export function DrawingFixtures(){
 const [id,setId]=useState('blind');const fixture=DRAWING_FIXTURES.find(f=>f.id===id)??DRAWING_FIXTURES[0];
 const actual=structuredClone(fixture.geometry);actual.spans=actual.spans.map((s,i)=>i===actual.spans.length-1?{...s,outer0:s.outer0-1,outer1:s.outer1-1}:s);
 return <main className="page"><h1>Геометрические фикстуры чертежа</h1><p>Проверка отображения. Сверление, канавка, фаска и резьба здесь не являются доступными операциями игрока.</p><label>Деталь<select aria-label="Фикстура" value={id} onChange={e=>setId(e.target.value)}>{DRAWING_FIXTURES.map(f=><option key={f.id} value={f.id}>{f.title}</option>)}<option value="block">Прямоугольный брусок · старый формат</option></select></label>{id==='block'?<BlockFixture/>:<InteractiveDrawing key={id} title={fixture.title} geometry={fixture.geometry} display={fixture.display} result={actual}/>}</main>;
}

function BlockFixture(){const level=compileLevel(millingLevel());if(level.mode!=='production')return null;const part=applyOperation(level.blank,null,level.operations[0]);return <><DrawingSheet title="Брусок после фрезерования" blank={level.blank} ops={level.operations} requirements={Object.values(level.waits)[0].requirements} result={part} actual={{doneOps:1,progress:0}}/><PartPreview part={part} label="Объёмный брусок"/></>;}
