import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {latheMeshes} from '../drawing/mesh';
import {radiusAt,type DrawingSelection} from '../drawingGeometry';
import type {TurningGeometry} from '../turningGeometry';
import './part-inspector.css';
interface Props {geometry?:Readonly<TurningGeometry>;block?:{length:number;width:number;height:number};selection?:DrawingSelection|null;title:string}
type Pose='front'|'end'|'top'|'iso';
interface ViewerAPI {update:(props:Props,cut:boolean)=>void;pose:(pose:Pose)=>void;fit:()=>void;dispose:()=>void}
/** This entire module (including Three.js) is imported only on explicit 3D access. */
export default function PartViewer(props:Props){
 const host=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null),api=useRef<ViewerAPI|null>(null);
 const latest=useRef(props);latest.current=props;
 const [cut,setCut]=useState(false),[error,setError]=useState(''),[fullscreenError,setFullscreenError]=useState(''),[resetKey,setResetKey]=useState(0);
 useEffect(()=>{
  const element=host.current!;let viewer:ViewerAPI|null=null;
  try{viewer=createViewer(element,()=>setError('WebGL-контекст потерян. Закройте и откройте модель заново; 2D-чертёж остаётся доступен.'));api.current=viewer;viewer.update(latest.current,false);}catch{setError('WebGL недоступен: объёмную модель открыть не удалось. Чертёж и размеры доступны в 2D.');}
  return()=>{viewer?.dispose();api.current=null;};
 },[]);
 useEffect(()=>{try{api.current?.update(props,cut);}catch(e){setError(e instanceof Error?e.message:'Не удалось построить модель.');}},[props.geometry,props.block,props.selection,cut]);
 useEffect(()=>{if(resetKey)api.current?.pose('iso');},[resetKey]);
 return <div ref={panel} className="part-viewer" aria-label={`3D: ${props.title}`}>
 <div className="inspector-toolbar" role="group" aria-label="Камера 3D">{(['front','end','top','iso'] as const).map((p,i)=><button type="button" key={p} onClick={()=>api.current?.pose(p)}>{['Спереди','С торца','Сверху','Изометрия'][i]}</button>)}<button type="button" onClick={()=>api.current?.fit()}>Вписать деталь</button><button type="button" onClick={()=>{setCut(false);setResetKey(k=>k+1);}}>Исходный вид</button><button type="button" onClick={async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(panel.current?.requestFullscreen)await panel.current.requestFullscreen();else setFullscreenError('Полноэкранный режим не поддерживается этим браузером.');}catch{setFullscreenError('Браузер отклонил полноэкранный режим.');}}}>Полный экран</button>{props.geometry&&<label><input type="checkbox" checked={cut} onChange={e=>setCut(e.target.checked)}/>Продольный срез 3D</label>}</div>
 {error&&<p role="alert">{error}</p>}<div ref={host} className="part-viewer__canvas" role="img" aria-label={`Вращаемая модель: ${props.title}`} hidden={!!error}/>
 <p>Вращение: левая кнопка / один палец. Перемещение: правая кнопка / два пальца. Колесо или щипок — масштаб. Z — вдоль детали; размеры в мм, пропорции сохранены.</p>
 {props.selection&&<p role="status">Выделение: Z{props.selection.z0}–{props.selection.z1}, {props.selection.surface==='inner'?'внутренняя поверхность':props.selection.surface==='outer'?'наружная поверхность':'интервал'}. Выбранная поверхность обозначена золотистым материалом и этой подписью.</p>}
 {!!props.geometry?.threads?.length&&<p>Резьба показана условными кольцами. Это схема: количество колец не равно числу витков. Размеры и завершённость проверяются по данным резьбы.</p>}{fullscreenError&&<p role="status">{fullscreenError}</p>}
 </div>;
}
function createViewer(host:HTMLDivElement,onContextLost:()=>void):ViewerAPI{
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setClearColor(0xeaf0f4);
 host.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','Деталь с управляемой камерой');
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-50,50,50,-50,.01,10000),controls=new OrbitControls(camera,renderer.domElement);
 controls.minZoom=.25;controls.maxZoom=8;controls.enableDamping=false;controls.cursorStyle='grab';
 scene.add(new THREE.HemisphereLight(0xf7fbff,0x53616a,2.4));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(70,100,120);scene.add(key);const fill=new THREE.DirectionalLight(0xbdd5e7,1.5);fill.position.set(-70,-40,-60);scene.add(fill);
 const model=new THREE.Group();scene.add(model);let radius=40,visible=true,disposed=false,frame=0,lastPose:Pose='iso',lastModelKey='';
 const render=()=>{frame=0;if(!disposed&&visible&&!document.hidden){renderer.render(scene,camera);host.dataset.renderCount=String(Number(host.dataset.renderCount??0)+1);}};
 const invalidate=()=>{if(!frame&&!disposed&&visible&&!document.hidden)frame=requestAnimationFrame(render);};
 const resize=()=>{const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight),aspect=width/height;renderer.setSize(width,height,false);camera.left=-radius*1.2*aspect;camera.right=radius*1.2*aspect;camera.top=radius*1.2;camera.bottom=-radius*1.2;camera.updateProjectionMatrix();invalidate();};
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)invalidate();else if(frame){cancelAnimationFrame(frame);frame=0;}});observer.observe(host);
 const onVisibility=()=>{if(document.hidden&&frame){cancelAnimationFrame(frame);frame=0;}else invalidate();};document.addEventListener('visibilitychange',onVisibility);
 const onLost=(e:Event)=>{e.preventDefault();host.dataset.context='lost';onContextLost();};renderer.domElement.addEventListener('webglcontextlost',onLost);
 renderer.domElement.addEventListener('webglcontextrestored',invalidate);
 controls.addEventListener('change',invalidate);
 const clear=()=>{for(const obj of [...model.children]){if(obj instanceof THREE.Mesh||obj instanceof THREE.Line){obj.geometry.dispose();for(const m of Array.isArray(obj.material)?obj.material:[obj.material])m.dispose();}model.remove(obj);}};
 const fit=()=>{controls.target.set(0,0,0);camera.zoom=1;controls.update();resize();camera.updateMatrixWorld();
  const box=new THREE.Box3().setFromObject(model),projected=box.clone().applyMatrix4(camera.matrixWorldInverse),size=projected.getSize(new THREE.Vector3());
  camera.zoom=Math.min((camera.right-camera.left)/Math.max(.001,size.x),(camera.top-camera.bottom)/Math.max(.001,size.y))*.78;
  camera.zoom=Math.max(controls.minZoom,Math.min(controls.maxZoom,camera.zoom));camera.updateProjectionMatrix();invalidate();};
 const pose=(p:Pose)=>{lastPose=p;const direction={front:[0,0,1],end:[1,0,0],top:[0,1,.00001],iso:[1,.65,1]}[p];camera.position.set(...direction as [number,number,number]).normalize().multiplyScalar(radius*5);camera.up.set(0,1,0);fit();host.dataset.pose=p;};
 host.dataset.context='ready';
 return {
 update:(props,cut)=>{
  const modelKey=JSON.stringify([props.geometry,props.block,props.selection,cut]);if(modelKey===lastModelKey)return;lastModelKey=modelKey;
  clear();const g=props.geometry;
  if(g){
   radius=Math.hypot(g.length/2,Math.max(...g.spans.flatMap(s=>[s.outer0,s.outer1])));
   for(const data of latheMeshes(g,cut,props.selection)){
    const meshGeometry=new THREE.BufferGeometry();meshGeometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));meshGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));meshGeometry.setIndex(data.indices);meshGeometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(meshGeometry,new THREE.MeshStandardMaterial({color:data.selected?0xd99b31:data.surface==='cut'?0xcab98a:data.surface==='inner'?0x809ba8:0x9eb6c5,metalness:.3,roughness:.42}));mesh.userData.surface=data.surface;model.add(mesh);
   }
   for(const t of g.threads??[]){const count=Math.min(12,Math.ceil((t.z1-t.z0)/t.pitch));for(let i=0;i<count;i++){
    const z=t.z0+(t.z1-t.z0)*(i+.5)/count,s=g.spans.find(s=>s.z0<=z&&s.z1>=z)!,r=radiusAt(s,z,t.surface==='inner')+(t.surface==='inner'?-.012:.012),n=cut?96:192;
    const points=Array.from({length:n+1},(_,j)=>{const a=(cut?Math.PI:0)+j/n*(cut?Math.PI:2*Math.PI);return new THREE.Vector3(z-g.length/2,r*Math.cos(a),r*Math.sin(a));});
    const ring=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x4e5a62}));model.add(ring);
   }}
  }else if(props.block){const {length,width,height}=props.block;radius=Math.hypot(length,width,height)/2;model.add(new THREE.Mesh(new THREE.BoxGeometry(length,height,width),new THREE.MeshStandardMaterial({color:0x9eb6c5,metalness:.3,roughness:.42})));}
  controls.maxTargetRadius=radius;camera.near=.01;camera.far=radius*20;camera.updateProjectionMatrix();
  // Orthographic zoom changes the frustum, never moves the eye into the material. Pan is bounded by R, eye stays at 5R.
  if(host.dataset.pose===undefined)pose(lastPose);else{const target=controls.target.clone();camera.position.sub(target).normalize().multiplyScalar(radius*5).add(target);controls.update();resize();}
  host.dataset.meshes=String(model.children.length);invalidate();
 },pose,fit,dispose:()=>{disposed=true;if(frame)cancelAnimationFrame(frame);resizeObserver.disconnect();observer.disconnect();document.removeEventListener('visibilitychange',onVisibility);controls.removeEventListener('change',invalidate);controls.dispose();renderer.domElement.removeEventListener('webglcontextlost',onLost);renderer.domElement.removeEventListener('webglcontextrestored',invalidate);clear();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();host.dataset.context='disposed';}
 };
}
