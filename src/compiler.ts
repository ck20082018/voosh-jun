import { type Level, type LevelNode, type Placement } from './level';
import { validateLevel } from './validation';
export interface Operation { id:string; blankId:string; diameter:number; length:number; seconds:number }
export interface ProductionLevel {
  mode:'production'; operations:Operation[];
  id:string; name:string; grid:Level['grid']; placements:Placement[];
  blank:{id:string;name:string;material:string;diameter:number;length:number};
  tool:{id:string;name:string}; machine:{id:string;name:string}; warehouse:{id:string;name:string;capacity:number}; operation:Operation;
  scenario:LevelNode[]; expected:Operation; expectedWarehouseId:string;
}
export interface WelcomeLevel {mode:'welcome';id:string;name:string;grid:Level['grid'];placements:Placement[];scenario:LevelNode[]}
export type ExecutableLevel=ProductionLevel|WelcomeLevel;
export function compileLevel(level:Level):ExecutableLevel {
  const errors=validateLevel(level); if(errors.length)throw new Error(errors.map(e=>e.message).join('\n'));
  const definition=structuredClone(level);
  const node=(kind:string)=>definition.nodes.find(n=>n.type===kind)!;
  const source=(target:LevelNode,port:string)=>definition.nodes.find(n=>n.id===definition.edges.find(e=>e.target===target.id&&e.targetHandle===port)!.source)!;
  const operation=(n:LevelNode):Operation=>({id:n.id,blankId:source(n,'blank').id,diameter:Number(n.params.diameter),length:Number(n.params.length),seconds:Number(n.params.seconds)});
  const scenario:LevelNode[]=[];let current:LevelNode|undefined=node('start');
  while(current){scenario.push(current);const edge=definition.edges.find(e=>e.source===current?.id&&e.sourceHandle==='out'); current=edge?definition.nodes.find(n=>n.id===edge.target):undefined;}
  if(!definition.nodes.some(n=>n.type==='task'))return {mode:'welcome',id:definition.id,name:definition.name,grid:definition.grid,placements:definition.placements,scenario};
  const task=node('task'),wait=node('wait'),machine=source(task,'machine'),warehouse=source(task,'warehouse'),op=source(machine,'operation'),blank=source(op,'blank'),tool=source(machine,'tool');
  const operations:Operation[]=[];let cursor:LevelNode|undefined=op;
  while(cursor){operations.unshift(operation(cursor));const previous=definition.edges.find(e=>e.target===cursor?.id&&e.targetHandle==='previous');cursor=previous?definition.nodes.find(n=>n.id===previous.source):undefined;}
  return {mode:'production',operations,id:definition.id,name:definition.name,grid:definition.grid,placements:definition.placements,
    blank:{id:blank.id,name:String(blank.params.name),material:String(blank.params.material),diameter:Number(blank.params.diameter),length:Number(blank.params.length)},
    tool:{id:tool.id,name:String(tool.params.name)},machine:{id:machine.id,name:String(machine.params.name)},warehouse:{id:warehouse.id,name:String(warehouse.params.name),capacity:Number(warehouse.params.capacity)},
    operation:operation(op),scenario,expected:operation(source(wait,'operation')),expectedWarehouseId:source(wait,'warehouse').id};
}
