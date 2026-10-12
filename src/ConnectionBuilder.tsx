import {useState} from 'react';
import {registry,type Level} from './level';
import {connectionIssue,nodeLabel,type ConnectionDefinition} from './connections';
interface Props {level:Level;onCreate:(edge:ConnectionDefinition)=>boolean;onClose:()=>void}
export function ConnectionBuilder({level,onCreate,onClose}:Props){
  const outputs=level.nodes.flatMap(node=>registry[node.type].outputs.map(port=>({key:JSON.stringify([node.id,port.id]),nodeId:node.id,port,label:`${nodeLabel(level,node.id)} → ${port.label}`})));
  const [sourceKey,setSourceKey]=useState(outputs[0]?.key??'');
  const [targetKey,setTargetKey]=useState('');
  const source=outputs.find(output=>output.key===sourceKey)??outputs[0];
  const inputs=source?level.nodes.flatMap(node=>registry[node.type].inputs.filter(port=>port.type===source.port.type).map(port=>{
    const edge={source:source.nodeId,sourceHandle:source.port.id,target:node.id,targetHandle:port.id};
    return {key:JSON.stringify([node.id,port.id]),edge,label:`${nodeLabel(level,node.id)} ← ${port.label}`,error:connectionIssue(level,edge)};
  })):[];
  const target=inputs.find(input=>input.key===targetKey&&!input.error)??inputs.find(input=>!input.error);
  return <form className="connection-builder nodrag nopan" aria-label="Добавление связи" onSubmit={event=>{event.preventDefault();if(target&&onCreate(target.edge))onClose();}}>
    <div className="connection-builder-title"><strong>Новая связь</strong><button type="button" aria-label="Закрыть добавление связи" onClick={onClose}>×</button></div>
    <label>Выход ноды<select aria-label="Выход новой связи" value={source?.key??''} onChange={event=>{setSourceKey(event.target.value);setTargetKey('');}}>{!outputs.length&&<option value="">Добавьте ноду с выходом</option>}{outputs.map(output=><option key={output.key} value={output.key}>{output.label}</option>)}</select></label>
    <label>Вход ноды<select aria-label="Вход новой связи" value={target?.key??''} onChange={event=>setTargetKey(event.target.value)}>{!target&&<option value="">Нет свободных совместимых входов</option>}{inputs.map(input=><option key={input.key} value={input.key} disabled={!!input.error}>{input.label}{input.error?' · недоступен':''}</option>)}</select></label>
    {!target&&<p role="status">{inputs.find(input=>input.error)?.error??'Добавьте ноду с входом такого же типа.'}</p>}
    <button type="submit" className="primary" disabled={!target}>Создать связь</button>
  </form>;
}
