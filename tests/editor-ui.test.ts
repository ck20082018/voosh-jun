import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost:8081',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','Element','Node','SVGElement','Event','MouseEvent','MutationObserver','localStorage','getComputedStyle'] as const){
  Object.defineProperty(globalThis,key,{value:key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key],configurable:true});
}
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window)});
class Matrix {m22=1;}
Object.defineProperty(dom.window,'DOMMatrixReadOnly',{value:Matrix});
function rect(left:number,top:number,width:number,height:number):DOMRect{return {x:left,y:top,left,top,width,height,right:left+width,bottom:top+height,toJSON(){return {};}} as DOMRect;}
function nodePosition(element:Element){const match=(element as HTMLElement).style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);return {x:Number(match?.[1]??0),y:Number(match?.[2]??0)};}
Object.defineProperties(dom.window.HTMLElement.prototype,{
  offsetWidth:{get(){return this.classList.contains('react-flow__handle')?9:this.classList.contains('react-flow__node')?(Number.parseFloat(this.style.width)||230):1000;}},
  offsetHeight:{get(){return this.classList.contains('react-flow__handle')?9:this.classList.contains('react-flow__node')?(Number.parseFloat(this.style.height)||200):620;}},
  clientWidth:{get(){return this.offsetWidth;}},clientHeight:{get(){return this.offsetHeight;}},
});
dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
  const node=this.closest('.react-flow__node');
  if(node){const position=nodePosition(node);
    if(this.classList.contains('react-flow__handle')){
      const source=this.classList.contains('source');const siblings=[...node.querySelectorAll(source?'.react-flow__handle.source':'.react-flow__handle.target')];
      return rect(position.x+(source?(node as HTMLElement).offsetWidth:0)-4.5,position.y+70+siblings.indexOf(this)*27,9,9);
    }
    return rect(position.x,position.y,(node as HTMLElement).offsetWidth,(node as HTMLElement).offsetHeight);
  }
  return rect(220,160,1000,620);
};
class ResizeObserverMock {
  callback:ResizeObserverCallback;observed=new Set<Element>();
  constructor(callback:ResizeObserverCallback){this.callback=callback;}
  observe(element:Element){this.observed.add(element);setTimeout(()=>{if(this.observed.has(element))this.callback([{target:element,contentRect:element.getBoundingClientRect()} as ResizeObserverEntry],this as unknown as ResizeObserver);},0);}
  unobserve(element:Element){this.observed.delete(element);}disconnect(){this.observed.clear();}
}
Object.defineProperty(globalThis,'ResizeObserver',{value:ResizeObserverMock,configurable:true});
Object.defineProperty(dom.window,'ResizeObserver',{value:ResizeObserverMock});
const {createElement}=await import('react');
const {render,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');
const {App}=await import('../src/App');
afterEach(()=>{cleanup();localStorage.clear();});
async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,60));});}

test('editor UI: the start node and its outgoing SVG line both move on a mouse drag',async()=>{
  const view=render(createElement(App));await settle();
  await waitFor(()=>assert.equal(view.container.querySelectorAll('.react-flow__node').length,12));
  const node=view.getByTestId('rf__node-start');
  await waitFor(()=>assert.equal(node.style.visibility,'visible'));
  const edge=view.getByTestId('rf__edge-start-out-intro-in');
  const path=edge.querySelector('.react-flow__edge-path')!;
  const oldPath=path.getAttribute('d'),oldTransform=node.style.transform;
  const heading=node.querySelector('.node-heading')!;
  fireEvent.mouseDown(heading,{clientX:20,clientY:20,button:0,buttons:1,view:dom.window});
  fireEvent.mouseMove(dom.window as unknown as Window,{clientX:30,clientY:25,buttons:1,view:dom.window});
  fireEvent.mouseMove(dom.window as unknown as Window,{clientX:180,clientY:125,buttons:1,view:dom.window});
  await settle();
  fireEvent.mouseUp(dom.window as unknown as Window,{clientX:180,clientY:125,button:0,view:dom.window});await settle();
  assert.notEqual(node.style.transform,oldTransform,'node must move');
  assert.notEqual(path.getAttribute('d'),oldPath,'the connected line must move with the start node');
});

test('editor UI: nodes can be added to an empty project from the library',async()=>{
  const view=render(createElement(App));await settle();
  fireEvent.click(view.getByRole('button',{name:'Новый уровень'}));await settle();
  assert.equal(view.container.querySelectorAll('.react-flow__node').length,0);
  fireEvent.click(view.getByRole('button',{name:/Начало уровня.*\+/}));await settle();
  const nodes=view.container.querySelectorAll<HTMLElement>('.react-flow__node');
  assert.equal(nodes.length,1);assert.equal(nodes[0].style.visibility,'visible');
  assert.ok(view.container.textContent?.includes('1 нод'));
});

