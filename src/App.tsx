import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DIRECTIONS, MISSIONS, missionById } from './platform/missions';
import { olympiadById, stageKey } from './platform/olympiads';
import { computeScore } from './platform/scoring';
import { applyMissionAttempt, applyStageAttempt, defaultProfile, loadProfile, lockReason, markStageStarted, markStarted, saveProfile, missionStatus, isPassed, type AttemptResult, type Profile } from './platform/progress';
import type { MissionSession } from './platform/session';
import type { AttemptReport } from './platform/exerciseSession';
import { ExerciseScreen } from './screens/ExerciseScreen';
import type { ResultData } from './platform/result';
import { applyMotionSetting, type MotionSetting } from './ui/motion';
import { Icon, type IconName } from './ui/Icon';
import { Button } from './ui/primitives';
import { Hub } from './screens/Hub';
import { MissionMap } from './screens/MissionMap';
import { MissionScreen } from './screens/MissionScreen';
import { Olympiads, stageState } from './screens/Olympiads';
import { ProfileScreen } from './screens/Profile';
import { ResultScreen } from './screens/ResultScreen';
import { navigate, useRoute } from './screens/shared';

const EditorApp = lazy(() => import('./Editor').then(module => ({ default: module.EditorApp })));

interface ResultState { data: ResultData; olympiad: boolean; retry?: () => void; nextHash?: string; backHash: string; backLabel: string }

const storage = (): Storage | null => { try { return localStorage; } catch { return null; } };

const NAV: { key: string; hash: string; icon: IconName; label: string }[] = [
  { key: 'hub', hash: '#/hub', icon: 'hub', label: 'Хаб' },
  { key: 'map', hash: '#/map', icon: 'map', label: 'Карта' },
  { key: 'olympiads', hash: '#/olympiads', icon: 'trophy', label: 'Олимпиады' },
  { key: 'profile', hash: '#/profile', icon: 'user', label: 'Профиль' },
  { key: 'editor', hash: '#/editor', icon: 'editor', label: 'Редактор' },
];

const TITLES: Record<string, string> = { hub: 'Хаб', map: 'Карта миссий', olympiads: 'Олимпиады', profile: 'Профиль', editor: 'Редактор заданий', mission: 'Миссия', olympiad: 'Олимпиада', result: 'Результат' };

