import {TurningBlueprint} from './TurningWorkview';
import { Fragment, useMemo, useState } from 'react';
import { DIRECTIONS, MISSIONS, PLANNED, ZONES, type Direction, type MissionSpec } from '../platform/missions';
import { isPassed, levelFromXp, lockReason, missionStatus, STATUS_LABEL, zoneState, type MissionStatus, type Profile } from '../platform/progress';
import { Icon } from '../ui/Icon';
import { Button, Chip } from '../ui/primitives';
import { ExerciseDiagram } from './ExerciseDiagram';
import { DrawingSheet } from './DrawingSheet';
import { Difficulty, drawingOf, navigate, PageHeader, STATUS_ICON, STATUS_TONE, Stars } from './shared';
import { formatTime } from '../platform/result';

type Selection = { kind: 'mission'; id: string } | { kind: 'planned'; id: string } | null;

export function MissionMap({ profile, focus }: { profile: Profile; focus?: string }) {
  const [sel, setSel] = useState<Selection>(focus && MISSIONS.some(m => m.id === focus) ? { kind: 'mission', id: focus } : null);
  const level = levelFromXp(profile.xp);
  const total = MISSIONS.length, passed = MISSIONS.filter(m => isPassed(profile, m.id)).length;
  return (
    <main className="page map-page">
      <PageHeader eyebrow="Схема завода" title="Карта миссий">
        <Chip tone="green" icon="check"><span className="num">{passed} из {total}</span> пройдено</Chip>
        <Chip icon="bolt">Уровень <span className="num">{level}</span></Chip>
      </PageHeader>
      <div className="map-layout">
        <div className="map-tracks">
          <Legend />
          {DIRECTIONS.map(direction => <Track key={direction.id} direction={direction} profile={profile} sel={sel} onSelect={setSel} />)}
        </div>
        <MissionDetail profile={profile} sel={sel} onClose={() => setSel(null)} />
      </div>
    </main>
  );
}

function Legend() {
  const items: MissionStatus[] = ['locked', 'available', 'in-progress', 'passed', 'max'];
  return (
    <ul className="legend" aria-label="Обозначения">
      {items.map(s => <li key={s}><span className={`hex hex--sm hex--${s}`} aria-hidden="true"><Icon name={STATUS_ICON[s]} size={12} /></span>{STATUS_LABEL[s]}</li>)}
      {PLANNED.length > 0 && <li><span className="hex hex--sm hex--planned" aria-hidden="true" />Запланировано</li>}
    </ul>
  );
}