test('editor UI: every node type moves its connected lines when dragged by its heading',async()=>{
  const view=render(createElement(App));await settle();
  fireEvent.click(view.getByRole('button',{name:'Проверка выбора'}));await settle();
  const ids=['start','intro','blank','tool','process','part','lathe','warehouse','task','wait','check','finish'];
  const sample=(await import('../src/level')).checkLevel();
  for(const id of ids){
    const node=view.getByTestId(`rf__node-${id}`);
    const edges=[...view.container.querySelectorAll('.react-flow__edge')].filter(edge=>{
      const definition=sample.edges.find(e=>e.id===edge.getAttribute('data-id'));return definition?.source===id||definition?.target===id;
    });
    assert.ok(edges.length>0,`${id} must have a connection`);
    const before=edges.map(edge=>edge.querySelector('.react-flow__edge-path')!.getAttribute('d'));
    const transform=node.style.transform;const heading=node.querySelector('.node-heading')!;
    fireEvent.mouseDown(heading,{clientX:320,clientY:240,button:0,buttons:1,view:dom.window});
    fireEvent.mouseMove(dom.window as unknown as Window,{clientX:330,clientY:245,buttons:1,view:dom.window});
    fireEvent.mouseMove(dom.window as unknown as Window,{clientX:405,clientY:290,buttons:1,view:dom.window});await settle();
    fireEvent.mouseUp(dom.window as unknown as Window,{clientX:405,clientY:290,button:0,view:dom.window});await settle();
    assert.notEqual(node.style.transform,transform,`${id} must move`);
    edges.forEach((edge,index)=>assert.notEqual(edge.querySelector('.react-flow__edge-path')!.getAttribute('d'),before[index],`${id}: connection ${edge.getAttribute('data-id')} must move`));
  }
});

test('editor UI: repeated additions get separate positions and the toolbar can add custom nodes',async()=>{
  const view=render(createElement(App));await settle();
  fireEvent.click(view.getByRole('button',{name:'Новый уровень'}));await settle();
  const addStart=view.getByRole('button',{name:/Начало уровня.*\+/});
  fireEvent.click(addStart);await settle();fireEvent.click(addStart);await settle();
  const starts=view.container.querySelectorAll<HTMLElement>('.react-flow__node');
  assert.equal(starts.length,2);assert.notEqual(starts[0].style.transform,starts[1].style.transform);
  fireEvent.change(view.getByLabelText('Тип новой ноды'),{target:{value:'blank'}});
  fireEvent.click(view.getByRole('button',{name:'+ Добавить ноду'}));await settle();
  assert.equal(view.container.querySelectorAll('.react-flow__node').length,3);
  assert.ok(view.container.textContent?.includes('Стальная заготовка'));
});

test('editor UI: an unfinished custom level can be saved and restored after reload',async()=>{
  let view=render(createElement(App));await settle();
  fireEvent.click(view.getByRole('button',{name:'Новый уровень'}));await settle();
  fireEvent.click(view.getByRole('button',{name:/Заготовка.*\+/}));await settle();
  fireEvent.change(view.getByLabelText('Название'),{target:{value:'Моя заготовка'}});
  fireEvent.click(view.getByRole('button',{name:'Сохранить'}));await settle();
  assert.ok(view.container.textContent?.includes('Черновик сохранён'));
  const stored=JSON.parse(localStorage.getItem('factory-level-v4')!);
  assert.equal(stored.nodes.length,1);assert.equal(stored.nodes[0].params.name,'Моя заготовка');assert.equal('measured' in stored.nodes[0],false);
  cleanup();view=render(createElement(App));await settle();
  assert.equal(view.container.querySelectorAll('.react-flow__node').length,1);
  assert.ok(view.container.textContent?.includes('Моя заготовка'));
});

test('editor UI: dragging from an output handle to a free input creates and saves an execution edge',async()=>{
  const {exampleLevel}=await import('../src/level');
  const project=exampleLevel();project.edges=project.edges.filter(edge=>edge.id!=='start-out-intro-in');
  localStorage.setItem('factory-level-v4',JSON.stringify(project));
  const view=render(createElement(App));await settle();
  assert.equal(view.container.querySelectorAll('.react-flow__edge').length,9);
  const source=view.getByTestId('rf__node-start').querySelector<HTMLElement>('.source[data-handleid="out"]')!;
  const target=view.getByTestId('rf__node-intro').querySelector<HTMLElement>('.target[data-handleid="in"]')!;
  Object.defineProperty(document,'elementFromPoint',{value:()=>target,configurable:true});
  const sourceRect=source.getBoundingClientRect(),targetRect=target.getBoundingClientRect();
  fireEvent.mouseDown(source,{clientX:sourceRect.left+4,clientY:sourceRect.top+4,button:0,buttons:1,view:dom.window});
  fireEvent.mouseMove(document,{clientX:targetRect.left+4,clientY:targetRect.top+4,buttons:1,view:dom.window});await settle();
  fireEvent.mouseUp(document,{clientX:targetRect.left+4,clientY:targetRect.top+4,button:0,view:dom.window});await settle();
  assert.equal(view.container.querySelectorAll('.react-flow__edge').length,10);
  fireEvent.click(view.getByRole('button',{name:'Сохранить'}));await settle();
  const stored=JSON.parse(localStorage.getItem('factory-level-v4')!);
  assert.equal(stored.edges.filter((edge:{source:string;target:string})=>edge.source==='start'&&edge.target==='intro').length,1);
  Object.defineProperty(document,'elementFromPoint',{value:()=>null,configurable:true});
});

