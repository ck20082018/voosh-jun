import type { MissionSpec } from './missions';
import type { Exercise } from './exercises';

type ExerciseMission = MissionSpec & { exercise: Exercise };
const mission = (id: string, direction: MissionSpec['direction'], title: string, order: string, teaches: string, exercise: Exercise, requires: string[] = [], difficulty: 1 | 2 | 3 = 1): ExerciseMission =>
  ({ id, direction, zone: 'training-lab', title, order, teaches, exercise, requires, difficulty, minutes: difficulty + 2 });
const assembly = (distance: number, inputRpm: number, outputRpm: number, module = 1): Exercise =>
  ({ kind: 'assembly', module, distance, inputRpm, outputRpm, gears: [10, 15, 20, 25, 30, 40, 45, 50, 60] });
const route = (variant: number): Exercise => {
  const steps = [
    { id: 'cut', label: 'Отрезать заготовку', after: [], station: 'Пильный пост' },
    { id: 'turn', label: 'Выточить посадку', after: ['cut'], station: 'Токарный пост' },
    ...(variant >= 2 ? [{ id: 'mill', label: 'Фрезеровать плоскость', after: ['turn'], station: 'Фрезерный пост' }] : []),
    { id: 'inspect', label: 'Проверить размеры', after: [variant >= 2 ? 'mill' : 'turn'], station: 'Контрольный пост' },
    ...(variant >= 3 ? [{ id: 'wash', label: 'Очистить деталь', after: ['inspect'], station: 'Моечный пост' }] : []),
    { id: 'pack', label: 'Упаковать деталь', after: [variant >= 3 ? 'wash' : 'inspect'], station: 'Упаковочный пост' },
  ];
  return { kind: 'route', steps, stations: ['Пильный пост', 'Токарный пост', 'Фрезерный пост', 'Контрольный пост', 'Моечный пост', 'Упаковочный пост'] };
};
const automation = (level: number): Exercise => ({ kind: 'automation', scenarios: [
  { part: true, guard: true }, ...(level >= 2 ? [{ part: false, guard: true }] : []),
  ...(level >= 3 ? [{ part: true, guard: false }, { part: false, guard: false }] : []),
] });
export const EXERCISE_MISSIONS: ExerciseMission[] = [
  mission('plan-tool', 'machining', 'Выбор подходящего инструмента', 'Подберите станок и инструмент для продольного точения стального цилиндра.', 'Различайте проходной резец, подрезной резец и торцевую фрезу.',
    { kind: 'tool', material: 'Сталь', shape: 'cylinder', operation: 'Продольное точение', machine: 'Токарный станок', tool: 'Проходной резец', machines: ['Фрезерный станок', 'Токарный станок'], tools: ['Подрезной резец', 'Торцевая фреза', 'Проходной резец'] }, ['precision']),
  mission('plan-assembly', 'engineering', 'Редуктор по чертежу', 'Соберите зубчатую пару: расстояние между осями 30 мм, модуль 1 мм. Снизьте скорость с 600 до 300 об/мин.', 'Подберите зубчатые колёса по межосевому расстоянию и передаточному отношению.', assembly(30, 600, 300)),
  mission('gear-increase', 'engineering', 'Ускоряющая передача', 'Валы расположены на расстоянии 30 мм, модуль 1 мм. Получите 900 об/мин при входных 300.', 'Ведущее колесо большего размера повышает скорость ведомого.', assembly(30, 300, 900), ['plan-assembly'], 2),
  mission('gear-module', 'engineering', 'Согласовать модуль', 'Межосевое расстояние 60 мм, модуль 2 мм. Требуемая скорость выхода 240 об/мин при входных 1200.', 'Учитывайте модуль при расчёте размеров пары.', assembly(60, 1200, 240, 2), ['gear-increase'], 3),
  mission('plan-route', 'processes', 'Маршрут втулки', 'Составьте путь втулки от распила заготовки до упаковки и назначьте подходящие посты.', 'У каждой операции есть предшественники и оборудование.', route(1)),
  mission('route-plane', 'processes', 'Маршрут с плоскостью', 'После точения нужно фрезеровать плоскость. Размеры проверяют после всей обработки.', 'Согласуйте две разные обработки в одном маршруте.', route(2), ['plan-route'], 2),
  mission('route-clean', 'processes', 'Чистая поставка', 'Перед упаковкой деталь должна пройти контроль размеров и очистку.', 'Добавьте завершающие операции, сохранив зависимости.', route(3), ['route-plane'], 3),
  mission('plan-caliper', 'metrology', 'Читаем нониус', 'Измерьте валик штангенциркулем с ценой деления нониуса 0,1 мм и определите годность.', 'Сложите целые миллиметры и долю по совпавшему штриху.', { kind: 'measurement', whole: 12, tick: 7, min: 12.6, max: 12.8 }),
  mission('caliper-reject', 'metrology', 'За пределами допуска', 'Проверьте посадку: допустимый размер 20,0–20,2 мм. Введите показание и решение контролёра.', 'Точно прочитанный размер может означать брак.', { kind: 'measurement', whole: 20, tick: 4, min: 20, max: 20.2 }, ['plan-caliper'], 2),
  mission('caliper-boundary', 'metrology', 'Граница допуска', 'Проверьте деталь по диапазону 8,0–8,5 мм. Граничные значения допустимы.', 'Не бракуйте размер на границе допуска.', { kind: 'measurement', whole: 8, tick: 5, min: 8, max: 8.5 }, ['caliper-reject'], 3),
  mission('plan-program', 'automation', 'Первый автомат', 'Составьте программу: закрепить деталь, обработать, освободить и выдать. Датчики сообщают: деталь есть, кожух закрыт.', 'Порядок команд определяет безопасность и завершение цикла.', automation(1)),
  mission('plan-fault', 'automation', 'Нет заготовки', 'Автомат должен обработать загруженную деталь и безопасно остановиться, если датчик не видит заготовку.', 'Добавьте проверку датчика до механических действий.', automation(2), ['plan-program'], 2),
  mission('automation-guard', 'automation', 'Защитный кожух', 'Проверьте программу при всех сочетаниях датчиков. Пустой станок и открытый кожух требуют остановки до закрепления.', 'Условные остановки защищают оборудование при отказе условий запуска.', automation(3), ['plan-fault'], 3),
  mission('plan-optimize', 'logistics', 'Две партии', 'Партии идут через станки A и B в одинаковом порядке. Завершите заказ за 9 минут.', 'Перекрывайте работу станков над разными партиями.', { kind: 'schedule', jobs: [{ id: 'Партия 1', first: 4, second: 2 }, { id: 'Партия 2', first: 2, second: 5 }], limit: 9 }),
  mission('schedule-three', 'logistics', 'Очередь без простоя', 'Распределите три партии между двумя последовательными станками. Срок — 14 минут.', 'Начинайте с партий, которые быстрее освобождают первый станок.', { kind: 'schedule', jobs: [{ id: 'Партия 1', first: 5, second: 2 }, { id: 'Партия 2', first: 2, second: 6 }, { id: 'Партия 3', first: 3, second: 4 }], limit: 14 }, ['plan-optimize'], 2),
  mission('schedule-four', 'logistics', 'Сменный заказ', 'Четыре партии должны пройти оба станка за 20 минут. Найдите очередь с минимальными ожиданиями.', 'Сравнивайте время окончания всей смены, а не отдельной операции.', { kind: 'schedule', jobs: [{ id: 'Партия 1', first: 6, second: 2 }, { id: 'Партия 2', first: 2, second: 7 }, { id: 'Партия 3', first: 4, second: 3 }, { id: 'Партия 4', first: 3, second: 5 }], limit: 20 }, ['schedule-three'], 3),
];
