import {useCallback,useEffect,useRef} from 'react';
import Phaser from 'phaser';
import {locatedPlacements,type Level} from './level';
import type {FactoryCore} from './core';
import {WorkshopDrawing,projectCell} from './presentation/workshopDrawing';
import {WorkshopInteractions} from './WorkshopInteractions';
import {WORKSHOP_WIDTH,WORKSHOP_HEIGHT,type PartPose} from './presentation/workshopGeometry';
interface WorkshopProps {level:Level;core?:FactoryCore;selected?:string|null;onCell?:(x:number,y:number)=>void;onUpdate?:()=>void}
export function Workshop({level,core,selected,onCell,onUpdate}:WorkshopProps){
  const host=useRef<HTMLDivElement>(null);
  const draggedPart=useRef<PartPose|null>(null);
  const callbacks=useRef({onCell,onUpdate});callbacks.current={onCell,onUpdate};
  const notify=useCallback(()=>callbacks.current.onUpdate?.(),[]);
  const dragChanged=useCallback((pose:PartPose|null)=>{draggedPart.current=pose;},[]);
  useEffect(()=>{
    if(!host.current)return;
    class WorkshopScene extends Phaser.Scene {
      private drawing!:WorkshopDrawing;
      private phase=0;private notifyAt=0;
      private center=projectCell;
      create(){
        this.drawing=new WorkshopDrawing(this.add.graphics());
        if(!core){
          for(let y=0;y<level.grid.height;y++)for(let x=0;x<level.grid.width;x++){
            const c=this.center(x,y);
            this.add.zone(c.x,c.y,116,60).setInteractive(new Phaser.Geom.Polygon([58,0,116,30,58,60,0,30]),Phaser.Geom.Polygon.Contains).on('pointerdown',()=>callbacks.current.onCell?.(x,y));
          }
        }
        for(const p of locatedPlacements(level)){
          const n=level.nodes.find(n=>n.id===p.nodeId);if(!n)continue;
          const c=this.center(p.x,p.y);
          this.add.text(c.x,c.y+42,String(n.params.name),{fontFamily:'Arial',fontSize:'14px',color:'#36554a',backgroundColor:'#edf2e8',padding:{x:5,y:3}}).setOrigin(.5).setDepth(10);
        }
        this.draw();
      }
      update(time:number,delta:number){
        if(core){core.tick(delta);this.phase+=delta/140;this.draw();if(time-this.notifyAt>80){this.notifyAt=time;callbacks.current.onUpdate?.();}}
      }
      private draw(){
        const state=core?.state;
        this.drawing.render({
          grid:level.grid,placements:locatedPlacements(level),nodes:level.nodes.map(n=>({id:n.id,type:n.type,shape:String(n.params.shape??''),length:Number(n.params.length),diameter:Number(n.params.diameter),width:Number(n.params.width),height:Number(n.params.height),machineKind:String(n.params.kind??'')})),selected:selected??null,draggedPart:draggedPart.current,
          production:core&&state?{stage:state.stage,selected:state.selected,target:state.target,
            blank:core.resources.blank,part:state.part,location:state.location,targetIds:core.targetIds,machines:state.machines,warehouses:state.warehouses}:undefined,
        },this.phase);
      }
    }
    const game=new Phaser.Game({type:Phaser.AUTO,parent:host.current,width:WORKSHOP_WIDTH,height:WORKSHOP_HEIGHT,backgroundColor:'#f1f5eb',scene:WorkshopScene,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},audio:{noAudio:true}});
    return()=>{draggedPart.current=null;game.destroy(true);};
  },[level,core,selected]);
  return <div className="workshop-stage"><div className="workshop-canvas" ref={host} aria-label={core?'Изометрический цех':'Карта размещения объектов'} />{core&&<WorkshopInteractions level={level} core={core} onUpdate={notify} onDragChange={dragChanged}/>}</div>;
}
