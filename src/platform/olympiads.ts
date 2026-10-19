import type { Level } from '../level';
import { turningLevel } from './missions';

/**
 * ДЕМОНСТРАЦИОННЫЕ данные олимпиад: регламент, этапы и сроки условные.
 * Настоящий приём заявок, расписание и общий рейтинг требуют сервера и в прототипе не реализованы.
 */
export interface OlympiadStage {
  id: string;
  title: string;
  blurb: string;
  timeLimitSec: number;
  build: () => Level;
}
export interface Olympiad {
  id: string;
  title: string;
  grades: string;
  status: 'open' | 'planned';
  summary: string;
  rules: string[];
  stages: OlympiadStage[];
}

export const OLYMPIADS: Olympiad[] = [
  {
    id: 'young-technologist',
    title: 'Юный технолог',
    grades: '5–7 классы',
    status: 'open',
    summary: 'Два этапа токарной обработки. Одна попытка на этап, оценка по формуле без подсказок.',
    rules: [
      'На каждый этап даётся одна попытка. Выход из этапа засчитывает попытку с текущим результатом.',
      'Подсказок, обучающей подсветки, паузы и перезапуска нет.',
      'Каждое неверное действие снимает 60 баллов точности.',
      'Когда время этапа заканчивается, работа сдаётся в том виде, в каком она есть.',
      'Оценка считается по формуле из журнала попыток. Уровень игрока и XP на неё не влияют.',
      'Второй этап открывается после завершения первого: сдачи детали или окончания времени.',
    ],
    stages: [
      {
        id: 'qualifying', title: 'Квалификация', blurb: 'Одна операция: заготовка Ø22 × 70 мм, участок Ø14 × 35 мм.', timeLimitSec: 180,
        build: () => turningLevel({
          id: 'olymp-qualifying', name: 'Квалификация',
          introTitle: 'Квалификационный заказ', introText: 'Изготовьте деталь по чертежу. Время ограничено, подсказок нет.',
          taskTitle: 'Изготовьте деталь', taskText: 'Обработайте заготовку по чертежу и сдайте деталь на склад.',
          blank: { name: 'Стальная заготовка', material: 'Сталь', diameter: 22, length: 70 }, operations: [{ diameter: 14, length: 35, seconds: 4 }],
          grid: { width: 5, height: 5 }, placements: { blank: [0, 3], lathe: [2, 2], warehouse: [4, 1] },
        }),
      },
      {
        id: 'final', title: 'Финал', blurb: 'Две операции: заготовка Ø28 × 90 мм, участки Ø20 × 30 и Ø12 × 25 мм.', timeLimitSec: 240,
        build: () => turningLevel({
          id: 'olymp-final', name: 'Финал',
          introTitle: 'Финальный заказ', introText: 'Две операции подряд на одной заготовке. Следите за порядком.',
          taskTitle: 'Изготовьте деталь', taskText: 'Выполните обе операции и сдайте деталь на склад.',
          blank: { name: 'Стальная заготовка', material: 'Сталь', diameter: 28, length: 90 }, operations: [{ diameter: 20, length: 30, seconds: 4 }, { diameter: 12, length: 25, seconds: 3 }],
          grid: { width: 6, height: 5 }, placements: { blank: [0, 1], lathe: [3, 2], warehouse: [5, 3] },
        }),
      },
    ],
  },
  {
    id: 'engineering-challenge',
    title: 'Инженерный вызов',
    grades: '8–11 классы',
    status: 'planned',
    summary: 'Измерения, сборка и поиск неисправностей. Задания появятся вместе с новыми механиками.',
    rules: ['Запись о запланированной олимпиаде. Заданий и регламента пока нет.'],
    stages: [],
  },
];

export const olympiadById = (id: string) => OLYMPIADS.find(item => item.id === id);
export const stageKey = (olympiadId: string, stageId: string) => `${olympiadId}/${stageId}`;