function Track({ direction, profile, sel, onSelect }: { direction: Direction; profile: Profile; sel: Selection; onSelect: (s: Selection) => void }) {
  const missions = useMemo(() => MISSIONS.filter(m => m.direction === direction.id), [direction.id]);
  const planned = PLANNED.filter(p => p.direction === direction.id);
  const done = missions.filter(m => isPassed(profile, m.id)).length;
  // Метки зон ставятся перед первой миссией зоны, если зона не «учебный цех».
  const seen = new Set<string>();
  return (
    <section className="track surface" aria-label={direction.title}>
      <header className="track__head">
        <span className="track__icon" aria-hidden="true"><Icon name={direction.icon} size={22} /></span>
        <div><h2 className="t-h3">{direction.title}</h2><p className="t-small t-dim">{direction.blurb}</p></div>
        <span className="track__count num">{missions.length ? `${done} / ${missions.length}` : 'нет заданий'}</span>
      </header>
      <ol className="track__line">
        {missions.map(m => {
          const status = missionStatus(profile, m);
          const zone = ZONES.find(z => z.id === m.zone)!;
          const gate = !seen.has(zone.id) && (zone.requiresMissions.length > 0 || zone.id === 'turning-school');
          seen.add(zone.id);
          const zs = zoneState(profile, zone);
          return (
            <Fragment key={m.id}>
              {gate && (
                <li className="track__item track__item--gate">
                  <div className={`gate ${zs.unlocked ? 'gate--open' : ''}`}>
                    <Icon name={zs.unlocked ? 'check' : 'lock'} size={14} /><span><b>{zone.title}</b><small>{zs.unlocked ? 'зона открыта' : zs.reason}</small></span>
                  </div>
                </li>
              )}
              <li className="track__item">
                <MissionNode mission={m} status={status} profile={profile} active={sel?.kind === 'mission' && sel.id === m.id} onSelect={() => onSelect({ kind: 'mission', id: m.id })} />
              </li>
            </Fragment>
          );
        })}
        {planned.map(p => (
          <li key={p.id} className="track__item">
            <button type="button" className={`node node--planned ${sel?.kind === 'planned' && sel.id === p.id ? 'is-active' : ''}`} aria-pressed={sel?.kind === 'planned' && sel.id === p.id} onClick={() => onSelect({ kind: 'planned', id: p.id })}>
              <span className="hex hex--planned" aria-hidden="true" />
              <span className="node__label"><b>{p.title}</b><small>Запланировано</small></span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MissionNode({ mission, status, profile, active, onSelect }: { mission: MissionSpec; status: MissionStatus; profile: Profile; active: boolean; onSelect: () => void }) {
  const record = profile.records[mission.id];
  const stars = record ? (record.status === 'max' ? 3 : record.best >= 700 ? 2 : 1) : 0;
  return (
    <button type="button" className={`node node--${status} ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={onSelect}>
      <span className={`hex hex--${status}`} aria-hidden="true"><Icon name={STATUS_ICON[status]} size={22} /></span>
      <span className="node__label"><b>{mission.title}</b><small>{STATUS_LABEL[status]}</small>{(status === 'passed' || status === 'max') && <Stars count={stars} size={13} />}</span>
    </button>
  );
}

function MissionDetail({ profile, sel, onClose }: { profile: Profile; sel: Selection; onClose: () => void }) {
  const mission = sel?.kind === 'mission' ? MISSIONS.find(m => m.id === sel.id) : undefined;
  const drawing = useMemo(() => (mission?.build ? drawingOf(mission.build()) : null), [mission]);
  if (!sel) {
    return (
      <aside className="detail surface detail--empty" aria-label="Сведения о миссии">
        <Icon name="map" size={34} />
        <h2 className="t-h3">Выберите миссию на схеме</h2>
        <p className="t-small t-dim">Здесь появятся заказ, чертёж, условия открытия и ваш лучший результат.</p>
      </aside>
    );
  }
  if (sel.kind === 'planned') {
    const p = PLANNED.find(x => x.id === sel.id)!;
    return (
      <aside className="detail surface" aria-label="Сведения о запланированной миссии">
        <header className="detail__head"><Chip>Запланировано</Chip><Button variant="quiet" size="sm" icon="close" label="Закрыть" onClick={onClose} /></header>
        <h2 className="t-h2">{p.title}</h2>
        <p className="t-dim">Задания пока нет: для него не хватает механики в ядре. {p.note}</p>
        <p className="t-small t-faint">Эта запись показывает направление развития платформы и не запускается.</p>
      </aside>
    );
  }
  if (!mission || (!drawing && !mission.exercise)) return null;
  const status = missionStatus(profile, mission);
  const record = profile.records[mission.id];
  const reason = lockReason(profile, mission);
  return (
    <aside className="detail surface" aria-label={`Миссия «${mission.title}»`}>
      <header className="detail__head"><Chip tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>{STATUS_LABEL[status]}</Chip><Button variant="quiet" size="sm" icon="close" label="Закрыть" onClick={onClose} /></header>
      <h2 className="t-h2">{mission.title}</h2>
      <p>{mission.order}</p>
      <p className="t-small t-dim">{mission.teaches}</p>
      <div className="detail__meta"><span><Icon name="clock" size={16} />около {mission.minutes} мин</span><span><Difficulty value={mission.difficulty} />сложность</span></div>
      {mission.exercise ? <ExerciseDiagram exercise={mission.exercise} /> : mission.training ? <TurningBlueprint geometry={mission.training.requirements} title={mission.title} display={mission.training.drawing}/> : drawing && <DrawingSheet title={drawing.title} blank={drawing.blank} ops={drawing.ops} requirements={drawing.requirements} />}
      {record && record.best > 0 && (
        <dl className="detail__rec">
          <div><dt>Лучший результат</dt><dd className="num">{record.best}</dd></div>
          <div><dt>Лучшее время</dt><dd className="num">{record.bestTimeSec !== null ? formatTime(record.bestTimeSec) : '—'}</dd></div>
          <div><dt>Попыток</dt><dd className="num">{record.attempts}</dd></div>
        </dl>
      )}
      {status === 'locked'
        ? <p className="lockbox"><Icon name="lock" size={18} /><span>{reason}</span></p>
        : <Button variant="primary" size="lg" iconRight="next" onClick={() => navigate(`#/mission/${mission.id}`)}>{status === 'available' ? 'Начать миссию' : status === 'in-progress' ? 'Продолжить' : 'Пройти ещё раз'}</Button>}
    </aside>
  );
}