export function App() {
  const route = useRoute();
  const [profile, setProfile] = useState<Profile>(() => { const s = storage(); return s ? loadProfile(s) : defaultProfile(); });
  const profileRef = useRef(profile);
  const [result, setResult] = useState<ResultState | null>(null);
  const [attempt, setAttempt] = useState(0);

  const commit = useCallback((next: Profile) => {
    profileRef.current = next;
    setProfile(next);
    const s = storage();
    if (s) saveProfile(s, next);
  }, []);

  const motion = profile.settings.motion;
  useEffect(() => {
    applyMotionSetting(motion);
    if (motion !== 'system' || typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => applyMotionSetting('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [motion]);

  const section = route[0] ?? 'hub';
  useEffect(() => { document.title = `${TITLES[section] ?? 'Учебный завод'} · Учебный завод`; }, [section]);
  useEffect(() => { if (!route.length) navigate('#/hub'); }, [route.length]);

  const setMotion = (value: MotionSetting) => commit({ ...profileRef.current, settings: { ...profileRef.current.settings, motion: value } });

  /* ---------- завершение попыток ---------- */
  const nextMissionAfter = (p: Profile, currentId: string) => {
    const idx = MISSIONS.findIndex(m => m.id === currentId);
    const ordered = [...MISSIONS.slice(idx + 1), ...MISSIONS.slice(0, idx + 1)];
    return ordered.find(m => m.id !== currentId && !isPassed(p, m.id) && missionStatus(p, m) !== 'locked') ?? null;
  };
  const buildResult = (session: AttemptReport, res: AttemptResult, before: Profile, extra: Pick<ResultData, 'kind' | 'title' | 'next' | 'nextLabel'>): ResultData => {
    const summary = session.summary();
    return {
      ...extra, ended: session.ended ?? 'abandoned', score: computeScore(summary), summary,
      xpGained: res.xpGained, xpBefore: before.xp, xpAfter: res.profile.xp, levelBefore: res.levelBefore, levelAfter: res.levelAfter,
      newAchievements: res.newAchievements, previousBest: res.previousBest, improved: res.improved, protocol: [...session.protocol], errors: [...session.errors],
    };
  };

  const finishMission = (session: AttemptReport, id: string) => {
    const mission = missionById(id)!;
    const before = profileRef.current;
    const summary = session.summary();
    const res = applyMissionAttempt(before, id, summary, computeScore(summary), session.opsTotal);
    commit(res.profile);
    const next = nextMissionAfter(res.profile, id);
    setResult({
      data: buildResult(session, res, before, { kind: 'mission', title: mission.title, next: next ? { id: next.id, title: next.title } : null, nextLabel: 'Следующая миссия' }),
      olympiad: false,
      retry: () => { setAttempt(a => a + 1); navigate(`#/mission/${id}`); },
      nextHash: next ? `#/mission/${next.id}` : undefined,
      backHash: `#/map/${id}`, backLabel: 'К карте миссий',
    });
    navigate('#/result');
  };

  const finishStage = (session: MissionSession, oid: string, sid: string) => {
    const olympiad = olympiadById(oid)!;
    const index = olympiad.stages.findIndex(s => s.id === sid);
    const stage = olympiad.stages[index];
    const before = profileRef.current;
    const summary = session.summary();
    const res = applyStageAttempt(before, stageKey(oid, sid), stage.title, summary, computeScore(summary), session.opsTotal);
    commit(res.profile);
    const following = olympiad.stages[index + 1];
    setResult({
      data: buildResult(session, res, before, { kind: 'stage', title: `${olympiad.title}: ${stage.title}`, next: following ? { id: following.id, title: following.title } : null, nextLabel: 'Следующий этап' }),
      olympiad: true,
      nextHash: following ? `#/olympiad/${oid}/${following.id}` : undefined,
      backHash: '#/olympiads', backLabel: 'К олимпиадам',
    });
    navigate('#/result');
  };

  /* ---------- маршруты ---------- */
  let content;
  let fullscreen = false;
  switch (section) {
    case 'hub': content = <Hub profile={profile} />; break;
    case 'map': content = <MissionMap key={route[1] ?? 'map'} profile={profile} focus={route[1]} />; break;
    case 'olympiads': content = <Olympiads profile={profile} />; break;
    case 'profile': content = <ProfileScreen profile={profile} onName={name => commit({ ...profileRef.current, name })} onMotion={setMotion} onReset={() => { commit(defaultProfile()); setResult(null); }} />; break;
    case 'editor': content = <Suspense fallback={<div className="scene-loading" role="status">Загрузка редактора…</div>}><EditorApp /></Suspense>; break;
    case 'mission':
      fullscreen = true;
      content = <MissionPlay key={`${route[1]}:${attempt}`} id={route[1] ?? ''} attempt={attempt} profile={profile} motion={motion} onMotion={setMotion}
        onStarted={id => commit(markStarted(profileRef.current, id))} onFinished={finishMission} />;
      break;
    case 'olympiad':
      fullscreen = true;
      content = <StagePlay oid={route[1] ?? ''} sid={route[2] ?? ''} profile={profile} motion={motion} onMotion={setMotion}
        onStarted={key => commit(markStageStarted(profileRef.current, key))} onFinished={finishStage} />;
      break;
    case 'result':
      fullscreen = true;
      content = result ? (
        <ResultScreen result={result.data} olympiad={result.olympiad} onRetry={result.retry} onNext={result.nextHash ? () => navigate(result.nextHash!) : undefined} onBack={() => navigate(result.backHash)} backLabel={result.backLabel} />
      ) : <Redirect to="#/hub" />;
      break;
    default: content = <Redirect to="#/hub" />;
  }

  if (fullscreen) return <>{content}</>;
  return (
    <div className="shell">
      <a className="skip-link" href="#content" onClick={event => { event.preventDefault(); document.getElementById('content')?.focus(); }}>К содержимому</a>
      <nav className="rail" aria-label="Основная навигация">
        <a className="rail__brand" href="#/hub" aria-label="Учебный завод: на хаб">
          <svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true"><path d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25z" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="16" cy="16" r="4.6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M16 2.5v6.2M27.7 22.75l-5.4-3.1M4.3 22.75l5.4-3.1" stroke="currentColor" strokeWidth="2" /></svg>
          <span>Учебный<br />завод</span>
        </a>
        <ul>
          {NAV.map(item => (
            <li key={item.key}>
              <a href={item.hash} className="rail__link" aria-current={section === item.key ? 'page' : undefined}><Icon name={item.icon} size={22} /><span>{item.label}</span></a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="shell__content" id="content" tabIndex={-1}>{content}</div>
    </div>
  );
}

function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to); }, [to]);
  return null;
}

function Blocked({ title, text, backHash, backLabel }: { title: string; text: string; backHash: string; backLabel: string }) {
  return (
    <main className="mission mission--error"><div className="center-card surface"><Icon name="lock" size={28} /><h1 className="t-h2">{title}</h1><p className="t-dim">{text}</p><Button variant="primary" onClick={() => navigate(backHash)}>{backLabel}</Button></div></main>
  );
}

interface PlayCommon { profile: Profile; motion: MotionSetting; onMotion: (m: MotionSetting) => void }

function MissionPlay({ id, attempt, profile, motion, onMotion, onStarted, onFinished }: PlayCommon & { id: string; attempt: number; onStarted: (id: string) => void; onFinished: (session: AttemptReport, id: string) => void }) {
  const mission = missionById(id);
  const level = useMemo(() => mission?.build?.(), [mission, attempt]);
  // Доступность проверяется один раз при входе: прогресс внутри попытки её не прерывает.
  const [gate] = useState(() => (mission ? lockReason(profile, mission) : 'Такой миссии нет.'));
  if (!mission) return <Blocked title="Миссия не найдена" text="Выберите задание на карте миссий." backHash="#/map" backLabel="К карте миссий" />;
  if (gate) return <Blocked title="Миссия закрыта" text={gate} backHash="#/map" backLabel="К карте миссий" />;
  if (mission.exercise) return <ExerciseScreen mission={mission} exercise={mission.exercise} onStarted={() => onStarted(id)} onFinished={report => onFinished(report, id)} onExit={() => navigate(`#/map/${id}`)} />;
  if (!level) return null;
  const direction = DIRECTIONS.find(d => d.id === mission.direction)?.title ?? '';
  return (
    <MissionScreen key={`${id}:${attempt}`} level={level} mode="training" title={mission.title} eyebrow={`Миссия ${MISSIONS.indexOf(mission) + 1} · ${direction}`}
      motion={motion} onMotion={onMotion} onStarted={() => onStarted(id)} onExit={() => navigate(`#/map/${id}`)} onFinished={session => onFinished(session, id)} />
  );
}

function StagePlay({ oid, sid, profile, motion, onMotion, onStarted, onFinished }: PlayCommon & { oid: string; sid: string; onStarted: (key: string) => void; onFinished: (session: MissionSession, oid: string, sid: string) => void }) {
  const olympiad = olympiadById(oid);
  const index = olympiad ? olympiad.stages.findIndex(s => s.id === sid) : -1;
  const stage = olympiad && index >= 0 ? olympiad.stages[index] : undefined;
  const level = useMemo(() => stage?.build(), [stage]);
  const [gate] = useState(() => (!olympiad || !stage ? 'Такого этапа нет.' : (() => { const st = stageState(profile, olympiad, index); return st.kind === 'ready' ? '' : st.kind === 'locked' ? st.reason : 'Попытка на этом этапе уже использована.'; })()));
  if (!olympiad || !stage || !level) return <Blocked title="Этап не найден" text="Выберите этап на странице олимпиад." backHash="#/olympiads" backLabel="К олимпиадам" />;
  if (gate) return <Blocked title="Этап недоступен" text={gate} backHash="#/olympiads" backLabel="К олимпиадам" />;
  return (
    <MissionScreen key={`${oid}:${sid}`} level={level} mode="olympiad" title={stage.title} eyebrow={`Олимпиада «${olympiad.title}» · этап ${index + 1} из ${olympiad.stages.length}`} timeLimitSec={stage.timeLimitSec}
      motion={motion} onMotion={onMotion} onStarted={() => onStarted(stageKey(oid, sid))} onExit={() => navigate('#/olympiads')} onFinished={session => onFinished(session, oid, sid)} />
  );
}
