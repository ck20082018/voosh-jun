import type Phaser from 'phaser';

export interface DrawingPlacement {readonly nodeId:string;readonly x:number;readonly y:number}
export interface WorkshopDrawingData {
  readonly grid:{readonly width:number;readonly height:number;readonly points?:readonly {readonly id:string;readonly x:number;readonly y:number}[]};
  readonly placements:readonly DrawingPlacement[];
  readonly nodes:readonly {readonly id:string;readonly type:string;readonly shape?:string;readonly diameter?:number;readonly length?:number;readonly width?:number;readonly height?:number;readonly machineKind?:string}[];
  readonly selected:string|null;
  readonly production?:{
    readonly targetIds?:readonly string[];
    readonly location?:{readonly kind:string;readonly id:string}|null;
    readonly machines?:Readonly<Record<string,{readonly stage:string;readonly itemId:string|null}>>;
    readonly warehouses?:Readonly<Record<string,{readonly itemId:string|null}>>;
    readonly stage:string;readonly selected:string|null;readonly target:string|null;
    readonly blank:{readonly id:string;readonly shape?:string;readonly diameter?:number;readonly length:number;readonly width?:number;readonly height?:number};
    readonly part:null|{readonly shape?:string;readonly length?:number;readonly width?:number;readonly height?:number;readonly sections:readonly {readonly diameter:number;readonly length:number}[]};
  };
}

// Shared by the rendering and input adapter; coordinates stay aligned.
export function projectCell(x:number,y:number){return {x:510+(x-y)*58,y:155+(x+y)*30};}

