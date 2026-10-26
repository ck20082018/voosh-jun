import {useEffect,useState} from 'react';
import {PlanningCore} from '../planning';
import {PlanningPlayer} from '../PlanningPlayer';
import {MissionScreen,type MissionScreenProps} from './MissionScreen';
import {TurningTrainingScreen} from './TurningTrainingScreen';
import type {TurningLesson} from '../turningTraining';

/** Single entry for ready plans and player plans; PlanningCore owns the one FactoryCore. */
export function MissionLauncher(props:MissionScreenProps & {training?:TurningLesson}){
 if(props.level.productionMode==='player')return <PlayerMission {...props}/>;
 return <MissionScreen {...props}/>;
}
function PlayerMission(props:MissionScreenProps & {training?:TurningLesson}){
 const [planning]=useState(()=>props.training?null:new PlanningCore(props.level));
 useEffect(()=>()=>planning?.dispose(),[planning]);
 if(props.training)return <TurningTrainingScreen level={props.level} lesson={props.training} onExit={props.onExit} onStarted={()=>props.onStarted?.()} onFinished={s=>props.onFinished?.(s)}/>;
 return <PlanningPlayer exitLabel="К карте миссий" core={planning!} level={props.level} onExit={props.onExit} renderRuntime={(runtime,scene)=>
  <MissionScreen {...props} level={scene} runtime={runtime}/>}/>;
}
