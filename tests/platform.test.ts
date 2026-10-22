import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLevel } from '../src/validation';
import { compileLevel } from '../src/compiler';
import { FactoryCore } from '../src/core';
import { MISSIONS, PLANNED, DIRECTIONS, operationsOf } from '../src/platform/missions';
import { OLYMPIADS } from '../src/platform/olympiads';
import { MissionSession } from '../src/platform/session';
import { computeScore, parSeconds, ERROR_PENALTY } from '../src/platform/scoring';
import {
  defaultProfile, applyMissionAttempt, applyStageAttempt, missionStatus, levelFromXp, xpProgress, rankFor, lockReason, markStarted, loadProfile, saveProfile, ACHIEVEMENTS,
} from '../src/platform/progress';

function playThrough(session: MissionSession, options: { wrongTargetOnce?: boolean } = {}) {
  const core = session.core;
  const r = core.resources;
  session.command('start');
  session.click(r.blank.id);
  session.command('install');
  if (options.wrongTargetOnce) session.click(r.warehouse.id);
  session.click(r.machine.id);
  for (let index = 0; index < r.operations.length; index++) {
    session.click(r.machine.id);
    assert.ok(session.command('process'), `операция ${index + 1} должна запуститься`);
    session.tick(r.operations[index].seconds * 1000 + 50);
  }
  session.click(r.blank.id);
  session.command('store');
  session.click(r.warehouse.id);
  return session;
}

test('каждая миссия платформы проходит валидацию, компилируется и имеет заявленные операции', () => {
  for (const mission of MISSIONS) {
    if (!mission.build) continue;
    const level = mission.build();
    assert.deepEqual(validateLevel(level), [], `${mission.id}: уровень должен быть корректен`);
    const compiled = compileLevel(level);
    assert.equal(compiled.mode, 'production');
    if (compiled.mode === 'production') assert.deepEqual(compiled.operations.map(o => o.kind==='turning' ? [o.diameter, o.length, o.seconds] : [o.depth,o.seconds]), operationsOf(level).map(o => [o.diameter, o.length, o.seconds]));
  }
  assert.equal(new Set(MISSIONS.map(m => m.id)).size, MISSIONS.length);
});

test('этапы олимпиады корректны, а будущие миссии не дублируют играбельные', () => {
  for (const olympiad of OLYMPIADS) for (const stage of olympiad.stages) assert.deepEqual(validateLevel(stage.build()), [], stage.id);
  const planned = OLYMPIADS.filter(o => o.status === 'planned');
  assert.ok(planned.every(o => o.stages.length === 0));
  assert.ok(PLANNED.every(p => !MISSIONS.some(m => m.id === p.id)));
  assert.equal(DIRECTIONS.length, 6);
});

test('сессия: полный проход без ошибок даёт максимальную оценку без обучения', () => {
  for (const mission of MISSIONS) {
    if (!mission.build) continue;
    const session = new MissionSession(new FactoryCore(compileLevel(mission.build!())), 'training', { coaching: false });
    playThrough(session);
    assert.equal(session.ended, 'completed', mission.id);
    const summary = session.summary();
    assert.equal(summary.errors, 0);
    assert.equal(summary.opsDone, summary.opsTotal);
    const score = computeScore({ ...summary, timeSec: 20 });
    assert.equal(score.total, 1000, `${mission.id}: без ошибок, подсказок и с нормой по времени`);
    assert.equal(score.stars, 3);
    session.dispose();
  }
});

test('сессия: неверная цель — ошибка, штраф и восстановление', () => {
  const session = new MissionSession(new FactoryCore(compileLevel(MISSIONS[0].build!())), 'training', { coaching: false });
  const events: string[] = [];
  session.onEvent(event => { if (event.type === 'error') events.push(event.code); });
  playThrough(session, { wrongTargetOnce: true });
  assert.equal(session.ended, 'completed');
  assert.deepEqual(events, ['wrong-target']);
  const score = computeScore({ ...session.summary(), timeSec: 10 });
  assert.equal(score.lines.find(l => l.id === 'accuracy')!.points, 300 - ERROR_PENALTY);
  assert.ok(score.total < 1000);
  assert.equal(session.errors.length, 1);
});

test('олимпиада: недоступная команда считается ошибкой, пауза и подсказки запрещены', () => {
  const stage = OLYMPIADS[0].stages[0];
  const session = new MissionSession(new FactoryCore(compileLevel(stage.build())), 'olympiad', { timeLimitSec: stage.timeLimitSec });
  session.command('start');
  assert.equal(session.command('process'), false);
  assert.equal(session.errors.length, 1);
  session.setPaused(true);
  assert.equal(session.paused, false);
  session.useHint();
  assert.equal(session.hints, 0);
  assert.equal(session.coaching, false);
});

