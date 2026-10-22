import { useEffect, useId, useRef, useState } from 'react';
import type { MissionSpec } from '../platform/missions';
import { INSTRUCTIONS, type Exercise, type ExerciseAnswer, type Evaluation, type Instruction } from '../platform/exercises';
import { ExerciseSession, type AttemptReport } from '../platform/exerciseSession';
import { Button, Chip } from '../ui/primitives';
import { ExerciseDiagram } from './ExerciseDiagram';
import './exercises.css';

const initialAnswer = (exercise: Exercise): ExerciseAnswer => exercise.kind === 'route'
  ? { order: exercise.steps.map(s => s.id).reverse(), stations: {} }
  : exercise.kind === 'schedule' ? { order: exercise.jobs.map(j => j.id).reverse() }
  : exercise.kind === 'automation' ? { program: [] } : {};

function Select({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (value: string) => void }) {
  const id = useId();
  return <div className="exercise-field"><label htmlFor={id}>{label}</label><select id={id} value={value ?? ''} onChange={e => onChange(e.target.value)}><option value="">Выберите…</option>{options.map(o => <option key={o} value={o}>{o === 'fit' ? 'Годна' : o === 'reject' ? 'Брак' : o}</option>)}</select></div>;
}
function Sequence({ ids, label, move, remove }: { ids: string[]; label: (id: string) => string; move: (index: number, delta: number) => void; remove?: (index: number) => void }) {
  return <ol className="exercise-sequence">{ids.map((id, i) => <li key={`${i}:${id}`}><span className="num">{i + 1}.</span><b>{label(id)}</b><Button size="sm" disabled={i === 0} label={`Вверх: ${label(id)}, шаг ${i + 1}`} onClick={() => move(i, -1)}>↑</Button><Button size="sm" disabled={i === ids.length - 1} label={`Вниз: ${label(id)}, шаг ${i + 1}`} onClick={() => move(i, 1)}>↓</Button>{remove && <Button size="sm" label={`Удалить шаг ${i + 1}`} onClick={() => remove(i)}>×</Button>}</li>)}</ol>;
}
export const EXERCISE_HINTS: Record<Exercise['kind'], string> = {
  assembly: 'Межосевое расстояние a = m × (z₁ + z₂) / 2. Скорость выхода n₂ = n₁ × z₁ / z₂. Сначала найдите сумму зубьев, затем отношение.',
  route: 'Начните с операции без предшественников. Операцию можно ставить только после всех указанных предшественников. Пост должен соответствовать её назначению.',
  measurement: 'Ноль нижней шкалы показывает целые миллиметры на верхней. Прибавьте номер совпавшего штриха нониуса × 0,1 мм. Сравните результат с обеими границами допуска.',
  automation: 'До закрепления проверьте наличие детали и закрытие кожуха. Затем закрепите, обработайте, разожмите и выдайте. Условная остановка завершает программу, если условие нарушено.',
  schedule: 'Один станок обрабатывает одну партию за раз. Партия на B ждёт завершения своей обработки на A и освобождения B. Попробуйте начинать с короткой операции A и длинной B.',
  tool: 'Для продольного точения нужен токарный станок и проходной резец. Торцевая фреза предназначена для фрезерования плоскости.',
};
export function ExerciseScreen({ mission, exercise, onStarted, onFinished, onExit }: { mission: MissionSpec; exercise: Exercise; onStarted: () => void; onFinished: (report: AttemptReport) => void; onExit: () => void }) {
  const [session] = useState(() => new ExerciseSession(exercise, mission.minutes * 60));
  const [started, setStarted] = useState(false);
  const [answer, setAnswer] = useState(() => initialAnswer(exercise));
  const [feedback, setFeedback] = useState<Evaluation | null>(null);
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState(false);
  const clock = useRef(0);
  const reported = useRef(false);
  useEffect(() => {
    if (!started || done) return;
    clock.current = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      if (!document.hidden) session.tick(Math.max(0, now - clock.current) / 1000);
      clock.current = now;
    }, 250);
    const visibility = () => { clock.current = performance.now(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [session, started, done]);
  const edit = (patch: Partial<ExerciseAnswer>) => { setAnswer(a => ({ ...a, ...patch })); setFeedback(null); };
  const move = (key: 'order' | 'program', index: number, delta: number) => {
    const items = [...(answer[key] ?? [])];
    if (index + delta < 0 || index + delta >= items.length) return;
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    if (key === 'program') edit({ program: items as Instruction[] }); else edit({ order: items });
  };
  return <main className="page exercise-page">
    <header className="page-head"><div><span className="eyebrow">Инженерная лаборатория</span><h1 className="t-h1">{mission.title}</h1></div><Button icon="map" onClick={onExit}>К карте</Button></header>
    <div className="exercise-layout"><section className="surface exercise-brief"><Chip>Сложность {mission.difficulty} из 3</Chip><h2 className="t-h3">Производственный заказ</h2><p>{mission.order}</p><p className="t-dim">{mission.teaches}</p><ExerciseDiagram exercise={exercise} answer={answer} />
      {exercise.kind === 'assembly' && <p>Шестерни имеют одинаковый модуль. Ведущая стоит на входном валу, ведомая — на выходном. Обратное направление вращения допустимо.</p>}
      {exercise.kind === 'schedule' && <><p>Каждая партия сначала проходит A, затем B. Оба станка работают параллельно, по одной партии за раз. На B используется та же очередь. Промежуточное ожидание не ограничено.</p><table><caption>Длительность обработки, мин</caption><thead><tr><th>Партия</th><th>A</th><th>B</th></tr></thead><tbody>{exercise.jobs.map(j => <tr key={j.id}><th>{j.id}</th><td>{j.first}</td><td>{j.second}</td></tr>)}</tbody></table></>}
      {exercise.kind === 'route' && <ul>{exercise.steps.map(s => <li key={s.id}><b>{s.label}</b>: {s.after.length ? `после «${s.after.map(id => exercise.steps.find(p => p.id === id)!.label).join('», «')}»` : 'начало маршрута'}</li>)}</ul>}
      {exercise.kind === 'automation' && <><p>Команды исполняются сверху вниз. Проверка датчика останавливает цикл, если условие не выполнено. При нормальных условиях программа должна выдать обработанную деталь.</p><ul>{exercise.scenarios.map((s, i) => <li key={i}>Испытание {i + 1}: деталь {s.part ? 'есть' : 'отсутствует'}, кожух {s.guard ? 'закрыт' : 'открыт'}.</li>)}</ul></>}
    </section><section className="surface exercise-controls" aria-label="Рабочее место">
      {!started ? <><h2 className="t-h3">Примите задание</h2><p>Изучите заказ и схему. Ошибки можно исправлять; каждая неудачная проверка уменьшает балл точности на 60. Памятка уменьшает балл самостоятельности на 30. Лимита времени нет.</p><Button variant="primary" onClick={() => { if (session.start()) { setStarted(true); onStarted(); } }}>Начать</Button></> : <>
        <h2 className="t-h3">Ваше решение</h2>
        <fieldset disabled={done} className="exercise-inputs">
          {(exercise.kind === 'assembly' || exercise.kind === 'tool') && <>
            <Select label={exercise.kind === 'assembly' ? 'Ведущая шестерня, зубьев' : 'Станок'} value={answer.first} options={exercise.kind === 'assembly' ? exercise.gears.map(String) : exercise.machines} onChange={first => edit({ first })} />
            <Select label={exercise.kind === 'assembly' ? 'Ведомая шестерня, зубьев' : 'Инструмент'} value={answer.second} options={exercise.kind === 'assembly' ? exercise.gears.map(String) : exercise.tools} onChange={second => edit({ second })} />
          </>}
          {exercise.kind === 'measurement' && <><label className="exercise-field"><span>Показание, мм</span><input inputMode="decimal" autoComplete="off" value={answer.reading ?? ''} onChange={e => edit({ reading: e.target.value })} placeholder="Например, 10,2" /></label><Select label="Решение контролёра" value={answer.verdict} options={['fit', 'reject']} onChange={verdict => edit({ verdict })} /></>}
          {(exercise.kind === 'route' || exercise.kind === 'schedule') && <Sequence ids={answer.order ?? []} label={id => exercise.kind === 'route' ? exercise.steps.find(s => s.id === id)!.label : id} move={(i, d) => move('order', i, d)} />}
          {exercise.kind === 'route' && exercise.steps.map(s => <Select key={s.id} label={`Пост: ${s.label}`} value={answer.stations?.[s.id]} options={exercise.stations} onChange={station => edit({ stations: { ...answer.stations, [s.id]: station } })} />)}
          {exercise.kind === 'automation' && <><div className="exercise-palette">{(Object.keys(INSTRUCTIONS) as Instruction[]).map(instruction => <Button key={instruction} size="sm" disabled={(answer.program?.length ?? 0) >= 20} onClick={() => edit({ program: [...(answer.program ?? []), instruction] })}>+ {INSTRUCTIONS[instruction]}</Button>)}</div><Sequence ids={answer.program ?? []} label={id => INSTRUCTIONS[id as Instruction]} move={(i, d) => move('program', i, d)} remove={index => edit({ program: answer.program?.filter((_, i) => i !== index) })} /><p className="t-small t-dim">До 20 команд. Изменяйте порядок стрелками.</p></>}
        </fieldset>
        <div className="exercise-actions"><Button variant="primary" disabled={done} onClick={() => { const result = session.submit(answer); if (result) { setFeedback(result); if (session.ended) setDone(true); } }}>Проверить {exercise.kind === 'automation' ? 'программу' : 'решение'}</Button><Button disabled={done || hint} onClick={() => { if (session.hint()) setHint(true); }}>Памятка (−30)</Button><Button disabled={done} onClick={() => { setAnswer(initialAnswer(exercise)); setFeedback(null); }}>Очистить решение</Button></div>
        {hint && <aside className="exercise-hint" role="note">{EXERCISE_HINTS[exercise.kind]}</aside>}
        {feedback && <div className="exercise-feedback" role="status"><h3 className="t-h3">{done ? 'Задание выполнено' : 'Исправьте решение'}</h3><ul>{feedback.checks.map(c => <li key={c.id} data-ok={c.ok}><b>{c.ok ? '✓' : '✕'} {c.label}</b>{!c.ok && <p>{c.detail}</p>}</li>)}</ul>{feedback.trace.length > 0 && <details open><summary>Протокол моделирования</summary><ol>{feedback.trace.map((line, i) => <li key={i}>{line}</li>)}</ol></details>}</div>}
        {done && <Button variant="primary" onClick={() => { if (!reported.current) { reported.current = true; onFinished(session); } }}>Результат и награды</Button>}
      </>}
    </section></div>
  </main>;
}
