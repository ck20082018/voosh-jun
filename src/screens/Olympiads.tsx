import { useState } from 'react';
import { OLYMPIADS, stageKey, type Olympiad } from '../platform/olympiads';
import type { Profile, StageRecord } from '../platform/progress';
import { formatTime } from '../platform/result';
import { Icon } from '../ui/Icon';
import { Button, Chip } from '../ui/primitives';
import { navigate, PageHeader } from './shared';

export type StageState = { kind: 'locked'; reason: string } | { kind: 'ready' } | { kind: 'interrupted'; record: StageRecord } | { kind: 'done'; record: StageRecord };

export function stageState(profile: Profile, olympiad: Olympiad, index: number): StageState {
  const record = profile.stages[stageKey(olympiad.id, olympiad.stages[index].id)];
  if (record?.pending) return { kind: 'interrupted', record };
  if (record) return { kind: 'done', record };
  if (index > 0) {
    const previous = profile.stages[stageKey(olympiad.id, olympiad.stages[index - 1].id)];
    if (!previous) return { kind: 'locked', reason: `Сначала завершите этап «${olympiad.stages[index - 1].title}»` };
  }
  return { kind: 'ready' };
}

const COMPARE: { row: string; training: string; olympiad: string }[] = [
  { row: 'Подсказки', training: 'Есть, влияют на самостоятельность', olympiad: 'Нет' },
  { row: 'Подсветка следующего шага', training: 'Есть (можно выключить)', olympiad: 'Нет' },
  { row: 'Пауза и перезапуск', training: 'Есть', olympiad: 'Нет' },
  { row: 'Попытки', training: 'Сколько угодно', olympiad: 'Одна на этап' },
  { row: 'Время', training: 'Без ограничения', olympiad: 'Таймер этапа' },
  { row: 'Ошибка', training: '−60 баллов', olympiad: '−60 баллов, действие тоже считается' },
  { row: 'Влияние уровня и XP на оценку', training: 'Нет', olympiad: 'Нет' },
];

export function Olympiads({ profile }: { profile: Profile }) {
  const [id, setId] = useState(OLYMPIADS[0].id);
  const olympiad = OLYMPIADS.find(o => o.id === id) ?? OLYMPIADS[0];
  return (
    <main className="page olymp-page">
      <PageHeader eyebrow="Соревнования" title="Олимпиады">
        <Chip tone="amber" icon="info">Демо-данные: сроки и регламент условные</Chip>
      </PageHeader>
      <div className="olymp-layout">
        <ul className="olymp-list" aria-label="Список олимпиад">
          {OLYMPIADS.map(o => {
            const done = o.stages.filter((_, i) => ['done', 'interrupted'].includes(stageState(profile, o, i).kind)).length;
            return (
              <li key={o.id}>
                <button type="button" className={`olymp-card surface ${o.id === id ? 'is-active' : ''}`} aria-pressed={o.id === id} onClick={() => setId(o.id)}>
                  <span className="olymp-card__icon" aria-hidden="true"><Icon name="trophy" size={24} /></span>
                  <span><b>{o.title}</b><small>{o.grades}</small></span>
                  {o.status === 'planned' ? <Chip>Запланирована</Chip> : <Chip tone={done === o.stages.length ? 'green' : 'teal'}>{done} из {o.stages.length}</Chip>}
                </button>
              </li>
            );
          })}
        </ul>

        <section className="olymp-detail" aria-label={olympiad.title}>
          <div className="surface block">
            <h2 className="t-h2">{olympiad.title}</h2>
            <p className="t-dim">{olympiad.summary}</p>
            <h3 className="sheet-h">Регламент</h3>
            <ul className="rules">{olympiad.rules.map(rule => <li key={rule}><Icon name="shield" size={16} />{rule}</li>)}</ul>
          </div>

          {olympiad.stages.length > 0 && (
            <div className="surface block">
              <h3 className="sheet-h">Этапы</h3>
              <ol className="stages">
                {olympiad.stages.map((stage, i) => {
                  const st = stageState(profile, olympiad, i);
                  return (
                    <li key={stage.id} data-state={st.kind}>
                      <span className="stages__no num" aria-hidden="true">{i + 1}</span>
                      <div className="stages__text">
                        <b>{stage.title}</b>
                        <small>{stage.blurb}</small>
                        <small className="num">Время: {formatTime(stage.timeLimitSec)}</small>
                        {st.kind === 'done' && <small className="stages__res num">Результат: {st.record.score} из 1000 · ошибок {st.record.errors} · {formatTime(st.record.timeSec)}{st.record.completed ? '' : ' · время вышло'}</small>}
                        {st.kind === 'interrupted' && <small className="stages__res">Этап был начат и не завершён. Попытка использована, засчитано 0 баллов.</small>}
                        {st.kind === 'locked' && <small className="stages__res">{st.reason}</small>}
                      </div>
                      {st.kind === 'ready' && <Button variant="primary" iconRight="next" onClick={() => navigate(`#/olympiad/${olympiad.id}/${stage.id}`)}>Начать этап</Button>}
                      {st.kind === 'done' && <Chip tone={st.record.completed ? 'green' : 'amber'} icon={st.record.completed ? 'check' : 'clock'}>{st.record.completed ? 'Сдан' : 'По времени'}</Chip>}
                      {st.kind === 'interrupted' && <Chip tone="red" icon="xCircle">Прерван</Chip>}
                      {st.kind === 'locked' && <Chip icon="lock">Закрыт</Chip>}
                    </li>
                  );
                })}
              </ol>
              <p className="t-small t-faint">Общий рейтинг, регистрация и расписание требуют сервера и в прототипе не реализованы. Результаты хранятся только в этом браузере.</p>
            </div>
          )}

          {olympiad.stages.length === 0 && (
            <div className="surface block"><p className="t-dim">Заданий нет: для олимпиады нужны механики измерений, сборки и поиска неисправностей, которых в ядре пока нет.</p></div>
          )}

          <div className="surface block">
            <h3 className="sheet-h">Тренировка и олимпиада</h3>
            <table className="compare">
              <thead><tr><th scope="col">Условие</th><th scope="col">Тренировка</th><th scope="col">Олимпиада</th></tr></thead>
              <tbody>{COMPARE.map(c => <tr key={c.row}><th scope="row">{c.row}</th><td>{c.training}</td><td>{c.olympiad}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