test('олимпиада: по истечении времени работа сдаётся с частичным результатом', () => {
  const stage = OLYMPIADS[0].stages[0];
  const session = new MissionSession(new FactoryCore(compileLevel(stage.build())), 'olympiad', { timeLimitSec: 1 });
  session.command('start');
  session.click(session.core.resources.blank.id);
  session.command('install');
  session.click(session.core.resources.machine.id);
  session.tick(1200);
  assert.equal(session.ended, 'timeout');
  const score = computeScore({ ...session.summary(), timeSec: session.timeSec });
  assert.equal(score.criteria.find(c => c.id === 'install')!.ok, true);
  assert.equal(score.criteria.find(c => c.id === 'store')!.ok, false);
  assert.equal(score.lines.find(l => l.id === 'time')!.points, 0);
  assert.equal(score.stars, 0);
});

test('оценка не зависит от уровня и XP игрока', () => {
  const session = playThrough(new MissionSession(new FactoryCore(compileLevel(MISSIONS[0].build!())), 'olympiad', { timeLimitSec: 300 }));
  const summary = { ...session.summary(), timeSec: 30 };
  const novice = applyStageAttempt(defaultProfile(), 'x/y', 'Этап', summary, computeScore(summary), 1);
  const veteran = applyStageAttempt({ ...defaultProfile(), xp: 5000 }, 'x/y', 'Этап', summary, computeScore(summary), 1);
  assert.equal(novice.profile.stages['x/y'].score, veteran.profile.stages['x/y'].score);
});

test('обучение снижает самостоятельность, подсказки по запросу стоят баллов', () => {
  const base = { mode: 'training' as const, completed: true, installed: true, stored: true, opsDone: 1, opsTotal: 1, errors: 0, hints: 0, coaching: true, timeSec: 20, parSec: 33 };
  assert.equal(computeScore(base).lines.find(l => l.id === 'independence')!.points, 40);
  assert.equal(computeScore({ ...base, coaching: false, hints: 2 }).lines.find(l => l.id === 'independence')!.points, 40);
  assert.equal(computeScore({ ...base, coaching: false }).total, 1000);
  assert.equal(parSeconds([{ diameter: 1, length: 1, seconds: 3 }]), 33);
});

test('прогресс: зоны, XP, уровни, достижения и повторные прохождения', () => {
  let profile = defaultProfile();
  assert.equal(missionStatus(profile, MISSIONS[0]), 'available');
  assert.equal(missionStatus(profile, MISSIONS[1]), 'locked');
  assert.match(lockReason(profile, MISSIONS[1]), /Точность решает/);
  profile = markStarted(profile, MISSIONS[0].id);
  assert.equal(missionStatus(profile, MISSIONS[0]), 'in-progress');
  const clear = (id: string, timeSec = 20, coaching = false) => {
    const mission = MISSIONS.find(m => m.id === id)!;
    const session = playThrough(new MissionSession(new FactoryCore(compileLevel(mission.build!())), 'training', { coaching }));
    const summary = { ...session.summary(), timeSec };
    return applyMissionAttempt(profile, id, summary, computeScore(summary), summary.opsTotal);
  };
  let result = clear('precision');
  profile = result.profile;
  assert.equal(missionStatus(profile, MISSIONS[0]), 'max');
  assert.ok(result.firstClear && result.xpGained >= 100);
  assert.ok(result.newAchievements.some(a => a.id === 'first-chip'));
  assert.ok(result.newAchievements.some(a => a.id === 'top-grade'));
  const xpAfterFirst = profile.xp;
  result = clear('precision', 20);
  assert.equal(result.xpGained, 0, 'повтор без улучшения не даёт XP');
  assert.equal(result.profile.xp, xpAfterFirst);
  profile = result.profile;
  assert.equal(missionStatus(profile, MISSIONS[1]), 'available');
  profile = clear('thin-neck').profile;
  profile = clear('two-sections').profile;
  const gate = MISSIONS.find(m => m.id === 'stepped-shaft')!;
  assert.ok(levelFromXp(profile.xp) >= 3, `уровень после трёх миссий: ${levelFromXp(profile.xp)}`);
  assert.equal(missionStatus(profile, gate), 'available', 'токарный участок открывается после «Двух участков» и 3 уровня');
  assert.ok(profile.achievements['multi-stage']);
  assert.ok(profile.achievements['shop-master']);
  const progress = xpProgress(profile.xp);
  assert.ok(progress.fraction >= 0 && progress.fraction < 1);
  assert.ok(rankFor(levelFromXp(profile.xp)).title.length > 0);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length);
});

test('профиль сохраняется и безопасно загружается из повреждённых данных', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  const profile = { ...defaultProfile(), name: 'Аня', xp: 130 };
  saveProfile(storage, profile);
  assert.equal(loadProfile(storage).name, 'Аня');
  store.set('factory-profile-v1', '{broken');
  assert.equal(loadProfile(storage).xp, 0);
  store.set('factory-profile-v1', JSON.stringify({ version: 1, xp: 'много', records: 7, settings: { motion: 'wild' } }));
  const loaded = loadProfile(storage);
  assert.equal(loaded.xp, 0);
  assert.deepEqual(loaded.records, {});
  assert.equal(loaded.settings.motion, 'system');
});