test('editor UI: welcome example runs without a workshop and can be completed',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'Приветствие'}));await settle();
 assert.equal(view.container.querySelectorAll('.react-flow__node').length,3);fireEvent.click(view.getByRole('button',{name:'▶ Протестировать'}));await settle();assert.ok(view.container.textContent?.includes('Добро пожаловать!'));assert.equal(view.container.querySelector('canvas'),null);fireEvent.click(view.getByRole('button',{name:'Продолжить →'}));await settle();assert.ok(view.container.textContent?.includes('Знакомство завершено.'));
});
test('editor UI: labels create a connection without hitting a small handle; duplicates are rejected',async()=>{
 const {welcomeLevel}=await import('../src/level');const level=welcomeLevel();level.edges=[];localStorage.setItem('factory-level-v4',JSON.stringify(level));
 const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'Выход Далее: Начало уровня'}));fireEvent.click(view.getByRole('button',{name:'Вход Выполнение: Вступление'}));await settle();assert.equal(view.container.querySelectorAll('.react-flow__edge').length,1);
 fireEvent.click(view.getByRole('button',{name:'Выход Далее: Начало уровня'}));fireEvent.click(view.getByRole('button',{name:'Вход Выполнение: Вступление'}));await settle();assert.equal(view.container.querySelectorAll('.react-flow__edge').length,1);assert.ok(view.container.textContent?.includes('Эта связь уже существует'));
 fireEvent.click(view.getByRole('button',{name:'Сохранить'}));const stored=JSON.parse(localStorage.getItem('factory-level-v4')!);assert.equal(stored.edges.length,1);
});
test('editor UI: connection builder creates a data edge via dropdowns',async()=>{
 const {exampleLevel}=await import('../src/level');const level=exampleLevel();level.edges=level.edges.filter(edge=>!(edge.target==='lathe'&&edge.targetHandle==='blank'));localStorage.setItem('factory-level-v4',JSON.stringify(level));
 const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'+ Добавить связь'}));
 fireEvent.change(view.getByLabelText('Выход новой связи'),{target:{value:JSON.stringify(['blank','blank'])}});fireEvent.click(view.getByRole('button',{name:'Создать связь'}));await settle();
 assert.equal(view.container.querySelectorAll('.react-flow__edge').length,10);fireEvent.click(view.getByRole('button',{name:'Сохранить'}));assert.equal(JSON.parse(localStorage.getItem('factory-level-v4')!).edges.filter((edge:{source:string;target:string})=>edge.source==='blank'&&edge.target==='lathe').length,1);
});
test('editor UI: border resizing updates the port endpoint, persists and has no size property fields',async()=>{
 let view=render(createElement(App));await settle();fireEvent.click(view.getByTestId('rf__node-intro'));await settle();
 assert.equal(view.queryByLabelText('Ширина ноды'),null);assert.equal(view.queryByLabelText('Высота ноды'),null);
 const outgoing=view.getByTestId('rf__edge-intro-out-task-in').querySelector('.react-flow__edge-path')!;const previousPath=outgoing.getAttribute('d');
 const grip=view.getByTestId('rf__node-intro').querySelector('.react-flow__resize-control.bottom.right')!;assert.ok(grip);
 fireEvent.mouseDown(grip,{clientX:500,clientY:200,button:0,buttons:1,view:dom.window});
 fireEvent.mouseMove(dom.window as unknown as Window,{clientX:700,clientY:290,buttons:1,view:dom.window});await settle();
 fireEvent.mouseUp(dom.window as unknown as Window,{clientX:700,clientY:290,button:0,view:dom.window});await settle();
 const width=view.getByTestId('rf__node-intro').style.width;assert.notEqual(width,'230px');assert.notEqual(outgoing.getAttribute('d'),previousPath);
 fireEvent.click(view.getByRole('button',{name:'Сохранить'}));const stored=JSON.parse(localStorage.getItem('factory-level-v4')!);assert.ok(stored.nodes.find((n:{id:string})=>n.id==='intro').size.width>230);
 cleanup();view=render(createElement(App));await settle();assert.equal(view.getByTestId('rf__node-intro').style.width,width);
});

test('editor UI: deleting a node cleans up its clickable ports and does not crash the editor',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByTestId('rf__node-intro'));fireEvent.click(view.getByRole('button',{name:'Удалить ноду'}));await settle();assert.equal(view.container.querySelectorAll('.react-flow__node').length,11);assert.equal(view.queryByTestId('rf__node-intro'),null);
});

test('editor UI: shape fields, tool categories and operation add/reorder/delete use real controls',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByTestId('rf__node-blank'));
 assert.ok(view.getByLabelText('Диаметр, мм'));assert.equal(view.queryByLabelText('Ширина, мм'),null);
 fireEvent.change(view.getByLabelText('Форма'),{target:{value:'block'}});assert.equal(view.queryByLabelText('Диаметр, мм'),null);assert.ok(view.getByLabelText('Ширина, мм'));assert.ok(view.getByLabelText('Высота, мм'));
 fireEvent.click(view.getByTestId('rf__node-tool'));fireEvent.change(view.getByLabelText('Категория'),{target:{value:'milling'}});assert.equal((view.getByLabelText('Инструмент') as HTMLSelectElement).value,'face');assert.equal(view.queryByRole('option',{name:/Проходной/}),null);
 fireEvent.click(view.getByTestId('rf__node-process'));fireEvent.click(view.getByRole('button',{name:'+ Фрезерование плоскости'}));fireEvent.click(view.getByRole('button',{name:'Переместить операцию 2 вверх'}));fireEvent.click(view.getByRole('button',{name:'Сохранить'}));
 let saved=JSON.parse(localStorage.getItem('factory-level-v4')!);assert.deepEqual(saved.nodes.find((n:{id:string})=>n.id==='process').params.operations.map((o:{kind:string})=>o.kind),['milling','turning']);
 fireEvent.click(view.getByRole('button',{name:'Удалить операцию 2'}));fireEvent.click(view.getByRole('button',{name:'Сохранить'}));saved=JSON.parse(localStorage.getItem('factory-level-v4')!);assert.equal(saved.nodes.find((n:{id:string})=>n.id==='process').params.operations.length,1);
 fireEvent.click(view.getByTestId('rf__node-task'));assert.equal(view.getByTestId('rf__node-task').querySelectorAll('.react-flow__handle.target').length,1);
});

