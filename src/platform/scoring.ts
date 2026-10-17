import type { OperationSpec } from './missions';

/**
 * Детерминированная оценка попытки. Результат зависит только от журнала попытки
 * (ошибки, подсказки, число выполненных операций, активное время) и не зависит от уровня, ранга или XP игрока.
 *
 * Максимум 1000:
 *  — выполнение 500 (пять критериев);
 *  — точность 300 (−60 за каждую ошибку);
 *  — самостоятельность 100 (олимпиада всегда 100; в тренировке 40 при включённом обучении, иначе 100 − 30 за подсказку);
 *  — время 100 (норма = сумма времени операций + 30 с на действия игрока).
 */
export interface AttemptSummary {
  mode: 'training' | 'olympiad';
  completed: boolean;
  installed: boolean;
  stored: boolean;
  opsDone: number;
  opsTotal: number;
  errors: number;
  hints: number;
  coaching: boolean;
  timeSec: number;
  parSec: number;
}

export interface Criterion { id: string; label: string; ok: boolean; points: number; max: number }
export interface ScoreLine { id: string; label: string; points: number; max: number; note: string }
export interface Score { total: number; max: number; lines: ScoreLine[]; criteria: Criterion[]; accuracy: number; stars: 0 | 1 | 2 | 3 }

export const MAX_SCORE = 1000;
export const ERROR_PENALTY = 60;
export const PAR_OVERHEAD_SEC = 30;
export const MAX_GRADE_SCORE = 950;

export const parSeconds = (operations: OperationSpec[]) => operations.reduce((sum, op) => sum + op.seconds, 0) + PAR_OVERHEAD_SEC;

export function computeScore(a: AttemptSummary): Score {
  const share = a.opsTotal > 0 ? a.opsDone / a.opsTotal : 0;
  const criteria: Criterion[] = [
    { id: 'install', label: 'Заготовка закреплена в станке', ok: a.installed, points: a.installed ? 80 : 0, max: 80 },
    { id: 'process', label: a.opsTotal > 1 ? `Выполнены все операции (${a.opsTotal})` : 'Обработка выполнена', ok: a.opsDone >= a.opsTotal && a.opsTotal > 0, points: Math.round(120 * share), max: 120 },
    { id: 'diameter', label: 'Диаметры участков соответствуют чертежу', ok: a.opsDone >= a.opsTotal && a.opsTotal > 0, points: Math.round(100 * share), max: 100 },
    { id: 'length', label: 'Длины участков соответствуют чертежу', ok: a.opsDone >= a.opsTotal && a.opsTotal > 0, points: Math.round(100 * share), max: 100 },
    { id: 'store', label: 'Готовая деталь сдана на склад', ok: a.stored, points: a.stored ? 100 : 0, max: 100 },
  ];
  const execution = criteria.reduce((sum, c) => sum + c.points, 0);
  const accuracyPts = Math.max(0, 300 - ERROR_PENALTY * a.errors);
  let independencePts: number;
  let independenceNote: string;
  if (a.mode === 'olympiad') { independencePts = 100; independenceNote = 'В олимпиаде подсказок нет'; }
  else if (a.coaching) { independencePts = 40; independenceNote = 'Включено обучение с подсказками'; }
  else { independencePts = Math.max(0, 100 - 30 * a.hints); independenceNote = a.hints ? `Подсказок по запросу: ${a.hints}` : 'Без подсказок'; }
  const timePts = a.completed ? Math.round(100 * Math.min(1, a.parSec / Math.max(1, a.timeSec))) : 0;
  const lines: ScoreLine[] = [
    { id: 'execution', label: 'Выполнение', points: execution, max: 500, note: `${criteria.filter(c => c.ok).length} из ${criteria.length} критериев выполнены полностью` },
    { id: 'accuracy', label: 'Точность', points: accuracyPts, max: 300, note: a.errors ? `Ошибок: ${a.errors}, по ${ERROR_PENALTY} баллов за каждую` : 'Без ошибок' },
    { id: 'independence', label: 'Самостоятельность', points: independencePts, max: 100, note: independenceNote },
    { id: 'time', label: 'Время', points: timePts, max: 100, note: a.completed ? `${Math.round(a.timeSec)} с при норме ${Math.round(a.parSec)} с` : 'Время засчитывается только за завершённую работу' },
  ];
  const total = lines.reduce((sum, line) => sum + line.points, 0);
  const stars: Score['stars'] = !a.completed ? 0 : total >= MAX_GRADE_SCORE ? 3 : total >= 700 ? 2 : 1;
  return { total, max: MAX_SCORE, lines, criteria, accuracy: Math.max(0, 1 - a.errors * (ERROR_PENALTY / 300)), stars };
}