export class WorkshopDrawing {
  private view!:WorkshopDrawingData;
  private phase=0;
  constructor(private readonly g:Phaser.GameObjects.Graphics){}
  private center=projectCell;
  render(view:WorkshopDrawingData,phase:number){this.view=view;this.phase=phase;this.draw();}
  private poly(points:number[],color:number){this.g.fillStyle(color).fillPoints(points.reduce<{x:number;y:number}[]>((a,_,i)=>{if(i%2===0)a.push({x:points[i],y:points[i+1]});return a;},[]),true);}
  private box(x:number,y:number,w:number,d:number,h:number,top:number,front:number,side:number){
    this.poly([x,y-h,x+w,y+d-h,x+w-d,y+2*d-h,x-d,y+d-h],top);
    this.poly([x-d,y+d-h,x+w-d,y+2*d-h,x+w-d,y+2*d,x-d,y+d],front);
    this.poly([x+w-d,y+2*d-h,x+w,y+d-h,x+w,y+d,x+w-d,y+2*d],side);
  }
  private cylinder(x:number,y:number,length:number,r:number,finished:boolean){
    const blank=this.view.production?.blank??this.view.nodes.find(n=>n.type==='blank');
    if(blank?.shape==='block'){
      const data=finished?this.view.production?.part??blank:blank;
      // The same millimetre scale is used before and after milling, so removed height stays visible.
      const ratio=(actual:number|undefined,original:number|undefined,fallback:number)=>Number.isFinite(actual)&&Number(original)>0?Number(actual)/Number(original):fallback;
      const h=14*ratio(data?.height,blank.height,1);
      const w=length*ratio(data?.length,blank.length,1),d=12*ratio(data?.width,blank.width,1);
      this.box(x,y,w,d,h,0xd6e1e2,0x9db0b9,0x6e8794);
      if(this.view.production?.stage==='processing')this.g.lineStyle(2,0xfff3c8).lineBetween(x,y-h,x+w,y+d-h);
      return;
    }

    const segment=(sx:number,sy:number,l:number,radius:number)=>{
      this.poly([sx,sy-radius,sx+l,sy-radius+l*.24,sx+l,sy+radius+l*.24,sx,sy+radius],0x9db0b9);
      this.g.fillStyle(0xd6e1e2).fillEllipse(sx,sy,radius*.8,radius*2);
      this.g.fillStyle(0x6e8794).fillEllipse(sx+l,sy+l*.24,radius*.8,radius*2);
      this.g.lineStyle(2,0xedf4ef).lineBetween(sx+3,sy-radius*.5,sx+l-3,sy-radius*.5+l*.24);
    };
    if(finished){
      const blank=this.view.production?.blank;
      const sections=this.view.production?.part?.sections??[];
      const total=Number(blank?.length??60);
      const shoulder=length*Math.max(0,1-sections.reduce((sum,section)=>sum+section.length,0)/total);
      let cursor=shoulder;if(shoulder>0)segment(x,y,shoulder,r);
      for(const section of sections){const len=length*section.length/total;segment(x+cursor,y+cursor*.24,len,r*section.diameter/Number(blank?.diameter??20));cursor+=len;}
    }else segment(x,y,length,r);
    if(this.view.production?.stage==='processing'){
      const offset=Math.sin(this.phase)*r*.6;
      this.g.lineStyle(2,0xfff3c8).lineBetween(x+2,y+offset,x+length-2,y+length*.24+offset);
    }
  }
  private draw(){
    const level=this.view;const production=this.view.production;const selected=this.view.selected;
    const g=this.g;g.clear();const s=this.view.production;
    for(let y=0;y<level.grid.height;y++)for(let x=0;x<level.grid.width;x++){
      const c=this.center(x,y);const p=level.placements.find(p=>p.x===x&&p.y===y);
      this.poly([c.x,c.y-30,c.x+58,c.y,c.x,c.y+30,c.x-58,c.y],(x+y)%2===0?0xe0e8d9:0xe6ecdf);
      g.lineStyle(1,0xcbd7c5).strokePoints([{x:c.x,y:c.y-30},{x:c.x+58,y:c.y},{x:c.x,y:c.y+30},{x:c.x-58,y:c.y}],true);
      if(!production&&this.view.grid.points?.some(point=>point.x===x&&point.y===y)){g.lineStyle(2,p?0x638e73:0x72aeb1).strokeCircle(c.x,c.y,7);}
      if(!production&&p?.nodeId===selected){g.lineStyle(3,0xcaa04b).strokeEllipse(c.x,c.y,102,48);}
    }
    const placements=[...level.placements].sort((a,b)=>(a.x+a.y)-(b.x+b.y));
    for(const p of placements)this.object(p,s?.selected??selected??null);
    if(!production)for(const point of this.view.grid.points??[]){const c=this.center(point.x,point.y);const occupied=placements.some(p=>p.x===point.x&&p.y===point.y);g.fillStyle(occupied?0x638e73:0x72aeb1).fillCircle(c.x+38,c.y+4,5);g.lineStyle(1,0xedf4ef).strokeCircle(c.x+38,c.y+4,5);}
  }
  private object(p:DrawingPlacement,selection:string|null){
    const level=this.view;const production=this.view.production;
    const n=level.nodes.find(n=>n.id===p.nodeId);if(!n)return;
    const c=this.center(p.x,p.y),x=c.x,y=c.y;
    const data=this.view.production;
    const localStage=!data?.location?data?.stage:data.location.id===n.id?(data.location.kind==='table'?'table':data.location.kind==='warehouse'?'stored':data.machines?.[n.id]?.stage):'empty';
    const s=data?{...data,stage:localStage}:undefined;
    this.g.fillStyle(0x507254,.12).fillEllipse(x,y+17,105,40);
    const partHere=n.type==='blank'&&(!production||s?.stage==='table')||n.type==='lathe'&&s?.stage==='finished';
    if((selection===n.id&&(n.type!=='blank'||partHere))||(partHere&&selection===production?.blank.id))this.g.lineStyle(3,0xcaa04b).strokeEllipse(x,y+7,110,53);
    if(s?.target&&(!s.targetIds||s.targetIds.includes(n.id))&&(n.type==='lathe'&&s.target==='machine'||n.type==='warehouse'&&s.target==='warehouse'))this.g.lineStyle(3,0x72aeb1).strokeEllipse(x,y+8,112,55);
    if(n.type==='blank'){
      this.box(x-32,y+8,9,5,47,0xae9870,0x8e7d59,0x73694d);this.box(x+25,y+24,9,5,47,0xae9870,0x8e7d59,0x73694d);
      this.box(x-27,y-8,75,22,10,0xd0b98e,0xb49b75,0x938263);
      if(!production||s?.stage==='table')this.cylinder(x-18,y-34,46,9,false);
    }else if(n.type==='lathe'&&n.machineKind==='mill'){
      this.box(x-28,y+5,78,24,42,0x83a493,0x618473,0x486b60);
      this.box(x-32,y-32,88,25,12,0xb0c5b5,0x7a9b87,0x678877);
      this.box(x+30,y-31,22,16,80,0x93b2a0,0x6b927f,0x527564);
      this.box(x-5,y-99,58,16,14,0xb0c5b5,0x7a9b87,0x678877);
      this.g.lineStyle(7,0x405b52).lineBetween(x+9,y-99,x+9,y-72);
      this.g.fillStyle(0x6e8794).fillEllipse(x+9,y-72,18,8);
      if(s?.stage==='loaded'||s?.stage==='processing'||s?.stage==='finished')this.cylinder(x-19,y-55,45,9,!!s.part);
      if(s?.stage==='processing')this.g.lineStyle(2,0xd9bd61).strokeEllipse(x+9,y-72,22+Math.sin(this.phase)*3,10);
    }else if(n.type==='lathe'){
      this.box(x-28,y+5,78,24,42,0x83a493,0x618473,0x486b60);
      this.box(x-37,y-31,99,27,14,0xb0c5b5,0x7a9b87,0x678877);
      this.box(x-31,y-35,23,18,44,0x93b2a0,0x6b927f,0x527564);
      this.g.fillStyle(0x405b52).fillEllipse(x-3,y-63,12,28);
      this.box(x+42,y-19,17,12,29,0x9ab7a9,0x799789,0x5f7e70);
      this.g.lineStyle(4,0x526f60).lineBetween(x-3,y-41,x+41,y-30);
      this.g.fillStyle(0xd4dfce).fillCircle(x-24,y-27,6);
      if(s?.stage==='loaded'||s?.stage==='processing'||s?.stage==='finished')this.cylinder(x-1,y-69,45,9,!!s?.part);
      if(s?.stage==='processing'){
        this.g.fillStyle(0xe7be61).fillCircle(x-26,y-13,3);
        this.g.lineStyle(2,0xd9bd61).strokeCircle(x+23,y-52,13+Math.sin(this.phase)*2);
      }
    }else if(n.type==='warehouse'){
      this.box(x-31,y-4,78,23,10,0xc7bda4,0xaca18a,0x8f8872);
      this.box(x-31,y-13,6,5,63,0x99ad9a,0x758e78,0x5c7361);
      this.box(x+39,y+5,6,5,63,0x99ad9a,0x758e78,0x5c7361);
      this.box(x-32,y-77,80,23,8,0xc2d2bd,0x9eb294,0x829c7a);
      if(s?.stage==='stored')this.cylinder(x-17,y-31,42,8,true);
    }
  }
}