test('editor UI: explicit result copy happens once and independent fields survive process edits',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByTestId('rf__node-process'));fireEvent.change(view.getByLabelText('Операции 1: diameter'),{target:{value:10}});
 fireEvent.click(view.getByTestId('rf__node-part'));fireEvent.click(view.getByRole('button',{name:'Заполнить из техпроцесса'}));assert.equal((view.getByLabelText('Диаметр участка 1, мм') as HTMLInputElement).value,'10');
 fireEvent.click(view.getByTestId('rf__node-process'));fireEvent.change(view.getByLabelText('Операции 1: diameter'),{target:{value:8}});fireEvent.click(view.getByTestId('rf__node-part'));assert.equal((view.getByLabelText('Диаметр участка 1, мм') as HTMLInputElement).value,'10');
});

test('editor UI: raster upload/replace/delete and decoder failures preserve the image and project',async()=>{
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 let fail=false;class ImageMock {src='';naturalWidth=1;naturalHeight=1;async decode(){if(fail)throw new Error('corrupt');}}
 Object.defineProperty(globalThis,'Image',{value:ImageMock,configurable:true});
 const file=new File([Uint8Array.from(atob(png.split(',')[1]),x=>x.charCodeAt(0))],'intro.png',{type:'image/png'});
 let view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'Приветствие'}));await settle();fireEvent.click(view.getByTestId('rf__node-intro'));
 fireEvent.change(view.getByLabelText('Изображение (PNG, JPEG, WebP)'),{target:{files:[file]}});await settle();assert.equal(view.container.querySelector('img')!.getAttribute('src'),png);
 fail=true;fireEvent.change(view.getByLabelText('Изображение (PNG, JPEG, WebP)'),{target:{files:[file]}});await settle();assert.equal(view.container.querySelector('img')!.getAttribute('src'),png);assert.ok(view.container.textContent?.includes('Изображение не изменено'));
 fail=false;fireEvent.click(view.getByRole('button',{name:'Сохранить'}));const raw=localStorage.getItem('factory-level-v4')!;assert.equal(JSON.parse(raw).nodes.find((n:{type:string})=>n.type==='intro').params.image,png);
 cleanup();view=render(createElement(App));await settle();fireEvent.click(view.getByTestId('rf__node-intro'));assert.equal(view.container.querySelector('img')!.getAttribute('src'),png);
 fireEvent.click(view.getByRole('button',{name:'▶ Протестировать'}));await settle();assert.equal(view.container.querySelector('img')!.getAttribute('src'),png);fireEvent.click(view.getByRole('button',{name:'Продолжить →'}));assert.ok(view.container.textContent?.includes('Знакомство завершено.'));
 fireEvent.click(view.getByRole('button',{name:'← Вернуться в редактор'}));await settle();fireEvent.click(view.getByTestId('rf__node-intro'));fireEvent.click(view.getByRole('button',{name:'Удалить изображение'}));assert.equal(view.container.querySelector('img'),null);
});

test('editor UI: map settings use the canonical grid, protect occupied points and preserve point IDs',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByTestId('rf__node-map'));assert.equal((view.getByLabelText('Количество точек') as HTMLInputElement).value,'5');
 fireEvent.change(view.getByLabelText('Количество точек'),{target:{value:2}});assert.ok(view.container.textContent?.includes('Нельзя удалить занятые точки'));assert.equal((view.getByLabelText('Количество точек') as HTMLInputElement).value,'5');
 fireEvent.change(view.getByLabelText('Ширина карты, клеток'),{target:{value:2}});assert.ok(view.container.textContent?.includes('затрагивают занятые точки'));assert.equal((view.getByLabelText('Ширина карты, клеток') as HTMLInputElement).value,'5');
 fireEvent.change(view.getByLabelText('Количество точек'),{target:{value:4}});fireEvent.click(view.getByRole('button',{name:'Сохранить'}));const saved=JSON.parse(localStorage.getItem('factory-level-v4')!);assert.equal(saved.grid.points.length,4);assert.equal('width' in saved.nodes.find((n:{type:string})=>n.type==='map').params,false);assert.deepEqual(saved.placements.map((p:{pointId:string})=>p.pointId),['point-blank','point-lathe','point-warehouse']);
 fireEvent.click(view.getByRole('button',{name:'Удалить ноду'}));assert.ok(view.getByTestId('rf__node-map'));assert.ok(view.container.textContent?.includes('Нельзя удалить карту'));
});
test('editor UI: new hint and event properties persist; intermediate warehouse exposes a blank output',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'Два станка'}));await settle();fireEvent.click(view.getByTestId('rf__node-installed-hint'));fireEvent.change(view.getByLabelText('Способ показа'),{target:{value:'modal'}});fireEvent.change(view.getByLabelText('Частота'),{target:{value:'each'}});fireEvent.click(view.getByRole('button',{name:'Сохранить'}));const saved=JSON.parse(localStorage.getItem('factory-level-v4')!);assert.equal(saved.nodes.find((n:{id:string})=>n.id==='installed-hint').params.display,'modal');assert.equal(saved.nodes.find((n:{id:string})=>n.id==='installed-hint').params.frequency,'each');
 assert.ok(view.getByTestId('rf__node-warehouse').querySelector('.source[data-handleid="blank"]'));assert.equal(view.getByTestId('rf__node-final-store').querySelector('.source[data-handleid="blank"]'),null);assert.ok(view.getByTestId('rf__node-wait').querySelector('.source[data-handleid="detail"]'));
});
test('editor UI: sequential modal hints confirm once without showing an intro window at the same time',async()=>{
 const {welcomeLevel,makeNode,connect}=await import('../src/level');const l=welcomeLevel();const h=makeNode('hint','help');Object.assign(h.params,{display:'modal',title:'Рабочая подсказка'});l.nodes.push(h);l.edges=l.edges.filter(e=>e.source!=='intro');connect(l,'intro','out','help','in');connect(l,'help','out','finish','in');localStorage.setItem('factory-level-v4',JSON.stringify(l));const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'▶ Протестировать'}));fireEvent.click(view.getByRole('button',{name:'Продолжить →'}));await settle();assert.equal(view.getAllByRole('dialog').length,1);assert.ok(view.getByRole('dialog',{name:'Подсказка'}));fireEvent.click(view.getByRole('button',{name:'Продолжить'}));assert.ok(view.container.textContent?.includes('Знакомство завершено.'));assert.equal(view.queryByRole('dialog'),null);
});

