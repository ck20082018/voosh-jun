import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS, MISSIONS, ZONES } from '../src/platform/missions';
import { EXERCISE_MISSIONS } from '../src/platform/exerciseMissions';
import { evaluateExercise, runProgram, schedule, type Exercise, type ExerciseAnswer } from '../src/platform/exercises';
import { ExerciseSession } from '../src/platform/exerciseSession';
import { computeScore } from '../src/platform/scoring';
import { applyMissionAttempt, defaultProfile, isPassed, loadProfile, lockReason, missionStatus, saveProfile } from '../src/platform/progress';

function permutations<T>(items: T[]): T[][] { return items.length ? items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest])) : [[]]; }
export function solution(e: Exercise): ExerciseAnswer {
  if (e.kind === 'assembly') {
    for (const a of e.gears) for (const b of e.gears) {
      const answer = { first: String(a), second: String(b) };
      if (evaluateExercise(e, answer).checks.every(c => c.ok)) return answer;
    }
    throw new Error('No valid gear pair');
  }
  if (e.kind === 'measurement') {
    const value = e.whole + e.tick / 10;
    return { reading: String(value), verdict: value >= e.min && value <= e.max ? 'fit' : 'reject' };
  }
  if (e.kind === 'automation') return { program: ['part?', 'guard?', 'clamp', 'run', 'release', 'eject'] };
  if (e.kind === 'tool') return { first: e.machine, second: e.tool };
  if (e.kind === 'route') return { order: e.steps.map(s => s.id), stations: Object.fromEntries(e.steps.map(s => [s.id, s.station])) };
  const order = permutations(e.jobs.map(j => j.id)).find(order => schedule(e, order)!.at(-1)!.endSecond <= e.limit);
  assert.ok(order, `Unreachable schedule limit ${e.limit}`);
  return { order };
}

test('all six tracks contain playable missions, every new exercise is solvable and builds independent sessions', () => {
  assert.equal(MISSIONS.length, 36);
  assert.equal(MISSIONS.filter(m => m.training).length, 15);
  assert.equal(MISSIONS.filter(m => m.exercise).length, EXERCISE_MISSIONS.length);
  for (const d of DIRECTIONS) assert.ok(MISSIONS.some(m => m.direction === d.id));
  for (const m of EXERCISE_MISSIONS) {
    const answer = solution(m.exercise);
    assert.ok(evaluateExercise(m.exercise, answer).checks.every(c => c.ok), m.id);
    const session = new ExerciseSession(m.exercise, m.minutes * 60);
    assert.equal(session.submit(answer), null, 'cannot bypass start');
    assert.ok(session.start());
    assert.equal(session.start(), false);
    session.tick(10);
    assert.ok(session.submit(answer)!.checks.every(c => c.ok), m.id);
    assert.equal(session.ended, 'completed');
    const score = computeScore(session.summary());
    assert.equal(score.total, 1000, m.id);
    assert.equal(score.criteria.reduce((sum, c) => sum + c.max, 0), 500);
    assert.ok(!score.criteria.some(c => /Заготовка закреплена|Диаметры участков/.test(c.label)));
    assert.equal(session.submit({}), null, 'cannot submit twice');
    session.tick(90);
    assert.equal(session.summary().timeSec, 10);
    const fresh = new ExerciseSession(m.exercise, 180);
    assert.equal(fresh.ended, null);
  }
});

test('wrong submissions stay open; correction preserves error penalty, hint penalty and immutable reports', () => {
  for (const m of EXERCISE_MISSIONS) {
    const s = new ExerciseSession(m.exercise, 180);
    assert.equal(s.hint(), false);
    s.start(); s.tick(NaN); s.tick(-4); s.tick(10);
    const wrong = s.submit({})!;
    assert.ok(wrong.checks.some(c => !c.ok));
    assert.equal(s.ended, null);
    assert.equal(s.errors.length, 1);
    wrong.checks.forEach(c => { c.ok = true; });
    s.errors.length = 0;
    assert.equal(s.errors.length, 1);
    s.hint();
    s.submit(solution(m.exercise));
    const score = computeScore(s.summary());
    assert.equal(score.total, 910, m.id);
    assert.equal(s.hint(), false);
  }
});

test('gears require BOTH matching centre distance and ratio; non-catalog gears rejected', () => {
  const e = EXERCISE_MISSIONS.find(m => m.id === 'plan-assembly')!.exercise;
  assert.ok(e.kind === 'assembly');
  for (const answer of [{ first: '20', second: '20' }, { first: '10', second: '20' }, { first: '-20', second: '-40' }, { first: 'NaN', second: '40' }])
    assert.ok(evaluateExercise(e, answer).checks.some(c => !c.ok));
});

