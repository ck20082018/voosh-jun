import {operationLabel} from '../turningTools';
import {TURNING_LESSONS,trainingLevel,type TurningLesson} from '../turningTraining';
import { exampleLevel, operations, placeObject, type Level } from '../level';
import { EXERCISE_MISSIONS } from './exerciseMissions';
import type { Exercise } from './exercises';
import type { IconName } from '../ui/Icon';

/** Направления платформы. Производственные уровни и инженерные упражнения имеют отдельные чистые модели. */
export type DirectionId = 'machining' | 'engineering' | 'processes' | 'metrology' | 'automation' | 'logistics';
export interface Direction { id: DirectionId; title: string; blurb: string; icon: IconName }

export const DIRECTIONS: Direction[] = [
  { id: 'machining', title: 'Механическая обработка', blurb: 'Точение валиков: заготовка, станок, склад.', icon: 'lathe' },
  { id: 'engineering', title: 'Конструирование и инженерия', blurb: 'Зубчатые пары: зацепление и передаточное отношение.', icon: 'cube' },
  { id: 'processes', title: 'Производственные процессы', blurb: 'Маршрут детали через цех.', icon: 'gears' },
  { id: 'metrology', title: 'Метрология и измерения', blurb: 'Штангенциркуль, нониус и допуски.', icon: 'ruler' },
  { id: 'automation', title: 'Автоматизация', blurb: 'Программы станка, датчики и безопасная остановка.', icon: 'cpu' },
  { id: 'logistics', title: 'Логистика и оптимизация', blurb: 'Очередь партий и расписание двух станков.', icon: 'route' },
];

export interface Zone { id: string; title: string; requiresMissions: string[]; minLevel: number }
export const ZONES: Zone[] = [
  {id:'turning-school',title:'Школа точения',requiresMissions:[],minLevel:1},
  { id: 'training-lab', title: 'Инженерная лаборатория', requiresMissions: [], minLevel: 1 },
  { id: 'shop', title: 'Учебный цех', requiresMissions: [], minLevel: 1 },
  { id: 'lathe-area', title: 'Токарный участок', requiresMissions: ['two-sections'], minLevel: 3 },
];

export interface OperationSpec { diameter: number; length: number; seconds: number }
interface MissionBase {
  id: string;
  direction: DirectionId;
  zone: string;
  title: string;
  /** Короткий производственный заказ для карточек и вступления. */
  order: string;
  /** Чему учит миссия. */
  teaches: string;
  difficulty: 1 | 2 | 3;
  minutes: number;
  requires: string[];
  training?:TurningLesson;
}
export type MissionSpec = MissionBase & ({ build: () => Level; exercise?: never } | { exercise: Exercise; build?: never });
export interface PlannedSpec { id: string; direction: DirectionId; title: string; note: string }

interface TurningRecipe {
  id: string;
  name: string;
  introTitle: string;
  introText: string;
  taskTitle: string;
  taskText: string;
  blank: { name: string; material: string; diameter: number; length: number };
  operations: OperationSpec[];
  grid?: { width: number; height: number };
  placements?: { blank: [number, number]; lathe: [number, number]; warehouse: [number, number] };
}

/** Собирает корректный производственный уровень из одной заготовки и цепочки токарных операций. */
export function turningLevel(recipe: TurningRecipe): Level {
  const level = exampleLevel();
  level.id = recipe.id;
  level.name = recipe.name;
  const byId = (id: string) => level.nodes.find(node => node.id === id)!;
  byId('intro').params = { title: recipe.introTitle, text: recipe.introText };
  byId('task').params = { title: recipe.taskTitle, instruction: recipe.taskText };
  byId('blank').params = { ...byId('blank').params, ...recipe.blank };
  byId('process').params.operations = recipe.operations.map((op, index) => ({id: `op-${index + 1}`, kind: 'turning', ...op}));
  // Requirements are authored independently of the player's eventual runtime result.
  byId('part').params = {...byId('part').params, ...recipe.blank,
    sections: recipe.operations.map(({diameter,length}) => ({diameter,length}))};
  if (recipe.grid || recipe.placements) {
    const grid = recipe.grid ?? level.grid;
    level.grid = {...grid, points: Array.from({length:grid.width*grid.height}, (_, i) => ({id:`point-${i}`,x:i%grid.width,y:Math.floor(i/grid.width)}))};
    level.placements = [];
    const positions = recipe.placements ?? {blank:[0,1],lathe:[2,2],warehouse:[grid.width-1,grid.height-1]};
    for (const id of ['blank','lathe','warehouse'] as const) {
      const [x,y] = positions[id];
      const next = placeObject(level,id,x,y);
      if (!next) throw new Error(`Не удалось разместить ${id}`);
      level.placements = next.placements;
    }
  }
  return level;
}

const steel = (diameter: number, length: number) => ({ name: 'Стальная заготовка', material: 'Сталь', diameter, length });

