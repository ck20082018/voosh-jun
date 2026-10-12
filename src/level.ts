export const NODE_TYPES = ['start','intro','blank','tool','turning','lathe','warehouse','task','wait','finish'] as const;
export type NodeKind = typeof NODE_TYPES[number];
export type PortType = 'execution' | 'blank' | 'tool' | 'operation' | 'machine' | 'warehouse';
export interface Port { id: string; label: string; type: PortType; required?: boolean }
export interface Parameter { key: string; label: string; type: 'text' | 'number' | 'textarea' | 'tool'; default: string | number }
export interface NodeDefinition { title: string; description: string; parameters: Parameter[]; inputs: Port[]; outputs: Port[]; validate: (params: Record<string, string | number>) => string[] }
export interface LevelNode { id: string; type: NodeKind; position: {x: number; y: number}; params: Record<string, string | number>; size?: {width:number;height:number} }
export interface LevelEdge { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }
export interface Placement { nodeId: string; x: number; y: number }
export interface Level { version: 1; id: string; name: string; nodes: LevelNode[]; edges: LevelEdge[]; grid: {width: number; height: number}; placements: Placement[] }
const execIn: Port = {id:'in',label:'Выполнение',type:'execution',required:true};
const execOut: Port = {id:'out',label:'Далее',type:'execution'};
const positive = (...keys: string[]) => (p: Record<string,string|number>) => keys.flatMap(k => typeof p[k] !== 'number' || !Number.isFinite(p[k]) || Number(p[k])<=0 ? [`${k}: требуется положительное число.`] : []);
const text = (key: string, label: string, value: string, multiline=false): Parameter => ({key,label,type:multiline?'textarea':'text',default:value});
const number = (key: string,label: string,value:number): Parameter => ({key,label,type:'number',default:value});
const valid = () => [];
export const registry: Record<NodeKind, NodeDefinition> = {
  start:{title:'Начало уровня',description:'Единственная точка входа',parameters:[],inputs:[],outputs:[execOut],validate:valid},
  intro:{title:'Вступление',description:'Окно перед началом игры',parameters:[text('title','Заголовок','Первый валик'),text('text','Текст','Установите заготовку в станок, обработайте и отправьте валик на склад.',true)],inputs:[execIn],outputs:[execOut],validate:valid},
  blank:{title:'Заготовка',description:'Одна заготовка на столе',parameters:[text('name','Название','Стальная заготовка'),text('material','Материал','Сталь'),number('diameter','Диаметр, мм',20),number('length','Длина, мм',60)],inputs:[],outputs:[{id:'blank',label:'Заготовка',type:'blank'}],validate:positive('diameter','length')},
  tool:{title:'Инструмент',description:'Предустановленный проходной резец',parameters:[text('name','Название','Проходной резец'),{key:'kind',label:'Тип',type:'tool',default:'turning'}],inputs:[],outputs:[{id:'tool',label:'Инструмент',type:'tool'}],validate:p=>p.kind==='turning'?[]:['Поддерживается только проходной токарный резец.']},
  turning:{title:'Операция точения',description:'Размеры результата и время обработки',parameters:[number('diameter','Конечный диаметр, мм',12),number('length','Длина участка, мм',30),number('seconds','Обработка, секунд',3)],inputs:[{id:'blank',label:'Заготовка',type:'blank',required:true},{id:'previous',label:'Предыдущая операция',type:'operation'}],outputs:[{id:'operation',label:'Операция',type:'operation'}],validate:positive('diameter','length','seconds')},
  lathe:{title:'Токарный станок',description:'Принимает заданную заготовку',parameters:[text('name','Название','Токарный станок')],inputs:[{id:'tool',label:'Инструмент',type:'tool',required:true},{id:'operation',label:'Операция',type:'operation',required:true}],outputs:[{id:'machine',label:'Станок',type:'machine'}],validate:valid},
  warehouse:{title:'Склад',description:'Хранение обработанной детали',parameters:[text('name','Название','Склад'),number('capacity','Вместимость',1)],inputs:[],outputs:[{id:'warehouse',label:'Склад',type:'warehouse'}],validate:p=>[...positive('capacity')(p),...(!Number.isInteger(p.capacity)?['Вместимость должна быть целым числом.']:[])]},
  task:{title:'Задание',description:'Цель и активация производства',parameters:[text('title','Заголовок','Изготовьте ступенчатый валик'),text('instruction','Инструкция','Обработайте заготовку и отправьте готовую деталь на склад.',true)],inputs:[execIn,{id:'machine',label:'Нужный станок',type:'machine',required:true},{id:'warehouse',label:'Нужный склад',type:'warehouse',required:true}],outputs:[execOut],validate:valid},
  wait:{title:'Ожидать деталь на складе',description:'Проверяет склад и размеры детали',parameters:[],inputs:[execIn,{id:'warehouse',label:'Склад',type:'warehouse',required:true},{id:'operation',label:'Требования',type:'operation',required:true}],outputs:[execOut],validate:valid},
  finish:{title:'Завершить уровень',description:'Итог и повторное прохождение',parameters:[text('text','Текст успеха','Отлично! Подходящий валик находится на складе.',true)],inputs:[execIn],outputs:[],validate:valid},
};
export function makeNode(type: NodeKind,id: string,position={x:0,y:0}): LevelNode {
  return {id,type,position,params:Object.fromEntries(registry[type].parameters.map(p=>[p.key,p.default]))};
}
export function emptyLevel(): Level { return {version:1,id:crypto.randomUUID(),name:'Новый уровень',nodes:[],edges:[],grid:{width:5,height:5},placements:[]}; }
export function exampleLevel(): Level {
  const level: Level = {version:1,id:'first-shaft',name:'Первый валик',nodes:[],edges:[],grid:{width:5,height:5},placements:[{nodeId:'blank',x:0,y:2},{nodeId:'lathe',x:2,y:2},{nodeId:'warehouse',x:4,y:2}]};
  const positions: Record<NodeKind,{x:number;y:number}> = {start:{x:0,y:0},intro:{x:260,y:0},task:{x:530,y:0},wait:{x:800,y:0},finish:{x:1090,y:0},blank:{x:0,y:330},tool:{x:0,y:530},turning:{x:270,y:330},lathe:{x:540,y:330},warehouse:{x:540,y:560}};
  level.nodes = NODE_TYPES.map(type=>makeNode(type,type,positions[type]));
  const connect = (s:string,sh:string,t:string,th:string) => level.edges.push({id:`${s}-${sh}-${t}-${th}`,source:s,sourceHandle:sh,target:t,targetHandle:th});
  connect('start','out','intro','in'); connect('intro','out','task','in'); connect('task','out','wait','in'); connect('wait','out','finish','in');
  connect('blank','blank','turning','blank'); connect('tool','tool','lathe','tool'); connect('turning','operation','lathe','operation'); connect('lathe','machine','task','machine'); connect('warehouse','warehouse','task','warehouse'); connect('warehouse','warehouse','wait','warehouse'); connect('turning','operation','wait','operation');
  return level;
}
export function portPair(level:Level,edge:Omit<LevelEdge,'id'>): {output:Port;input:Port}|null {
  const source=level.nodes.find(n=>n.id===edge.source), target=level.nodes.find(n=>n.id===edge.target);
  if(!source||!target) return null;
  const output=registry[source.type].outputs.find(p=>p.id===edge.sourceHandle), input=registry[target.type].inputs.find(p=>p.id===edge.targetHandle);
  return output&&input?{output,input}:null;
}
export function compatible(level:Level,edge:Omit<LevelEdge,'id'>): boolean {
  const pair=portPair(level,edge);
  return !!pair&&pair.output.type===pair.input.type&&edge.source!==edge.target && !level.edges.some(e=>e.target===edge.target&&e.targetHandle===edge.targetHandle);
}
export function deleteNodes(level:Level,ids:string[]):Level {
  return {...level,nodes:level.nodes.filter(n=>!ids.includes(n.id)),edges:level.edges.filter(e=>!ids.includes(e.source)&&!ids.includes(e.target)),placements:level.placements.filter(p=>!ids.includes(p.nodeId))};
}
export function placeObject(level:Level,nodeId:string,x:number,y:number):Level|null {
  if(!level.nodes.some(n=>n.id===nodeId&&['blank','lathe','warehouse'].includes(n.type))||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=level.grid.width||y>=level.grid.height||level.placements.some(p=>p.nodeId!==nodeId&&p.x===x&&p.y===y))return null;
  return {...level,placements:[...level.placements.filter(p=>p.nodeId!==nodeId),{nodeId,x,y}]};
}

