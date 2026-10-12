import {useEffect,useRef} from 'react';
import Phaser from 'phaser';
import type {Level,Placement} from './level';
import type {FactoryCore} from './core';
interface WorkshopProps {level:Level;core?:FactoryCore;selected?:string|null;onCell?:(x:number,y:number)=>void;onUpdate?:()=>void}
export function Workshop({level,core,selected,onCell,onUpdate}:WorkshopProps){
  const host=useRef<HTMLDivElement>(null);
  const callbacks=useRef({onCell,onUpdate});callbacks.current={onCell,onUpdate};
  useEffect(()=>{
    if(!host.current)return;
    class WorkshopScene extends Phaser.Scene {
      private g!:Phaser.GameObjects.Graphics;
      private phase=0;private notifyAt=0;
      private center(x:number,y:number){return {x:510+(x-y)*58,y:155+(x+y)*30};}
      create(){
        this.g=this.add.graphics();
        if(!core){
          for(let y=0;y<level.grid.height;y++)for(let x=0;x<level.grid.width;x++){
            const c=this.center(x,y);
            this.add.zone(c.x,c.y,116,60).setInteractive(new Phaser.Geom.Polygon([58,0,116,30,58,60,0,30]),Phaser.Geom.Polygon.Contains).on('pointerdown',()=>callbacks.current.onCell?.(x,y));
          }
        }else{
          for(const p of level.placements){
            const c=this.center(p.x,p.y),n=level.nodes.find(n=>n.id===p.nodeId)!;
            this.add.zone(c.x,c.y-38,110,105).setDepth(p.x+p.y).setInteractive({useHandCursor:true}).on('pointerdown',()=>{core.click(n.id);callbacks.current.onUpdate?.();});
            if(n.type==='lathe')this.add.zone(c.x+2,c.y-64,85,30).setDepth(p.x+p.y+.1).setInteractive({useHandCursor:true}).on('pointerdown',()=>{
              core.click(core.state.stage==='finished'?core.resources.blank.id:n.id);callbacks.current.onUpdate?.();
            });
          }
        }
        for(const p of level.placements){
          const n=level.nodes.find(n=>n.id===p.nodeId);if(!n)continue;
          const c=this.center(p.x,p.y);
          this.add.text(c.x,c.y+42,String(n.params.name),{fontFamily:'Arial',fontSize:'14px',color:'#36554a',backgroundColor:'#edf2e8',padding:{x:5,y:3}}).setOrigin(.5).setDepth(10);
        }
        this.draw();
      }
      update(time:number,delta:number){
        if(core){core.tick(delta);this.phase+=delta/140;this.draw();if(time-this.notifyAt>80){this.notifyAt=time;callbacks.current.onUpdate?.();}}
      }
      private poly(points:number[],color:number){this.g.fillStyle(color).fillPoints(points.reduce<Phaser.Geom.Point[]>((a,_,i)=>{if(i%2===0)a.push(new Phaser.Geom.Point(points[i],points[i+1]));return a;},[]),true);}
      private box(x:number,y:number,w:number,d:number,h:number,top:number,front:number,side:number){
        this.poly([x,y-h,x+w,y+d-h,x+w-d,y+2*d-h,x-d,y+d-h],top);
        this.poly([x-d,y+d-h,x+w-d,y+2*d-h,x+w-d,y+2*d,x-d,y+d],front);
        this.poly([x+w-d,y+2*d-h,x+w,y+d-h,x+w,y+d,x+w-d,y+2*d],side);
      }
      private cylinder(x:number,y:number,length:number,r:number,finished:boolean){
        const segment=(sx:number,sy:number,l:number,radius:number)=>{
          this.poly([sx,sy-radius,sx+l,sy-radius+l*.24,sx+l,sy+radius+l*.24,sx,sy+radius],0x9db0b9);
          this.g.fillStyle(0xd6e1e2).fillEllipse(sx,sy,radius*.8,radius*2);
          this.g.fillStyle(0x6e8794).fillEllipse(sx+l,sy+l*.24,radius*.8,radius*2);
          this.g.lineStyle(2,0xedf4ef).lineBetween(sx+3,sy-radius*.5,sx+l-3,sy-radius*.5+l*.24);
        };
        if(finished){
          const blank=core?.resources.blank??level.nodes.find(n=>n.type==='blank')?.params;
          const sections=core?.state.part?.sections??[];
          const total=Number(blank?.length??60);
          const shoulder=length*Math.max(0,1-sections.reduce((sum,section)=>sum+section.length,0)/total);
          let cursor=shoulder;if(shoulder>0)segment(x,y,shoulder,r);
          for(const section of sections){const len=length*section.length/total;segment(x+cursor,y+cursor*.24,len,r*section.diameter/Number(blank?.diameter??20));cursor+=len;}
        }else segment(x,y,length,r);
        if(core?.state.stage==='processing'){
          const offset=Math.sin(this.phase)*r*.6;
          this.g.lineStyle(2,0xfff3c8).lineBetween(x+2,y+offset,x+length-2,y+length*.24+offset);
        }
      }
      private draw(){
        const g=this.g;g.clear();const s=core?.state;
        for(let y=0;y<level.grid.height;y++)for(let x=0;x<level.grid.width;x++){
          const c=this.center(x,y);const p=level.placements.find(p=>p.x===x&&p.y===y);
          this.poly([c.x,c.y-30,c.x+58,c.y,c.x,c.y+30,c.x-58,c.y],(x+y)%2===0?0xe0e8d9:0xe6ecdf);
          g.lineStyle(1,0xcbd7c5).strokePoints([new Phaser.Geom.Point(c.x,c.y-30),new Phaser.Geom.Point(c.x+58,c.y),new Phaser.Geom.Point(c.x,c.y+30),new Phaser.Geom.Point(c.x-58,c.y)],true);
          if(!core&&p?.nodeId===selected){g.lineStyle(3,0xcaa04b).strokeEllipse(c.x,c.y,102,48);}
        }
        const placements=[...level.placements].sort((a,b)=>(a.x+a.y)-(b.x+b.y));
        for(const p of placements)this.object(p,s?.selected??selected??null);
      }
      private object(p:Placement,selection:string|null){
        const n=level.nodes.find(n=>n.id===p.nodeId);if(!n)return;
        const c=this.center(p.x,p.y),x=c.x,y=c.y;
        const s=core?.state;
        this.g.fillStyle(0x507254,.12).fillEllipse(x,y+17,105,40);
        const partHere=n.type==='blank'&&(!core||s?.stage==='table')||n.type==='lathe'&&s?.stage==='finished';
        if((selection===n.id&&(n.type!=='blank'||partHere))||(partHere&&selection===core?.resources.blank.id))this.g.lineStyle(3,0xcaa04b).strokeEllipse(x,y+7,110,53);
        if(s?.target&&(n.type==='lathe'&&s.target==='machine'||n.type==='warehouse'&&s.target==='warehouse'))this.g.lineStyle(3,0x72aeb1).strokeEllipse(x,y+8,112,55);
        if(n.type==='blank'){
          this.box(x-32,y+8,9,5,47,0xae9870,0x8e7d59,0x73694d);this.box(x+25,y+24,9,5,47,0xae9870,0x8e7d59,0x73694d);
          this.box(x-27,y-8,75,22,10,0xd0b98e,0xb49b75,0x938263);
          if(!core||s?.stage==='table')this.cylinder(x-18,y-34,46,9,false);
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
    const game=new Phaser.Game({type:Phaser.AUTO,parent:host.current,width:1020,height:660,backgroundColor:'#f1f5eb',scene:WorkshopScene,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},audio:{noAudio:true}});
    return()=>game.destroy(true);
  },[level,core,selected]);
  return <div className="workshop-canvas" ref={host} aria-label={core?'Изометрический цех':'Карта размещения объектов'} />;
}
