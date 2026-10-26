/** Pure training models. All answers are checked here, independently of React and the DOM. */
export type Instruction = 'part?' | 'guard?' | 'clamp' | 'run' | 'release' | 'eject';
export const INSTRUCTIONS: Record<Instruction, string> = {
  'part?': 'Если детали нет — остановить цикл', 'guard?': 'Если кожух открыт — остановить цикл',
  clamp: 'Закрепить деталь', run: 'Обработать', release: 'Разжать зажим', eject: 'Выдать деталь',
};
export type Exercise =
  | { kind: 'assembly'; module: number; distance: number; inputRpm: number; outputRpm: number; gears: number[] }
  | { kind: 'route'; steps: { id: string; label: string; after: string[]; station: string }[]; stations: string[] }
  | { kind: 'measurement'; whole: number; tick: number; min: number; max: number }
  | { kind: 'automation'; scenarios: { part: boolean; guard: boolean }[] }
  | { kind: 'schedule'; jobs: { id: string; first: number; second: number }[]; limit: number }
  | { kind: 'tool'; material: string; shape: 'cylinder' | 'block'; operation: string; machine: string; tool: string; machines: string[]; tools: string[] };
export interface ExerciseAnswer {
  first?: string; second?: string; order?: string[]; stations?: Record<string, string>;
  reading?: string; verdict?: string; program?: Instruction[];
}
export interface Check { id: string; label: string; ok: boolean; detail: string }
export interface Evaluation { checks: Check[]; trace: string[] }
const check = (id: string, label: string, ok: boolean, detail: string): Check => ({ id, label, ok, detail });
const permutation = (order: string[], ids: string[]) => order.length === ids.length && new Set(order).size === ids.length && ids.every(id => order.includes(id));

export interface ScheduleRow { id: string; startFirst: number; endFirst: number; startSecond: number; endSecond: number }
export function schedule(exercise: Extract<Exercise, { kind: 'schedule' }>, order: string[]): ScheduleRow[] | null {
  if (!permutation(order, exercise.jobs.map(j => j.id))) return null;
  let first = 0, second = 0;
  return order.map(id => {
    const job = exercise.jobs.find(j => j.id === id)!;
    const startFirst = first; first += job.first;
    const startSecond = Math.max(first, second); second = startSecond + job.second;
    return { id, startFirst, endFirst: first, startSecond, endSecond: second };
  });
}

export function runProgram(program: Instruction[], scenario: { part: boolean; guard: boolean }) {
  let clamped = false, processed = false, delivered = false;
  const trace: string[] = [];
  for (const instruction of program) {
    if (!(instruction in INSTRUCTIONS) || trace.length >= 20) return { ok: false, trace: [...trace, 'Недопустимая программа.'] };
    trace.push(INSTRUCTIONS[instruction]);
    if (instruction === 'part?' && !scenario.part || instruction === 'guard?' && !scenario.guard)
      return { ok: !clamped && !processed && !delivered, trace: [...trace, 'Безопасная остановка.'] };
    if (instruction === 'clamp') {
      if (!scenario.part || !scenario.guard || clamped || delivered) return { ok: false, trace: [...trace, 'Нельзя закрепить: проверьте датчики детали и кожуха.'] };
      clamped = true;
    }
    if (instruction === 'run') {
      if (!clamped || !scenario.guard || processed) return { ok: false, trace: [...trace, 'Опасный запуск: деталь должна быть закреплена, кожух закрыт.'] };
      processed = true;
    }
    if (instruction === 'release') {
      if (!clamped || !processed) return { ok: false, trace: [...trace, 'Разжим разрешён после обработки.'] };
      clamped = false;
    }
    if (instruction === 'eject') {
      if (clamped || !processed || delivered) return { ok: false, trace: [...trace, 'Выдавать можно обработанную и освобождённую деталь один раз.'] };
      delivered = true;
    }
  }
  return { ok: scenario.part && scenario.guard && delivered && !clamped, trace: [...trace, delivered ? 'Деталь выдана.' : 'Цикл не завершён.'] };
}

