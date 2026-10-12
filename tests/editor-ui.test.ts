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
  await waitFor(()=>assert.equal(view.container.querySelectorAll('.react-flow__node').length,10));
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
  const ids=['start','intro','blank','tool','turning','lathe','warehouse','task','wait','finish'];
  for(const id of ids){
    const node=view.getByTestId(`rf__node-${id}`);
    const edges=[...view.container.querySelectorAll('.react-flow__edge')].filter(edge=>{
      const edgeId=edge.getAttribute('data-id')??'';return edgeId.startsWith(`${id}-`)||edgeId.endsWith(`-${id}-in`)||edgeId.includes(`-${id}-`);
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
  const stored=JSON.parse(localStorage.getItem('factory-level-v1')!);
  assert.equal(stored.nodes.length,1);assert.equal(stored.nodes[0].params.name,'Моя заготовка');assert.equal('measured' in stored.nodes[0],false);
  cleanup();view=render(createElement(App));await settle();
  assert.equal(view.container.querySelectorAll('.react-flow__node').length,1);
  assert.ok(view.container.textContent?.includes('Моя заготовка'));
});

test('editor UI: dragging from an output handle to a free input creates and saves an execution edge',async()=>{
  const {exampleLevel}=await import('../src/level');
  const project=exampleLevel();project.edges=project.edges.filter(edge=>edge.id!=='start-out-intro-in');
  localStorage.setItem('factory-level-v1',JSON.stringify(project));
  const view=render(createElement(App));await settle();
  assert.equal(view.container.querySelectorAll('.react-flow__edge').length,10);
  const source=view.getByTestId('rf__node-start').querySelector<HTMLElement>('.source[data-handleid="out"]')!;
  const target=view.getByTestId('rf__node-intro').querySelector<HTMLElement>('.target[data-handleid="in"]')!;
  Object.defineProperty(document,'elementFromPoint',{value:()=>target,configurable:true});
  const sourceRect=source.getBoundingClientRect(),targetRect=target.getBoundingClientRect();
  fireEvent.mouseDown(source,{clientX:sourceRect.left+4,clientY:sourceRect.top+4,button:0,buttons:1,view:dom.window});
  fireEvent.mouseMove(document,{clientX:targetRect.left+4,clientY:targetRect.top+4,buttons:1,view:dom.window});await settle();
  fireEvent.mouseUp(document,{clientX:targetRect.left+4,clientY:targetRect.top+4,button:0,view:dom.window});await settle();
  assert.equal(view.container.querySelectorAll('.react-flow__edge').length,11);
  fireEvent.click(view.getByRole('button',{name:'Сохранить'}));await settle();
  const stored=JSON.parse(localStorage.getItem('factory-level-v1')!);
  assert.equal(stored.edges.filter((edge:{source:string;target:string})=>edge.source==='start'&&edge.target==='intro').length,1);
  Object.defineProperty(document,'elementFromPoint',{value:()=>null,configurable:true});
});

test('editor UI: welcome example runs without a workshop and can be completed',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'Приветствие'}));await settle();
 assert.equal(view.container.querySelectorAll('.react-flow__node').length,3);fireEvent.click(view.getByRole('button',{name:'▶ Протестировать'}));await settle();assert.ok(view.container.textContent?.includes('Добро пожаловать!'));assert.equal(view.container.querySelector('canvas'),null);fireEvent.click(view.getByRole('button',{name:'Начать →'}));await settle();assert.ok(view.container.textContent?.includes('Знакомство завершено.'));
});
test('editor UI: labels create a connection without hitting a small handle; duplicates are rejected',async()=>{
 const {welcomeLevel}=await import('../src/level');const level=welcomeLevel();level.edges=[];localStorage.setItem('factory-level-v1',JSON.stringify(level));
 const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'Выход Далее: Начало уровня'}));fireEvent.click(view.getByRole('button',{name:'Вход Выполнение: Вступление'}));await settle();assert.equal(view.container.querySelectorAll('.react-flow__edge').length,1);
 fireEvent.click(view.getByRole('button',{name:'Выход Далее: Начало уровня'}));fireEvent.click(view.getByRole('button',{name:'Вход Выполнение: Вступление'}));await settle();assert.equal(view.container.querySelectorAll('.react-flow__edge').length,1);assert.ok(view.container.textContent?.includes('Эта связь уже существует'));
 fireEvent.click(view.getByRole('button',{name:'Сохранить'}));const stored=JSON.parse(localStorage.getItem('factory-level-v1')!);assert.equal(stored.edges.length,1);
});
test('editor UI: connection builder creates a data edge via dropdowns',async()=>{
 const {exampleLevel}=await import('../src/level');const level=exampleLevel();level.edges=level.edges.filter(edge=>edge.target!=='turning');localStorage.setItem('factory-level-v1',JSON.stringify(level));
 const view=render(createElement(App));await settle();fireEvent.click(view.getByRole('button',{name:'+ Добавить связь'}));
 fireEvent.change(view.getByLabelText('Выход новой связи'),{target:{value:JSON.stringify(['blank','blank'])}});fireEvent.click(view.getByRole('button',{name:'Создать связь'}));await settle();
 assert.equal(view.container.querySelectorAll('.react-flow__edge').length,11);fireEvent.click(view.getByRole('button',{name:'Сохранить'}));assert.equal(JSON.parse(localStorage.getItem('factory-level-v1')!).edges.filter((edge:{source:string;target:string})=>edge.source==='blank'&&edge.target==='turning').length,1);
});
test('editor UI: node size can be changed in properties and survives reload',async()=>{
 let view=render(createElement(App));await settle();const outgoing=view.getByTestId('rf__edge-intro-out-task-in').querySelector('.react-flow__edge-path')!;const previousPath=outgoing.getAttribute('d');fireEvent.click(view.getByTestId('rf__node-intro'));
 fireEvent.change(view.getByLabelText('Ширина ноды'),{target:{value:'430'}});fireEvent.change(view.getByLabelText('Высота ноды'),{target:{value:'290'}});await settle();
 assert.equal(view.getByTestId('rf__node-intro').style.width,'430px');assert.notEqual(outgoing.getAttribute('d'),previousPath,'port endpoint must update after resizing');fireEvent.click(view.getByRole('button',{name:'Сохранить'}));assert.deepEqual(JSON.parse(localStorage.getItem('factory-level-v1')!).nodes.find((n:{id:string})=>n.id==='intro').size,{width:430,height:290});
 cleanup();view=render(createElement(App));await settle();assert.equal(view.getByTestId('rf__node-intro').style.width,'430px');
});

test('editor UI: deleting a node cleans up its clickable ports and does not crash the editor',async()=>{
 const view=render(createElement(App));await settle();fireEvent.click(view.getByTestId('rf__node-intro'));fireEvent.click(view.getByRole('button',{name:'Удалить ноду'}));await settle();assert.equal(view.container.querySelectorAll('.react-flow__node').length,9);assert.equal(view.queryByTestId('rf__node-intro'),null);
});