test('planning UI: example permits correcting incompatible choices, editing/reordering tools and pure preview without manufacturing',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'Ось: план игрока'}));await settle();fireEvent.click(view.getByRole('button',{name:'▶ Протестировать'}));await settle();
 assert.ok(view.container.textContent?.includes('План производства'));
 fireEvent.click(view.getByRole('button',{name:/Тонкая стальная заготовка/}));fireEvent.click(view.getByRole('button',{name:/Фрезерный станок/}));fireEvent.change(view.getByLabelText('Точка станка'),{target:{value:'machine-point'}});
 fireEvent.click(view.getByRole('button',{name:'+ Продольное точение'}));fireEvent.change(view.getByLabelText('Инструмент операции 1'),{target:{value:'passing-choice'}});fireEvent.change(view.getByLabelText('Длина операции 1'),{target:{value:'20'}});fireEvent.click(view.getByRole('button',{name:'Проверить план'}));
 assert.ok(view.container.textContent?.includes('для этой операции нужен токарный станок'));
 fireEvent.click(view.getByRole('button',{name:/Токарный станок/}));fireEvent.click(view.getByRole('button',{name:'Проверить план'}));assert.ok(view.container.textContent?.includes('Конечный диаметр должен быть меньше'));
 fireEvent.click(view.getByRole('button',{name:/Стальная заготовка Ø20/}));fireEvent.click(view.getByRole('button',{name:'+ Продольное точение'}));fireEvent.change(view.getByLabelText('Инструмент операции 2'),{target:{value:'passing-choice'}});fireEvent.change(view.getByLabelText('Диаметр операции 2'),{target:{value:'8'}});fireEvent.change(view.getByLabelText('Длина операции 2'),{target:{value:'20'}});
 fireEvent.click(view.getByRole('button',{name:'Переместить операцию 2 вверх'}));assert.equal((view.getByLabelText('Диаметр операции 1') as HTMLInputElement).value,'8');fireEvent.click(view.getByRole('button',{name:'Переместить операцию 1 вниз'}));assert.equal((view.getByLabelText('Диаметр операции 1') as HTMLInputElement).value,'12');
 fireEvent.click(view.getByRole('button',{name:'Пробная обработка'}));assert.ok(view.container.textContent?.includes('План технически допустим'));assert.ok(view.getByRole('img',{name:'Пробный результат'}));assert.equal(view.container.querySelector('canvas'),null);assert.equal(view.queryByRole('button',{name:'Обработать 1 / 2'}),null);assert.equal(view.queryByLabelText('Длительность операции 1'),null);
 fireEvent.click(view.getByRole('button',{name:'Удалить операцию 2'}));assert.equal(view.queryByLabelText('Диаметр операции 2'),null);fireEvent.click(view.getByRole('button',{name:'Начать заново'}));assert.equal(view.queryByLabelText('Диаметр операции 1'),null);assert.equal(view.queryByRole('img',{name:'Пробный результат'}),null);
 fireEvent.click(view.getByRole('button',{name:'← Вернуться в редактор'}));await settle();fireEvent.click(view.getByRole('button',{name:'Сохранить'}));const stored=JSON.parse(localStorage.getItem('factory-level-v4')!);assert.equal(stored.productionMode,'player');assert.equal(stored.groups.length,3);assert.equal(stored.nodes.some((n:{type:string})=>n.type==='process'),false);
});

