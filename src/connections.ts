import {portPair,registry,portsCompatible,type Level,type LevelEdge} from './level';
export type ConnectionDefinition=Omit<LevelEdge,'id'>;
export function connectionIssue(level:Level,edge:ConnectionDefinition):string|null{
  const pair=portPair(level,edge);
  if(!pair)return 'Выберите существующие ноды и их порты.';
  if(edge.source===edge.target)return 'Нельзя соединить ноду с самой собой.';
  if(!portsCompatible(pair.output,pair.input))return `Выход «${pair.output.label}» не подходит для входа «${pair.input.label}»: это разные типы данных.`;
  if(level.edges.some(existing=>existing.source===edge.source&&existing.sourceHandle===edge.sourceHandle&&existing.target===edge.target&&existing.targetHandle===edge.targetHandle))return 'Эта связь уже существует.';
  if(!pair.input.multiple&&level.edges.some(existing=>existing.target===edge.target&&existing.targetHandle===edge.targetHandle))return 'Этот вход уже занят. Выберите его линию и удалите её, прежде чем подключать другой выход.';
  if(pair.output.type==='execution'&&level.edges.some(existing=>existing.source===edge.source&&existing.sourceHandle===edge.sourceHandle))return 'Выход выполнения уже подключён. Удалите прежнюю линию: параллельные ветви не поддерживаются.';
  const seen=new Set<string>();
  function reachesSource(id:string):boolean{
    if(id===edge.source)return true;if(seen.has(id))return false;seen.add(id);
    return level.edges.filter(existing=>existing.source===id).some(existing=>reachesSource(existing.target));
  }
  if(reachesSource(edge.target))return 'Эта связь создаёт цикл. Сценарий должен идти последовательно.';
  return null;
}
export function addLevelConnection(level:Level,edge:ConnectionDefinition,id:string):Level{
  if(connectionIssue(level,edge)||level.edges.some(existing=>existing.id===id))return level;
  return {...level,edges:[...level.edges,{...edge,id}]};
}
export function nodeLabel(level:Level,id:string):string{
  const node=level.nodes.find(node=>node.id===id);if(!node)return id;
  const name=node.params.name??node.params.title;
  return `${registry[node.type].title}${name?` — ${name}`:''} (${level.nodes.indexOf(node)+1})`;
}
