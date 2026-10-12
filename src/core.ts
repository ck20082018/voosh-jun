import type { ExecutableLevel, Operation, ProductionLevel } from './compiler';
export type ItemStage='table'|'loaded'|'processing'|'finished'|'stored';
export type Command='start'|'install'|'process'|'store'|'cancel';
export interface Part { blankId:string;material:string;diameter:number;length:number;sectionDiameter:number;sectionLength:number;operationId:string;sections:{diameter:number;length:number}[] }
export interface CoreState {
  operationIndex:number;stage:ItemStage;selected:string|null;target:'machine'|'warehouse'|null;elapsed:number;count:number;
  activeNodeId:string|null;intro:boolean;playing:boolean;completed:boolean;disposed:boolean;part:Part|null;
  goal:string;instruction:string;success:string;
}
export type EventType='node-started'|'node-completed'|'blank-installed'|'processing-started'|'processing-finished'|'part-stored'|'level-completed'|'reset';
export interface CoreEvent {type:EventType;nodeId?:string;message:string}
export interface LogEntry extends CoreEvent {sequence:number}
export function suitable(part:Part|null,expected:Operation,warehouseId:string,expectedWarehouseId:string):boolean {
  return !!part&&warehouseId===expectedWarehouseId&&part.blankId===expected.blankId&&part.operationId===expected.id&&part.sectionDiameter===expected.diameter&&part.sectionLength===expected.length;
}
export class FactoryCore {
  readonly level:ExecutableLevel;
  private value!:CoreState;
  private listeners=new Set<(event:CoreEvent)=>void>();
  private waitUnsubscribe:(()=>void)|null=null;
  private index=0;
  private sequence=0;
  private journal:LogEntry[]=[];
  constructor(level:ExecutableLevel){this.level=structuredClone(level);this.reset();}
  get isWelcome():boolean{return this.level.mode==='welcome';}
  get resources():ProductionLevel {if(this.level.mode!=='production')throw new Error('У приветствия нет оборудования.');return this.level;}
  get currentOperation():Operation{return this.resources.operations[this.value.operationIndex];}
  get state():Readonly<CoreState>{return structuredClone(this.value);}
  get log():LogEntry[]{return this.journal.map(e=>({...e}));}
  get subscriptionCount():number{return this.listeners.size;}
  subscribe(callback:(event:CoreEvent)=>void):()=>void{this.listeners.add(callback);return()=>this.listeners.delete(callback);}
  private emit(event:CoreEvent){this.journal.push({...event,sequence:++this.sequence});if(this.journal.length>50)this.journal.shift();for(const callback of [...this.listeners])callback(event);}
  private clearWait(){this.waitUnsubscribe?.();this.waitUnsubscribe=null;}
  reset():void {
    this.clearWait();this.listeners.clear();this.index=0;this.sequence=0;this.journal=[];
    this.value={operationIndex:0,stage:'table',selected:null,target:null,elapsed:0,count:0,activeNodeId:null,intro:false,playing:false,completed:false,disposed:false,part:null,goal:'',instruction:'',success:''};
    this.emit({type:'reset',message:'Новый запуск: состояние сброшено'});this.activate();
  }
  dispose():void{this.clearWait();this.listeners.clear();this.value.disposed=true;this.value.playing=false;this.value.target=null;this.value.elapsed=0;if(this.value.stage==='processing')this.value.stage='loaded';}
  private activate():void {
    if(this.value.disposed||this.value.completed)return;
    const node=this.level.scenario[this.index];if(!node)return;
    this.value.activeNodeId=node.id;
    this.emit({type:'node-started',nodeId:node.id,message:`Вход в ноду: ${node.type}`});
    switch(node.type){
      case 'start':this.advance();break;
      case 'intro':this.value.intro=true;break;
      case 'task':this.value.playing=true;this.value.goal=String(node.params.title);this.value.instruction=String(node.params.instruction);this.advance();break;
      case 'wait':
        this.waitUnsubscribe=this.subscribe(event=>{if(event.type==='part-stored')this.checkWait();});
        this.checkWait();break;
      case 'finish':
        this.value.completed=true;this.value.playing=false;this.value.success=String(node.params.text);this.value.selected=null;
        this.emit({type:'node-completed',nodeId:node.id,message:'Завершение выполнено'});
        this.emit({type:'level-completed',nodeId:node.id,message:this.value.success});break;
    }
  }
  private advance(){const node=this.level.scenario[this.index];this.clearWait();this.emit({type:'node-completed',nodeId:node.id,message:`Выход из ноды: ${node.type}`});this.index++;this.activate();}
  private checkWait(){
    if(this.isWelcome||this.level.scenario[this.index]?.type!=='wait'||this.value.disposed)return;
    if(this.value.stage==='stored'&&suitable(this.value.part,this.resources.expected,this.resources.warehouse.id,this.resources.expectedWarehouseId))this.advance();
  }
  can(command:Command):boolean {
    const s=this.value;if(s.disposed)return false;
    if(command==='start')return s.intro;
    if(this.isWelcome||!s.playing||s.completed||s.intro)return false;
    if(command==='cancel')return s.target!==null;
    if(s.stage==='processing'||s.target)return false;
    if(command==='install')return s.stage==='table'&&s.selected===this.resources.blank.id;
    if(command==='process')return s.stage==='loaded'&&s.selected===this.resources.machine.id;
    if(command==='store')return s.stage==='finished'&&s.selected===this.resources.blank.id&&s.count<this.resources.warehouse.capacity;
    return false;
  }
  command(command:Command):boolean {
    if(!this.can(command))return false;
    if(command==='start'){this.value.intro=false;this.advance();}
    if(command==='install')this.value.target='machine';
    if(command==='store')this.value.target='warehouse';
    if(command==='cancel')this.value.target=null;
    if(command==='process'){this.value.stage='processing';this.value.elapsed=0;this.emit({type:'processing-started',message:`Обработка: ${this.currentOperation.seconds} с`});}
    return true;
  }
  click(id:string):boolean {
    const s=this.value;
    if(this.isWelcome||s.disposed||!s.playing||s.intro||s.completed||s.stage==='processing')return false;
    if(s.target==='machine'){
      if(id!==this.resources.machine.id||s.stage!=='table'||s.selected!==this.resources.blank.id||this.resources.operation.blankId!==this.resources.blank.id)return false;
      s.stage='loaded';s.selected=id;s.target=null;this.emit({type:'blank-installed',message:'Заготовка установлена в станок'});return true;
    }
    if(s.target==='warehouse'){
      if(id!==this.resources.warehouse.id||s.stage!=='finished'||s.selected!==this.resources.blank.id||s.count>=this.resources.warehouse.capacity||!s.part)return false;
      s.stage='stored';s.selected=id;s.target=null;s.count=1;this.emit({type:'part-stored',message:'Готовая деталь поступила на склад'});return true;
    }
    if(id===this.resources.blank.id&&(s.stage==='table'||s.stage==='finished')){s.selected=id;return true;}
    if(id===this.resources.machine.id||id===this.resources.warehouse.id){s.selected=id;return true;}
    return false;
  }
  tick(delta:number):void {
    if(this.isWelcome||this.value.disposed||this.value.stage!=='processing'||!Number.isFinite(delta)||delta<=0)return;
    const duration=this.currentOperation.seconds*1000;
    this.value.elapsed=Math.min(duration,this.value.elapsed+delta);
    if(this.value.elapsed===duration){
      const operation=this.currentOperation;
      this.value.selected=this.resources.machine.id;
      const sections=[...(this.value.part?.sections??[]),{diameter:operation.diameter,length:operation.length}];
      this.value.part={blankId:this.resources.blank.id,material:this.resources.blank.material,diameter:this.resources.blank.diameter,length:this.resources.blank.length,sectionDiameter:operation.diameter,sectionLength:operation.length,operationId:operation.id,sections};
      this.emit({type:'processing-finished',message:`Операция ${this.value.operationIndex+1} завершена: Ø${operation.diameter} мм × ${operation.length} мм`});
      if(this.value.operationIndex+1<this.resources.operations.length){this.value.operationIndex++;this.value.stage='loaded';this.value.elapsed=0;}else this.value.stage='finished';
    }
  }
  get hint():string {
    const s=this.value;
    if(s.completed)return s.success;
    if(s.intro)return 'Прочитайте вступление и нажмите «Начать».';
    if(s.target==='machine')return 'Выберите токарный станок на карте или отмените выбор цели.';
    if(s.target==='warehouse')return 'Выберите склад на карте или отмените выбор цели.';
    if(this.isWelcome)return 'Следуйте тексту приветствия.';
    if(s.stage==='table')return s.selected===this.resources.blank.id?'Нажмите «Установить в станок».':'Выберите заготовку на столе.';
    if(s.stage==='loaded')return s.selected===this.resources.machine.id?`Нажмите «Обработать»: операция ${s.operationIndex+1} из ${this.resources.operations.length}.`:'Выберите загруженный станок.';
    if(s.stage==='processing')return 'Заготовка вращается. Дождитесь завершения обработки.';
    if(s.stage==='finished')return s.selected===this.resources.blank.id?'Нажмите «Отправить на склад».':'Выберите готовый валик в станке.';
    return 'Деталь на складе не соответствует условию завершения.';
  }
}