test('editor UI: Shift grouping, rename/color, group drag, membership and frame Delete preserve nodes and crossing edges',async()=>{
 const view=render(createElement(App));await settle();
 fireEvent.click(view.getByTestId('rf__node-start'));await settle();fireEvent.keyDown(dom.window as unknown as Window,{key:'Shift',code:'ShiftLeft'});fireEvent.click(view.getByTestId('rf__node-intro'),{shiftKey:true});fireEvent.keyUp(dom.window as unknown as Window,{key:'Shift',code:'ShiftLeft'});await settle();
 const groupButton=view.getByRole('button',{name:'Группировать выделенные'});assert.equal((groupButton as HTMLButtonElement).disabled,false);fireEvent.click(groupButton);await settle();const frame=view.container.querySelector<HTMLElement>('.react-flow__node-frame')!;assert.ok(frame);fireEvent.click(frame);await settle();
 fireEvent.change(view.getByLabelText('Название группы'),{target:{value:'Моя группа'}});fireEvent.change(view.getByLabelText('Цвет группы'),{target:{value:'#123456'}});await settle();
 const start=view.getByTestId('rf__node-start'),edge=view.getByTestId('rf__edge-start-out-intro-in').querySelector('.react-flow__edge-path')!,boundary=view.getByTestId('rf__edge-intro-out-task-in').querySelector('.react-flow__edge-path')!;
 const originalPosition=nodePosition(start),oldPath=edge.getAttribute('d'),oldBoundary=boundary.getAttribute('d');const heading=frame.querySelector('.group-heading')!;
 fireEvent.mouseDown(heading,{clientX:20,clientY:20,button:0,buttons:1,view:dom.window});fireEvent.mouseMove(dom.window as unknown as Window,{clientX:30,clientY:25,buttons:1,view:dom.window});fireEvent.mouseMove(dom.window as unknown as Window,{clientX:120,clientY:90,buttons:1,view:dom.window});await settle();fireEvent.mouseUp(dom.window as unknown as Window,{clientX:120,clientY:90,button:0,view:dom.window});await settle();
 assert.notDeepEqual(nodePosition(start),originalPosition);assert.notEqual(edge.getAttribute('d'),oldPath);assert.notEqual(boundary.getAttribute('d'),oldBoundary);
 fireEvent.click(frame);await settle();const topLeft=frame.querySelector('.react-flow__resize-control.handle.top.left')!;assert.ok(topLeft);const beforeResize=nodePosition(start),beforeResizePath=boundary.getAttribute('d'),widthBefore=frame.style.width;
 fireEvent.mouseDown(topLeft,{clientX:300,clientY:200,button:0,buttons:1,view:dom.window});fireEvent.mouseMove(dom.window as unknown as Window,{clientX:250,clientY:160,buttons:1,view:dom.window});await settle();fireEvent.mouseUp(dom.window as unknown as Window,{clientX:250,clientY:160,button:0,view:dom.window});await settle();assert.notEqual(frame.style.width,widthBefore);assert.deepEqual(nodePosition(start),beforeResize);assert.equal(boundary.getAttribute('d'),beforeResizePath);

 fireEvent.click(view.getByTestId('rf__node-task'));await settle();fireEvent.change(view.getByLabelText('Группа ноды'),{target:{value:frame.getAttribute('data-id')}});await settle();fireEvent.change(view.getByLabelText('Группа ноды'),{target:{value:''}});await settle();
 fireEvent.click(frame);await settle();fireEvent.click(view.getByRole('button',{name:'Сохранить'}));const grouped=JSON.parse(localStorage.getItem('factory-level-v4')!);assert.equal(grouped.groups[0].name,'Моя группа');assert.equal(grouped.groups[0].color,'#123456');const before=nodePosition(start);
 fireEvent.keyDown(document,{key:'Delete',code:'Delete'});fireEvent.keyUp(document,{key:'Delete',code:'Delete'});await settle();assert.equal(!!view.container.querySelector('.react-flow__node-frame'),false);assert.equal(view.container.querySelectorAll('.react-flow__node').length,12);assert.equal(view.container.querySelectorAll('.react-flow__edge').length,10);assert.deepEqual(nodePosition(start),before);
 fireEvent.click(view.getByRole('button',{name:'Сохранить'}));const stored=JSON.parse(localStorage.getItem('factory-level-v4')!);assert.equal(stored.groups.length,0);assert.equal(stored.nodes.filter((n:{groupId?:string})=>n.groupId).length,0);assert.deepEqual(stored.edges,grouped.edges);
});

test('editor mouse controls: left pans; right marquee selects at transformed coordinates without moving nodes',async()=>{
 const {GraphEditor}=await import('../src/GraphEditor');const {exampleLevel}=await import('../src/level');const {useState}=await import('react');
 type Instance=import('@xyflow/react').ReactFlowInstance<import('../src/editorFlow').EditorNode,import('@xyflow/react').Edge>;
 let flow:Instance|null=null;const init=(value:Instance|null)=>{flow=value;};const original=exampleLevel();
 function Harness(){const [level,setLevel]=useState(original),[selected,setSelected]=useState<string|null>(null);return createElement(GraphEditor,{level,selected,focusNodeId:null,setLevel,setSelected,onInit:init,onAdd:()=>{},onNotice:()=>{}});}
 const view=render(createElement(Harness));await settle();assert.ok(flow);const api=flow as Instance;
 await act(async()=>{await api.setViewport({x:80,y:60,zoom:.75});});await settle();
 const pane=view.container.querySelector('.react-flow__pane')!;const before=api.getViewport(),positions=api.getNodes().map(n=>({id:n.id,position:n.position}));
 fireEvent.mouseDown(pane,{clientX:750,clientY:500,button:0,buttons:1,view:dom.window});fireEvent.mouseMove(dom.window as unknown as Window,{clientX:810,clientY:530,buttons:1,view:dom.window});await settle();fireEvent.mouseUp(dom.window as unknown as Window,{clientX:810,clientY:530,button:0,view:dom.window});await settle();
 assert.notDeepEqual(api.getViewport(),before);assert.deepEqual(api.getNodes().map(n=>({id:n.id,position:n.position})),positions);assert.equal(view.queryByLabelText('Рамка выделения нод'),null);
 const p=api.flowToScreenPosition({x:-10,y:-10}),q=api.flowToScreenPosition({x:520,y:220}),viewport=api.getViewport();
 fireEvent.mouseDown(pane,{clientX:q.x,clientY:q.y,button:2,buttons:2,view:dom.window});fireEvent.mouseMove(dom.window as unknown as Window,{clientX:p.x,clientY:p.y,buttons:2,view:dom.window});await settle();assert.ok(view.getByLabelText('Рамка выделения нод'));fireEvent.mouseUp(dom.window as unknown as Window,{clientX:p.x,clientY:p.y,button:2,view:dom.window});await settle();
 assert.deepEqual(api.getNodes().filter(n=>n.selected).map(n=>n.id).sort(),['intro','start']);assert.deepEqual(api.getViewport(),viewport);assert.deepEqual(api.getNodes().map(n=>({id:n.id,position:n.position})),positions);assert.equal(view.queryByLabelText('Рамка выделения нод'),null);assert.equal((view.getByRole('button',{name:'Группировать выделенные'}) as HTMLButtonElement).disabled,false);
 assert.equal(fireEvent.contextMenu(pane),false,'the browser menu must not cover the marquee');
 const a=api.flowToScreenPosition({x:550,y:-10}),b=api.flowToScreenPosition({x:800,y:220});fireEvent.mouseDown(pane,{clientX:a.x,clientY:a.y,button:2,buttons:2,shiftKey:true,view:dom.window});fireEvent.mouseMove(dom.window as unknown as Window,{clientX:b.x,clientY:b.y,buttons:2,view:dom.window});fireEvent.mouseUp(dom.window as unknown as Window,{clientX:b.x,clientY:b.y,button:2,view:dom.window});await settle();assert.deepEqual(api.getNodes().filter(n=>n.selected).map(n=>n.id).sort(),['intro','start','task']);
 fireEvent.mouseDown(pane,{clientX:p.x,clientY:p.y,button:2,buttons:2,view:dom.window});fireEvent.mouseMove(dom.window as unknown as Window,{clientX:q.x,clientY:q.y,buttons:2,view:dom.window});await settle();fireEvent.blur(dom.window as unknown as Window);await settle();assert.equal(view.queryByLabelText('Рамка выделения нод'),null);
});