test('routes reject missing, duplicated and reversed steps and incorrect station assignments', () => {
  const e = EXERCISE_MISSIONS.find(m => m.id === 'route-clean')!.exercise;
  assert.ok(e.kind === 'route');
  const answer = solution(e);
  for (const patch of [{ order: answer.order!.slice(1) }, { order: answer.order!.map(() => answer.order![0]) }, { order: [...answer.order!].reverse() }, { stations: {} }])
    assert.ok(evaluateExercise(e, { ...answer, ...patch }).checks.some(c => !c.ok));
});

test('measurement accepts comma and exact boundary, rejects empty, rounded and nonfinite values', () => {
  const e: Exercise = { kind: 'measurement', whole: 8, tick: 5, min: 8, max: 8.5 };
  assert.ok(evaluateExercise(e, { reading: '8,5', verdict: 'fit' }).checks.every(c => c.ok));
  for (const reading of ['', ' ', '8', '8.4', 'Infinity', 'abc']) assert.equal(evaluateExercise(e, { reading, verdict: 'fit' }).checks[0].ok, false);
  assert.equal(evaluateExercise(e, { reading: '8.5', verdict: 'reject' }).checks[1].ok, false);
});

test('automaton simulates missing stock, open guard and premature actions with no false success', () => {
  const e = EXERCISE_MISSIONS.find(m => m.id === 'automation-guard')!.exercise;
  for (const program of [[], ['eject'], ['run', 'clamp', 'release', 'eject'], ['clamp', 'run', 'release', 'eject'], ['part?', 'guard?']])
    assert.ok(evaluateExercise(e, { program: program as import('../src/platform/exercises').Instruction[] }).checks.some(c => !c.ok));
  assert.equal(runProgram(['part?', 'guard?', 'clamp', 'run', 'release', 'eject', 'eject'], { part: true, guard: true }).ok, false);
  assert.ok(evaluateExercise(e, { program: ['guard?', 'part?', 'clamp', 'run', 'release', 'eject'] }).checks.every(c => c.ok), 'equivalent safe order accepted');
});

test('scheduling enforces unique complete queue and machine availability; accepts all feasible alternatives', () => {
  for (const m of EXERCISE_MISSIONS) {
    const e = m.exercise; if (e.kind !== 'schedule') continue;
    assert.equal(schedule(e, []), null);
    assert.equal(schedule(e, e.jobs.map(() => e.jobs[0].id)), null);
    assert.ok(permutations(e.jobs.map(j => j.id)).some(order => schedule(e, order)!.at(-1)!.endSecond > e.limit), "task must require choosing a queue");
    for (const order of permutations(e.jobs.map(j => j.id))) {
      const rows: import('../src/platform/exercises').ScheduleRow[] = schedule(e, order)!;
      rows.forEach((r, i) => {
        assert.ok(r.startSecond >= r.endFirst);
        if (i) { assert.ok(r.startFirst >= rows[i - 1].endFirst); assert.ok(r.startSecond >= rows[i - 1].endSecond); }
      });
      assert.equal(evaluateExercise(e, { order }).checks.every(c => c.ok), rows.at(-1)!.endSecond <= e.limit);
    }
  }
});

test('new mission chains unlock without cycles, save results and do not award manufacturing achievements', () => {
  let p = defaultProfile();
  const pending = [...MISSIONS];
  const seen = new Set<string>();
  while (pending.length) {
    const i = pending.findIndex(m => !lockReason(p, m));
    assert.ok(i >= 0, `Unreachable missions: ${pending.map(m => m.id)}`);
    const [m] = pending.splice(i, 1);
    assert.ok(!seen.has(m.id)); seen.add(m.id);
    assert.ok(ZONES.some(z => z.id === m.zone));
    if (m.exercise) {
      const s = new ExerciseSession(m.exercise, 180); s.start(); s.tick(10); s.submit(solution(m.exercise));
      const summary = s.summary(), score = computeScore(summary);
      const result = applyMissionAttempt(p, m.id, summary, score, s.opsTotal);
      p = result.profile;
      assert.ok(isPassed(p, m.id));
      assert.equal(missionStatus(p, m), 'max');
      assert.equal(applyMissionAttempt(p, m.id, summary, score, s.opsTotal).xpGained, 0);
    } else {
      // Existing production progression is exercised through real sessions in platform.test.ts.
      p = { ...p, xp: p.xp + 150, records: { ...p.records, [m.id]: { status: 'max', best: 1000, attempts: 1, bestTimeSec: 10, bestErrors: 0, lastPlayed: 0 } } };
    }
  }
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  saveProfile(storage, p);
  assert.deepEqual(loadProfile(storage).records, p.records);
  const m = EXERCISE_MISSIONS.find(m => m.id === 'plan-assembly')!;
  const s = new ExerciseSession(m.exercise, 180); s.start(); s.submit(solution(m.exercise));
  const result = applyMissionAttempt(defaultProfile(), m.id, s.summary(), computeScore(s.summary()), s.opsTotal);
  assert.ok(!result.newAchievements.some(a => ['first-chip', 'multi-stage'].includes(a.id)));
});