export function welcomeLevel():Level {
  const level=emptyLevel();level.name='Приветствие';
  level.nodes=[makeNode('start','start'),makeNode('intro','intro',{x:280,y:0}),makeNode('finish','finish',{x:560,y:0})];
  level.nodes[1].params={title:'Добро пожаловать!',text:'Познакомьтесь с учебной мастерской. Для этого уровня оборудование не требуется.'};
  level.nodes[2].params.text='Знакомство завершено.';
  level.edges=[{id:'welcome-1',source:'start',sourceHandle:'out',target:'intro',targetHandle:'in'},{id:'welcome-2',source:'intro',sourceHandle:'out',target:'finish',targetHandle:'in'}];return level;
}
export function twoOperationsLevel():Level {
  const level=exampleLevel();level.id='two-operations';level.name='Два участка валика';
  const second=makeNode('turning','turning-2',{x:270,y:610});second.params={diameter:8,length:15,seconds:2};level.nodes.push(second);
  level.nodes.find(n=>n.type==='warehouse')!.position={x:560,y:650};
  for(const edge of level.edges)if(edge.source==='turning'&&(edge.target==='lathe'||edge.target==='wait'))edge.source=second.id;
  level.edges.push({id:'previous-2',source:'turning',sourceHandle:'operation',target:second.id,targetHandle:'previous'},{id:'blank-2',source:'blank',sourceHandle:'blank',target:second.id,targetHandle:'blank'});
  return level;
}
