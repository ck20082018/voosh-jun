import { useMemo } from 'react';
import { DIRECTIONS, MISSIONS, PLANNED, type MissionSpec } from '../platform/missions';
import { OLYMPIADS } from '../platform/olympiads';
import { ACHIEVEMENTS, isPassed, levelFromXp, missionStatus, nextRank, rankFor, recommended, STATUS_LABEL, xpProgress, type Profile } from '../platform/progress';
import { stageKey } from '../platform/olympiads';
import { Icon } from '../ui/Icon';
import { Button, Chip, Meter, Ring } from '../ui/primitives';
import { DrawingSheet } from './DrawingSheet';
import { Difficulty, drawingOf, navigate, STATUS_TONE } from './shared';

export function Hub({ profile }: { profile: Profile }) {
  const level = levelFromXp(profile.xp);
  const prog = xpProgress(profile.xp);
  const rank = rankFor(level), upcoming = nextRank(level);
  const next = recommended(profile);
  const earned = ACHIEVEMENTS.filter(a => profile.achievements[a.id]).sort((a, b) => profile.achievements[b.id] - profile.achievements[a.id]);
  const open = OLYMPIADS.filter(o => o.status === 'open');
  const passed = MISSIONS.filter(m => isPassed(profile, m.id)).length;

  return (
    <main className="page hub">
      <header className="hub__head">
        <div>
          <span className="eyebrow">Рабочая смена</span>
          <h1 className="t-h1">Здравствуйте, {profile.name}</h1>
          <p className="t-dim">{passed === 0 ? 'Первая смена начинается с первого заказа.' : `Выполнено заданий: ${passed} из ${MISSIONS.length}.`}</p>
        </div>
      </header>

      <div className="hub__grid">
        <Hero mission={next} profile={profile} allDone={!next} />

        <section className="surface hub-card level-card" aria-label="Уровень">
          <div className="level-card__row">
            <Ring value={prog.fraction} size={88} stroke={7} tone="amber" label="Прогресс до следующего уровня"><span className="level-card__num"><b>{level}</b><small>уровень</small></span></Ring>
            <div>
              <span className="eyebrow">Звание</span>
              <p className="t-h3">{rank.title}</p>
              <p className="t-small t-dim num">{prog.into} / {prog.span} XP до уровня {level + 1}</p>
            </div>
          </div>
          {upcoming && <p className="t-small t-faint">Следующее звание «{upcoming.title}» с уровня {upcoming.from}.</p>}
          <p className="t-small t-faint">Уровень открывает зоны цеха и не влияет на оценку заданий.</p>
        </section>

        <section className="surface hub-card dirs" aria-label="Направления">
          <h2 className="sheet-h">Направления</h2>
          <ul>
            {DIRECTIONS.map(d => {
              const playable = MISSIONS.filter(m => m.direction === d.id);
              const done = playable.filter(m => isPassed(profile, m.id)).length;
              const planned = PLANNED.filter(p => p.direction === d.id).length;
              return (
                <li key={d.id}>
                  <span className="dirs__icon" aria-hidden="true"><Icon name={d.icon} size={20} /></span>
                  <div>
                    <b>{d.title}</b>
                    {playable.length ? <><Meter value={done} max={playable.length} tone={done === playable.length ? 'green' : 'teal'} label={`${d.title}: пройдено ${done} из ${playable.length}`} /><small className="num">{done} из {playable.length} заданий{planned ? ` · ещё ${planned} запланировано` : ''}</small></> : <small>Заданий пока нет{planned ? `, запланировано: ${planned}` : ''}</small>}
                  </div>
                  {!playable.length && <Chip>Скоро</Chip>}
                </li>
              );
            })}
          </ul>
          <Button variant="ghost" size="sm" icon="map" onClick={() => navigate('#/map')}>Открыть карту миссий</Button>
        </section>

        <section className="surface hub-card" aria-label="Олимпиады">
          <h2 className="sheet-h">Олимпиады <Chip tone="amber">демо-данные</Chip></h2>
          {open.map(o => {
            const done = o.stages.filter(s => profile.stages[stageKey(o.id, s.id)] && !profile.stages[stageKey(o.id, s.id)].pending).length;
            return (
              <div key={o.id} className="olymp-mini">
                <div><b>{o.title}</b><small>{o.grades} · этапов: {o.stages.length}</small></div>
                <Chip tone={done === o.stages.length ? 'green' : 'teal'}>{done} из {o.stages.length}</Chip>
              </div>
            );
          })}
          <p className="t-small t-faint">Одна попытка на этап, подсказок нет, оценка по формуле.</p>
          <Button variant="ghost" size="sm" icon="trophy" onClick={() => navigate('#/olympiads')}>К олимпиадам</Button>
        </section>

        <section className="surface hub-card" aria-label="Достижения">
          <h2 className="sheet-h">Достижения <span className="t-faint num">{earned.length} из {ACHIEVEMENTS.length}</span></h2>
          {earned.length === 0 ? <p className="t-small t-dim">Пока нет. Первое достижение выдают за первую сданную деталь.</p> : (
            <ul className="awards awards--compact">
              {earned.slice(0, 3).map(a => <li key={a.id}><span aria-hidden="true"><Icon name={a.icon} size={20} /></span><div><b>{a.title}</b><small>{a.description}</small></div></li>)}
            </ul>
          )}
          <Button variant="ghost" size="sm" icon="user" onClick={() => navigate('#/profile')}>Все достижения</Button>
        </section>
      </div>
    </main>
  );
}

function Hero({ mission, profile, allDone }: { mission: MissionSpec | null; profile: Profile; allDone: boolean }) {
  const drawing = useMemo(() => (mission ? drawingOf(mission.build()) : null), [mission]);
  if (!mission || !drawing) {
    return (
      <section className="surface hero hero--done" aria-label="Следующая миссия">
        <div><span className="eyebrow">Все доступные задания пройдены</span><h2 className="t-h2">Хорошая смена</h2><p className="t-dim">{allDone ? 'Новые задания откроются вместе с новыми механиками. Можно улучшить результаты на карте или попробовать олимпиаду.' : ''}</p></div>
        <div className="hero__actions"><Button variant="primary" size="lg" icon="map" onClick={() => navigate('#/map')}>К карте миссий</Button></div>
      </section>
    );
  }
  const status = missionStatus(profile, mission);
  return (
    <section className="surface hero" aria-label="Следующая миссия">
      <div className="hero__text">
        <div className="hero__chips"><Chip tone={STATUS_TONE[status]}>{status === 'in-progress' ? 'Продолжить' : 'Следующий заказ'}</Chip><Chip>{STATUS_LABEL[status]}</Chip></div>
        <h2 className="t-h1 hero__title">{mission.title}</h2>
        <p>{mission.order}</p>
        <p className="t-small t-dim">{mission.teaches}</p>
        <div className="hero__meta"><span><Icon name="clock" size={16} /> около {mission.minutes} мин</span><span><Difficulty value={mission.difficulty} /> сложность</span></div>
        <div className="hero__actions"><Button variant="primary" size="lg" iconRight="next" onClick={() => navigate(`#/mission/${mission.id}`)}>{status === 'in-progress' ? 'Продолжить миссию' : 'Начать миссию'}</Button></div>
      </div>
      <div className="hero__drawing"><DrawingSheet title={drawing.title} blank={drawing.blank} ops={drawing.ops} /></div>
    </section>
  );
}
