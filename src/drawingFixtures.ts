import type {TurningGeometry,ProfileSpan} from './turningGeometry';
import type {DrawingDisplay} from './drawingGeometry';
const span=(z0:number,z1:number,outer0:number,inner0=0,outer1=outer0,inner1=inner0):ProfileSpan=>({z0,z1,outer0,outer1,inner0,inner1});
export interface DrawingFixture {id:string;title:string;geometry:TurningGeometry;display:DrawingDisplay}
/** Visual fixtures, NOT executable operations or playable missions. */
export const DRAWING_FIXTURES:readonly DrawingFixture[]=[
 {id:'stepped',title:'Ступенчатая наружная деталь',geometry:{length:60,spans:[span(0,20,10),span(20,40,8),span(40,60,5)]},display:{views:['main','end','section','volume']}},
 {id:'blind',title:'Глухое отверстие',geometry:{length:60,spans:[span(0,20,10),span(20,60,10,4)]},display:{views:['main','end','section','volume']}},
 {id:'through',title:'Сквозное отверстие',geometry:{length:60,spans:[span(0,60,10,3)]},display:{views:['main','end','section','volume']}},
 {id:'inner-step',title:'Внутренняя ступень',geometry:{length:60,spans:[span(0,25,10,3),span(25,60,10,5)]},display:{views:['main','end','section','volume']}},
 {id:'inner-groove',title:'Внутренняя канавка · фикстура',geometry:{length:60,spans:[span(0,30,10,4),span(30,35,10,6),span(35,60,10,4)]},display:{views:['main','end','section','detail','volume'],detail:{z0:28,z1:38,label:'Внутренняя канавка, увеличенный участок'}}},
 {id:'groove-chamfer',title:'Наружная канавка и фаска · фикстура',geometry:{length:60,spans:[span(0,30,10),span(30,34,8),span(34,58,10),span(58,60,10,0,8)]},display:{views:['main','end','section','detail','volume'],detail:{z0:56,z1:60,label:'Фаска, линейное изменение радиуса'}}},
 {id:'thread',title:'Место под обозначение резьбы · фикстура',geometry:{length:60,spans:[span(0,60,10,3)]},display:{views:['main','end','section','detail','volume'],detail:{z0:40,z1:60,label:'Условная схема резьбы',thread:{surface:'outer',pitch:1.5}}}},
];
