import type { MissionSession } from './session';

/** Короткие объяснения «почему так» для тренировки. Тексты строятся из данных уровня, а не зашиты. */
export function whyText(session: MissionSession): string {
  const core = session.core;
  if (core.isWelcome) return '';
  const s = session.state, r = core.resources, op = core.currentOperation;
  const removal = r.blank.shape === 'cylinder' && op.kind === 'turning' ? (r.blank.diameter - op.diameter) / 2 : 0;
  if (s.completed) return 'Деталь на складе соответствует заказу, значит миссия выполнена.';
  if (s.intro) return 'Сначала прочитайте заказ и сверьте размеры с чертежом.';
  if (s.target === 'machine') return 'Обрабатывать деталь можно только на станке: он вращает её, а резец снимает металл. Склад и стол для этого не подходят.';
  if (s.target === 'warehouse') return 'Склад принимает только готовую деталь, прошедшую все операции. Поэтому цель одна: склад.';
  switch (s.stage) {
    case 'table':
      return s.selected === r.blank.id
        ? 'Станок обрабатывает только то, что в нём закреплено. Поэтому заготовку сначала нужно установить в станок.'
        : 'Любая работа начинается с заготовки: это исходный кусок металла, из которого получится деталь.';
    case 'loaded':
      if (op.kind === 'milling' || r.blank.shape !== 'cylinder') return 'Фреза снимает верхний слой бруска. Сверьте глубину снятия с заказом.';
      return `По чертежу участок должен стать Ø${op.diameter} мм на длине ${op.length} мм. Резец снимет по ${trim(removal)} мм с каждой стороны: (${r.blank.diameter} − ${op.diameter}) ÷ 2. Параметры уже заданы в станке. Сверьте их с чертежом и запускайте.`;
    case 'processing':
      return 'Деталь вращается, резец движется вдоль участка и снимает слой металла. Пока идёт обработка, станок занят.';
    case 'finished':
      return 'Перед сдачей проверьте деталь: диаметры и длины участков должны совпадать с чертежом. Это и есть критерий успеха.';
    default:
      return '';
  }
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Нейтральное состояние для олимпиады: без указания следующего шага. */
export function strictStatus(session: MissionSession): string {
  const s = session.state;
  if (s.intro) return 'Прочитайте задание.';
  if (s.target) return 'Выберите объект на сцене.';
  if (s.stage === 'processing') return 'Идёт обработка.';
  return 'Работайте по чертежу. Подсказок в олимпиаде нет.';
}

/** Индекс текущего этапа для индикатора прогресса. */
export const STAGES = ['Заказ', 'Установка', 'Обработка', 'Проверка', 'Склад'] as const;
export function stageIndex(session: MissionSession): number {
  const s = session.state;
  if (s.completed || s.stage === 'stored') return 5;
  if (s.intro) return 0;
  if (s.stage === 'table') return 1;
  if (s.stage === 'loaded' || s.stage === 'processing') return 2;
  return 3;
}