test('editor undo: Cmd+Z/Ctrl+Z reverse add, property edit and deletion; text inputs keep native undo',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'Новый уровень'}));fireEvent.click(view.getByRole('button',{name:/Заготовка.*\+/}));await settle();
 assert.equal(view.container.querySelectorAll('.react-flow__node').length,1);
 fireEvent.focus(view.getByLabelText('Название'));fireEvent.change(view.getByLabelText('Название'),{target:{value:'Первое имя'}});fireEvent.change(view.getByLabelText('Название'),{target:{value:'Новое имя'}});
 assert.equal(fireEvent.keyDown(view.getByLabelText('Название'),{key:'z',code:'KeyZ',metaKey:true}),true,'native text undo must not be prevented');assert.equal((view.getByLabelText('Название') as HTMLInputElement).value,'Новое имя');
 fireEvent.blur(view.getByLabelText('Название'));fireEvent.keyDown(document,{key:'z',code:'KeyZ',metaKey:true});await settle();fireEvent.click(view.container.querySelector('.react-flow__node')!);assert.equal((view.getByLabelText('Название') as HTMLInputElement).value,'Стальная заготовка');
 fireEvent.keyDown(document,{key:'z',code:'KeyZ',ctrlKey:true});await settle();assert.equal(view.container.querySelectorAll('.react-flow__node').length,0);assert.equal((view.getByRole('button',{name:'Отменить'}) as HTMLButtonElement).disabled,true);
 fireEvent.click(view.getByRole('button',{name:'Пример'}));await settle();fireEvent.click(view.getByTestId('rf__node-blank'));fireEvent.click(view.getByRole('button',{name:'Удалить ноду'}));await settle();assert.equal(view.queryByTestId('rf__node-blank'),null);fireEvent.keyDown(document,{key:'я',code:'KeyZ',ctrlKey:true});await settle();assert.ok(view.getByTestId('rf__node-blank'));assert.equal(view.container.querySelectorAll('.react-flow__edge').length,10);fireEvent.click(view.getByRole('button',{name:'Сохранить'}));const stored=JSON.parse(localStorage.getItem('factory-level-v4')!);assert.equal(stored.placements.some((p:{nodeId:string})=>p.nodeId==='blank'),true);assert.equal('past' in stored,false);
});

test('editor undo: a complete drag and resize each undo once, restoring both line endpoints and dimensions',async()=>{
 const view=render(createElement(App));await settle();const node=view.getByTestId('rf__node-intro'),heading=node.querySelector('.node-heading')!;const source=view.getByTestId('rf__edge-intro-out-task-in').querySelector('.react-flow__edge-path')!,target=view.getByTestId('rf__edge-start-out-intro-in').querySelector('.react-flow__edge-path')!;
 const position=nodePosition(node),sourcePath=source.getAttribute('d'),targetPath=target.getAttribute('d');
 fireEvent.mouseDown(heading,{clientX:30,clientY:30,button:0,buttons:1,view:dom.window});for(const [x,y] of [[50,40],[90,70],[150,110]]){fireEvent.mouseMove(dom.window as unknown as Window,{clientX:x,clientY:y,buttons:1,view:dom.window});await settle();}fireEvent.mouseUp(dom.window as unknown as Window,{clientX:150,clientY:110,button:0,view:dom.window});await settle();assert.notDeepEqual(nodePosition(node),position);
 fireEvent.keyDown(document,{key:'z',code:'KeyZ',metaKey:true});await settle();assert.deepEqual(nodePosition(node),position);assert.equal(source.getAttribute('d'),sourcePath);assert.equal(target.getAttribute('d'),targetPath);assert.equal((view.getByRole('button',{name:'Отменить'}) as HTMLButtonElement).disabled,true);
 fireEvent.click(node);await settle();const resize=node.querySelector('.react-flow__resize-control.handle.bottom.right')!;const width=node.style.width;fireEvent.mouseDown(resize,{clientX:520,clientY:200,button:0,buttons:1,view:dom.window});fireEvent.mouseMove(dom.window as unknown as Window,{clientX:610,clientY:250,buttons:1,view:dom.window});await settle();fireEvent.mouseMove(dom.window as unknown as Window,{clientX:700,clientY:290,buttons:1,view:dom.window});await settle();fireEvent.mouseUp(dom.window as unknown as Window,{clientX:700,clientY:290,button:0,view:dom.window});await settle();assert.notEqual(node.style.width,width);
 fireEvent.keyDown(document,{key:'z',code:'KeyZ',ctrlKey:true});await settle();assert.equal(node.style.width,width);assert.equal(source.getAttribute('d'),sourcePath);assert.equal(target.getAttribute('d'),targetPath);assert.equal((view.getByRole('button',{name:'Отменить'}) as HTMLButtonElement).disabled,true);
});

