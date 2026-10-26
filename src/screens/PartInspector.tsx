import {lazy,Suspense,useEffect,useRef} from 'react';
import type {EngineeringProps} from './EngineeringSheet';
import './part-inspector.css';
const EngineeringSheet=lazy(()=>import('./EngineeringSheet'));
export default function PartInspector({onClose,...props}:EngineeringProps&{onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current!;dialog.showModal();const close=()=>onClose();dialog.addEventListener('close',close);return()=>{dialog.removeEventListener('close',close);dialog.close();};},[]);
 return <dialog ref={ref} className="part-inspector-dialog" aria-label={`Изучение детали: ${props.metadata.title}`}><button type="button" className="part-inspector-close" onClick={onClose}>Закрыть просмотр детали</button><h2>{props.metadata.title}</h2><Suspense fallback={<p role="status">Загрузка чертежа…</p>}><EngineeringSheet {...props}/></Suspense></dialog>;
}
