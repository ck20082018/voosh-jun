import { NODE_TYPES, registry, portPair, type Level, type LevelNode } from './level';
export interface Issue { nodeId?:string; message:string }
export function validateLevel(level:Level): Issue[] {
  const issues:Issue[]=[];
  const add=(message:string,nodeId?:string)=>issues.push({message,nodeId});
  if(!level.name.trim())add('Укажите название уровня.');
  const ids=new Set<string>();
  for(const node of level.nodes){
    if(ids.has(node.id))add('Идентификатор ноды повторяется.',node.id); ids.add(node.id);
    const definition=registry[node.type];
    for(const parameter of definition.parameters){
      const value=node.params[parameter.key];
      if(parameter.type==='number') { if(typeof value!=='number'||!Number.isFinite(value))add(`${parameter.label}: требуется число.`,node.id); }
      else if(typeof value!=='string'||!value.trim())add(`${parameter.label}: заполните текст.`,node.id);
    }
    for(const message of definition.validate(node.params))add(message,node.id);
  }
  const production=level.nodes.some(n=>n.type==='task'||n.type==='wait');
  for(const kind of NODE_TYPES){
    const nodes=level.nodes.filter(n=>n.type===kind);
    if((kind==='start'||kind==='finish'||production&&!['intro','turning'].includes(kind))&&nodes.length!==1){add(`Требуется ровно одна нода «${registry[kind].title}» (сейчас ${nodes.length}).`,nodes[1]?.id);}
  }
  const edgeIds=new Set<string>(), incoming=new Set<string>();
  for(const edge of level.edges){
    if(edgeIds.has(edge.id))add('Идентификатор связи повторяется.',edge.target); edgeIds.add(edge.id);
    const pair=portPair(level,edge);
    if(!pair){add('Связь ссылается на отсутствующую ноду или порт.',edge.target);continue;}
    if(pair.input.type!==pair.output.type)add(`Несовместимые порты: ${pair.output.type} → ${pair.input.type}.`,edge.target);
    const key=`${edge.target}:${edge.targetHandle}`;
    if(incoming.has(key))add('В один вход нельзя подключить несколько связей.',edge.target); incoming.add(key);
  }
  for(const node of level.nodes){
    for(const port of registry[node.type].inputs.filter(p=>p.required)){
      if(!incoming.has(`${node.id}:${port.id}`))add(`Не подключён вход «${port.label}».`,node.id);
    }
    const outgoing=level.edges.filter(e=>e.source===node.id&&portPair(level,e)?.output.type==='execution');
    if(outgoing.length>1)add('Параллельные ветви выполнения не поддерживаются.',node.id);
    if(registry[node.type].outputs.some(p=>p.type==='execution')&&outgoing.length===0)add('Не подключён выход выполнения.',node.id);
  }
  const visited=new Set<string>(), stack=new Set<string>();
  function visit(id:string){
    if(stack.has(id)){add('Циклы не поддерживаются.',id);return;}
    if(visited.has(id))return;
    visited.add(id);stack.add(id);
    for(const edge of level.edges.filter(e=>e.source===id)) if(ids.has(edge.target))visit(edge.target);
    stack.delete(id);
  }
  for(const node of level.nodes)visit(node.id);
  const one=(kind:string)=>level.nodes.find(n=>n.type===kind);
  const source=(node:LevelNode|undefined,port:string)=>level.nodes.find(n=>n.id===level.edges.find(e=>e.target===node?.id&&e.targetHandle===port)?.source);
  for(const turning of level.nodes.filter(n=>n.type==='turning')){
    const blank=source(turning,'blank');
    if(blank?.type!=='blank')continue;
    if(Number(turning.params.diameter)>=Number(blank.params.diameter))add('Конечный диаметр должен быть меньше диаметра заготовки.',turning.id);
    if(Number(turning.params.length)>Number(blank.params.length))add('Участок точения не может быть длиннее заготовки.',turning.id);
  }
  const task=one('task'), wait=one('wait'), lathe=source(task,'machine');
  if(task&&wait){
    if(source(task,'warehouse')?.id!==source(wait,'warehouse')?.id)add('Задание и ожидание должны ссылаться на один склад.',wait.id);
    if(source(lathe,'operation')?.id!==source(wait,'operation')?.id)add('Ожидание должно проверять операцию выбранного станка.',wait.id);
  }
  // The prototype deliberately supports one complete sequential teaching cycle.
  const start=one('start');
  if(start){
    const chain:string[]=[];let current:LevelNode|undefined=start;
    while(current&&!chain.includes(current.id)){
      chain.push(current.id);
      current=level.nodes.find(n=>n.id===level.edges.find(e=>e.source===current?.id&&e.sourceHandle==='out')?.target);
    }
    const types=chain.map(id=>level.nodes.find(n=>n.id===id)!.type);
    if(types.filter(type=>type!=='intro').join(',')!==(production?'start,task,wait,finish':'start,finish'))add('Поддерживается цепочка: начало → приветствия → завершение, либо начало → задание → ожидание → завершение с приветствиями между шагами.',start.id);
    for(const node of level.nodes.filter(node=>['start','intro','task','wait','finish'].includes(node.type)))if(!chain.includes(node.id))add('Нода сценария не достижима от начала уровня.',node.id);
  }
  if(production){
    const final=source(lathe,'operation');const chain=new Set<string>();let current=final;let totalLength=0;
    while(current?.type==='turning'&&!chain.has(current.id)){
      chain.add(current.id);totalLength+=Number(current.params.length);
      if(source(current,'blank')?.id!==source(final,'blank')?.id)add('Все операции станка должны ссылаться на одну заготовку.',current.id);
      current=source(current,'previous');
    }
    if(totalLength>Number(source(final,'blank')?.params.length))add('Суммарная длина участков операций превышает длину заготовки.',final?.id);
    for(const operation of level.nodes.filter(n=>n.type==='turning'))if(!chain.has(operation.id))add('Операция не включена в цепочку станка. Подключите её как предыдущую операцию или как последнюю к станку.',operation.id);
  }
  for(const node of level.nodes)if(node.size&&(!Number.isFinite(node.size.width)||!Number.isFinite(node.size.height)||node.size.width<220||node.size.height<160||node.size.width>900||node.size.height>900))add('Размер ноды: ширина 220–900, высота 160–900.',node.id);
  const {width,height}=level.grid;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8||height>8)add('Размер сетки: целые числа от 1 до 8.');
  const occupied=new Set<string>(),placed=new Set<string>();
  for(const p of level.placements){
    const object=level.nodes.find(n=>n.id===p.nodeId);
    if(!object||!['blank','lathe','warehouse'].includes(object.type))add('Размещение ссылается на отсутствующий или неподходящий объект.',p.nodeId);
    if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>=width||p.y>=height)add('Объект находится за границами карты.',p.nodeId);
    const key=`${p.x},${p.y}`;
    if(occupied.has(key))add('На клетке уже находится другой объект.',p.nodeId); occupied.add(key);
    if(placed.has(p.nodeId))add('Объект размещён несколько раз.',p.nodeId);placed.add(p.nodeId);
  }
  for(const node of level.nodes.filter(n=>['blank','lathe','warehouse'].includes(n.type)))if(!placed.has(node.id))add('Разместите объект на вкладке «Карта».',node.id);
  return issues;
}