test('editor undo: keyboard Delete restores edges and node atomically; a new project clears history',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByTestId('rf__node-intro'));fireEvent.keyDown(document,{key:'Delete',code:'Delete'});fireEvent.keyUp(document,{key:'Delete',code:'Delete'});await settle();assert.equal(view.queryByTestId('rf__node-intro'),null);assert.equal(view.container.querySelectorAll('.react-flow__edge').length,8);
 fireEvent.keyDown(document,{key:'z',code:'KeyZ',ctrlKey:true});await settle();assert.ok(view.getByTestId('rf__node-intro'));assert.equal(view.container.querySelectorAll('.react-flow__edge').length,10);assert.equal((view.getByRole('button',{name:'Отменить'}) as HTMLButtonElement).disabled,true);
 fireEvent.click(view.getByRole('button',{name:/Заготовка.*\+/}));await settle();assert.equal((view.getByRole('button',{name:'Отменить'}) as HTMLButtonElement).disabled,false);fireEvent.click(view.getByRole('button',{name:'Новый уровень'}));await settle();fireEvent.keyDown(document,{key:'z',code:'KeyZ',metaKey:true});await settle();assert.equal(view.container.querySelectorAll('.react-flow__node').length,0);assert.equal((view.getByRole('button',{name:'Отменить'}) as HTMLButtonElement).disabled,true);
});

test('editor undo: a group move restores all members and crossing connections in one step',async()=>{
 const {groupNodes}=await import('../src/groups'),{exampleLevel}=await import('../src/level');const level=groupNodes(exampleLevel(),['start','intro'],'undo-group');localStorage.setItem('factory-level-v4',JSON.stringify(level));const view=render(createElement(App));await settle();
 const frame=view.getByTestId('rf__node-undo-group'),start=view.getByTestId('rf__node-start'),intro=view.getByTestId('rf__node-intro'),edge=view.getByTestId('rf__edge-intro-out-task-in').querySelector('.react-flow__edge-path')!;const initialStart=nodePosition(start),initialIntro=nodePosition(intro),initialEdge=edge.getAttribute('d');
 const heading=frame.querySelector('.group-heading')!;fireEvent.mouseDown(heading,{clientX:20,clientY:20,button:0,buttons:1,view:dom.window});fireEvent.mouseMove(dom.window as unknown as Window,{clientX:30,clientY:25,buttons:1,view:dom.window});fireEvent.mouseMove(dom.window as unknown as Window,{clientX:120,clientY:90,buttons:1,view:dom.window});await settle();fireEvent.mouseUp(dom.window as unknown as Window,{clientX:120,clientY:90,button:0,view:dom.window});await settle();assert.notDeepEqual(nodePosition(start),initialStart);
 const viewport=view.container.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform;fireEvent.keyDown(document,{key:'z',code:'KeyZ',metaKey:true});await settle();assert.deepEqual(nodePosition(start),initialStart);assert.deepEqual(nodePosition(intro),initialIntro);assert.equal(edge.getAttribute('d'),initialEdge);assert.equal(view.container.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform,viewport);assert.equal((view.getByRole('button',{name:'Отменить'}) as HTMLButtonElement).disabled,true);
});

test('editor undo: clicking an action while a field remains focused records a separate edit',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'Новый уровень'}));fireEvent.click(view.getByRole('button',{name:/Заготовка.*\+/}));await settle();const field=view.getByLabelText('Название');fireEvent.focus(field);fireEvent.change(field,{target:{value:'Моя заготовка'}});fireEvent.click(view.getByRole('button',{name:/Начало уровня.*\+/}));await settle();assert.equal(view.container.querySelectorAll('.react-flow__node').length,2);
 fireEvent.keyDown(document,{key:'z',code:'KeyZ',metaKey:true});await settle();assert.equal(view.container.querySelectorAll('.react-flow__node').length,1);fireEvent.click(view.container.querySelector('.react-flow__node')!);assert.equal((view.getByLabelText('Название') as HTMLInputElement).value,'Моя заготовка');fireEvent.keyDown(document,{key:'z',code:'KeyZ',ctrlKey:true});await settle();fireEvent.click(view.container.querySelector('.react-flow__node')!);assert.equal((view.getByLabelText('Название') as HTMLInputElement).value,'Стальная заготовка');
});

test('editor undo: a created connection is removed by one shortcut and its pending ports clear',async()=>{
 const {welcomeLevel}=await import('../src/level');const level=welcomeLevel();level.edges=[];localStorage.setItem('factory-level-v4',JSON.stringify(level));const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'Выход Далее: Начало уровня'}));fireEvent.click(view.getByRole('button',{name:'Вход Выполнение: Вступление'}));await settle();assert.equal(view.container.querySelectorAll('.react-flow__edge').length,1);fireEvent.click(view.getByRole('button',{name:'Выход Далее: Вступление'}));fireEvent.keyDown(document,{key:'z',code:'KeyZ',ctrlKey:true});await settle();assert.equal(view.container.querySelectorAll('.react-flow__edge').length,0);assert.equal(view.queryByRole('button',{name:'Отменить соединение'}),null);assert.equal((view.getByRole('button',{name:'Отменить'}) as HTMLButtonElement).disabled,true);
});