export function evaluateExercise(exercise: Exercise, answer: ExerciseAnswer): Evaluation {
  switch (exercise.kind) {
    case 'assembly': {
      const a = Number(answer.first), b = Number(answer.second);
      const selected = exercise.gears.includes(a) && exercise.gears.includes(b);
      const distance = exercise.module * (a + b) / 2;
      const rpm = b > 0 ? exercise.inputRpm * a / b : NaN;
      return { checks: [
        check('gears', 'Шестерни выбраны из каталога', selected, 'Выберите ведущую и ведомую шестерни.'),
        check('mesh', 'Зубья входят в зацепление', selected && Math.abs(distance - exercise.distance) < 0.001, `Межосевое расстояние m × (z₁ + z₂) / 2 должно быть ${exercise.distance} мм; сейчас ${selected ? distance : '—'}.`),
        check('speed', 'Скорость выхода соответствует заказу', selected && Math.abs(rpm - exercise.outputRpm) < 0.001, `n₂ = n₁ × z₁ / z₂. Требуется ${exercise.outputRpm} об/мин; сейчас ${selected ? Math.round(rpm * 100) / 100 : '—'}.`),
      ], trace: selected ? [`Ведущая: ${a} зубьев → ведомая: ${b} зубьев. Выход вращается в обратную сторону.`] : [] };
    }
    case 'route': {
      const order = answer.order ?? [], full = permutation(order, exercise.steps.map(s => s.id));
      return { checks: [check('complete', 'Все операции включены по одному разу', full, 'Включите каждую операцию маршрута ровно один раз.'),
        check('dependencies', 'Технологический порядок соблюдён', full && exercise.steps.every(s => s.after.every(id => order.indexOf(id) < order.indexOf(s.id))), 'Зависимости указаны в карточках: подготовка выполняется до обработки, контроль — после неё.'),
        check('stations', 'Операции назначены подходящим постам', exercise.steps.every(s => answer.stations?.[s.id] === s.station), 'Сопоставьте назначение операции и возможности каждого поста.')],
        trace: order.map(id => { const step = exercise.steps.find(s => s.id === id); return `${step?.label ?? id} → ${answer.stations?.[id] || 'пост не выбран'}`; }) };
    }
    case 'measurement': {
      const raw = answer.reading?.trim().replace(',', '.') ?? '';
      const reading = raw === '' ? NaN : Number(raw), actual = exercise.whole + exercise.tick / 10;
      const fit = actual >= exercise.min - 1e-8 && actual <= exercise.max + 1e-8;
      return { checks: [check('reading', 'Показание штангенциркуля прочитано верно', Number.isFinite(reading) && Math.abs(reading - actual) < 0.001, 'Показание = целые миллиметры слева от нуля нониуса + номер совпавшего штриха × 0,1 мм.'),
        check('tolerance', 'Годность определена по допуску', answer.verdict === (fit ? 'fit' : 'reject'), `Допустимый диапазон ${exercise.min}–${exercise.max} мм, включая границы. Сравните с измеренным размером.`)], trace: [] };
    }
    case 'automation': {
      const runs = exercise.scenarios.map(s => runProgram(answer.program ?? [], s));
      return { checks: runs.map((r, i) => check(`scenario-${i}`, `Деталь ${exercise.scenarios[i].part ? 'есть' : 'отсутствует'}, кожух ${exercise.scenarios[i].guard ? 'закрыт' : 'открыт'}`, r.ok, r.trace.at(-1)!)),
        trace: runs.flatMap((r, i) => [`Испытание ${i + 1}`, ...r.trace]) };
    }
    case 'schedule': {
      const rows = schedule(exercise, answer.order ?? []), total = rows?.at(-1)?.endSecond;
      return { checks: [check('jobs', 'Все партии запланированы', !!rows, 'Каждая партия должна пройти оба станка ровно один раз.'),
        check('deadline', 'План укладывается в срок', total !== undefined && total <= exercise.limit, `Заказ должен быть готов за ${exercise.limit} мин; ваш план: ${total ?? '—'} мин.`)],
        trace: rows?.map(r => `${r.id}: станок A ${r.startFirst}–${r.endFirst} мин → станок B ${r.startSecond}–${r.endSecond} мин`) ?? [] };
    }
    case 'tool': return { checks: [
      check('machine', 'Оборудование подходит для операции', answer.first === exercise.machine, `Для операции «${exercise.operation}» выберите подходящий станок.`),
      check('tool', 'Инструмент подходит для операции', answer.second === exercise.tool, 'Проходной резец обрабатывает цилиндр вдоль оси, торцевая фреза — плоскость бруска.')], trace: [] };
  }
}