export const MISSIONS: MissionSpec[] = [

  {
    id: 'precision', direction: 'machining', zone: 'shop', difficulty: 1, minutes: 3, requires: [],
    title: 'Точность решает',
    order: 'Заказ №27: выточить валик. На участке длиной 30 мм диаметр должен стать 12 мм.',
    teaches: 'Порядок работы на станке и чтение чертежа: диаметр, длина участка.',
    build: () => turningLevel({
      id: 'precision', name: 'Точность решает',
      introTitle: 'Заказ №27: ступенчатый валик',
      introText: 'На завод пришёл заказ на деталь из стали. Закрепите заготовку в станке, обработайте её по чертежу и отправьте готовый валик на склад.',
      taskTitle: 'Изготовьте валик по чертежу',
      taskText: 'Обработайте заготовку до Ø12 мм на участке 30 мм и сдайте деталь на склад.',
      blank: steel(20, 60), operations: [{ diameter: 12, length: 30, seconds: 3 }],
    }),
  },
  {
    id: 'thin-neck', direction: 'machining', zone: 'shop', difficulty: 1, minutes: 3, requires: ['precision'],
    title: 'Тонкая шейка',
    order: 'Заказ №31: латунная заготовка Ø25 × 80 мм. Нужна шейка Ø16 на длине 40 мм.',
    teaches: 'Размеры меняются от заказа к заказу: сначала сверьте чертёж, потом работайте.',
    build: () => turningLevel({
      id: 'thin-neck', name: 'Тонкая шейка',
      introTitle: 'Заказ №31: валик с шейкой',
      introText: 'Новая заготовка и новый чертёж. Проверьте размеры в техническом задании, прежде чем запускать станок.',
      taskTitle: 'Выточите шейку',
      taskText: 'Обработайте латунную заготовку до Ø16 мм на участке 40 мм.',
      blank: { name: 'Латунная заготовка', material: 'Латунь', diameter: 25, length: 80 }, operations: [{ diameter: 16, length: 40, seconds: 4 }],
      grid: { width: 5, height: 5 }, placements: { blank: [0, 1], lathe: [2, 2], warehouse: [4, 3] },
    }),
  },
  {
    id: 'two-sections', direction: 'machining', zone: 'shop', difficulty: 2, minutes: 4, requires: ['thin-neck'],
    title: 'Два участка',
    order: 'Заказ №34: два участка на одной заготовке. Сначала Ø12 × 30 мм, затем Ø8 × 15 мм.',
    teaches: 'Несколько операций подряд на одной детали и их порядок.',
    build: () => turningLevel({
      id: 'two-sections', name: 'Два участка',
      introTitle: 'Заказ №34: валик с двумя ступенями',
      introText: 'Деталь обрабатывается в две операции. Станок выполняет их по очереди, а на склад уходит только результат обеих.',
      taskTitle: 'Выточите две ступени',
      taskText: 'Выполните обе операции по чертежу и отправьте готовую деталь на склад.',
      blank: steel(20, 60), operations: [{ diameter: 12, length: 30, seconds: 3 }, { diameter: 8, length: 15, seconds: 2 }],
    }),
  },
  {
    id: 'stepped-shaft', direction: 'machining', zone: 'lathe-area', difficulty: 2, minutes: 5, requires: ['two-sections'],
    title: 'Ступенчатый вал',
    order: 'Заказ №40: вал из заготовки Ø30 × 100 мм. Ступени Ø24 × 40 мм и Ø16 × 30 мм.',
    teaches: 'Длинная заготовка и суммарная длина ступеней.',
    build: () => turningLevel({
      id: 'stepped-shaft', name: 'Ступенчатый вал',
      introTitle: 'Заказ №40: ступенчатый вал',
      introText: 'Длинный вал с двумя ступенями. Часть заготовки у патрона остаётся необработанной, так задумано чертежом.',
      taskTitle: 'Изготовьте вал',
      taskText: 'Выточите обе ступени и сдайте вал на склад.',
      blank: steel(30, 100), operations: [{ diameter: 24, length: 40, seconds: 5 }, { diameter: 16, length: 30, seconds: 4 }],
      grid: { width: 6, height: 5 }, placements: { blank: [0, 2], lathe: [3, 2], warehouse: [5, 2] },
    }),
  },
  {
    id: 'three-steps', direction: 'machining', zone: 'lathe-area', difficulty: 3, minutes: 6, requires: ['stepped-shaft'],
    title: 'Три ступени',
    order: 'Заказ №46: ступени Ø26, Ø20 и Ø14 мм по 30 мм каждая на заготовке Ø32 × 120 мм.',
    teaches: 'Три операции подряд: следите за номером операции.',
    build: () => turningLevel({
      id: 'three-steps', name: 'Три ступени',
      introTitle: 'Заказ №46: вал с тремя ступенями',
      introText: 'Три операции подряд. Каждая обрабатывает свой участок вдоль заготовки.',
      taskTitle: 'Выточите три ступени',
      taskText: 'Выполните три операции по порядку и отправьте деталь на склад.',
      blank: steel(32, 120), operations: [{ diameter: 26, length: 30, seconds: 4 }, { diameter: 20, length: 30, seconds: 4 }, { diameter: 14, length: 30, seconds: 3 }],
      grid: { width: 6, height: 5 }, placements: { blank: [0, 3], lathe: [3, 2], warehouse: [5, 1] },
    }),
  },
  ...TURNING_LESSONS.map((lesson,i):MissionSpec=>({id:lesson.id,title:lesson.title,direction:'machining',zone:'turning-school',difficulty:i<2?1:i<4?2:3,minutes:5,requires:i?[TURNING_LESSONS[i-1].id]:[],order:lesson.targets.map(operationLabel).join('; ')+`. Сталь Ø${lesson.stockDiameter??20} × 60 мм; патрон Z0–10. Плечо не считается обработанным участком.`,teaches:lesson.explanation,training:lesson,build:()=>trainingLevel(lesson)})),
  ...EXERCISE_MISSIONS,
];

/** Будущие миссии, ещё не доступные для запуска. */
export const PLANNED: PlannedSpec[] = [];

export const missionById = (id: string) => MISSIONS.find(mission => mission.id === id);
export const zoneById = (id: string) => ZONES.find(zone => zone.id === id)!;
export const operationsOf = (level: Level): OperationSpec[] => level.nodes
  .filter(node => node.type === 'process').flatMap(node => operations(node))
  .filter((op): op is Extract<import('../level').OperationSpec,{kind:'turning'}> => op.kind === 'turning')
  .map(({diameter,length,seconds}) => ({diameter,length,seconds}));
