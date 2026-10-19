import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { OLYMPIADS, stageKey } from '../src/platform/olympiads';
import { defaultProfile, markStageStarted, applyStageAttempt, applyMissionAttempt, loadProfile, saveProfile } from '../src/platform/progress';
import { computeScore } from '../src/platform/scoring';
import { MissionSession } from '../src/platform/session';
import { FactoryCore } from '../src/core';
import { compileLevel } from '../src/compiler';
import { MISSIONS } from '../src/platform/missions';
import { stageState, Olympiads } from '../src/screens/Olympiads';
import { Hub } from '../src/screens/Hub';
import { MissionMap } from '../src/screens/MissionMap';
import { ProfileScreen } from '../src/screens/Profile';

const olympiad = OLYMPIADS.find(o => o.id === 'young-technologist')!;
const [qualifying, final] = olympiad.stages;

function finished(level: ReturnType<typeof qualifying.build>, mode: 'training' | 'olympiad' = 'olympiad') {
  const session = new MissionSession(new FactoryCore(compileLevel(level)), mode, mode === 'olympiad' ? { timeLimitSec: 600 } : { coaching: false });
  const r = session.core.resources;
  session.command('start');
  session.click(r.blank.id);
  session.command('install');
  session.click(r.machine.id);
  for (let index = 0; index < r.operations.length; index++) {
    session.click(r.machine.id);
    session.command('process');
    session.tick(r.operations[index].seconds * 1000 + 50);
  }
  session.click(r.blank.id);
  session.command('store');
  session.click(r.warehouse.id);
  return session;
}

test('этапы олимпиады: финал закрыт, пока не завершена квалификация', () => {
  const profile = defaultProfile();
  assert.deepEqual(stageState(profile, olympiad, 0), { kind: 'ready' });
  assert.equal(stageState(profile, olympiad, 1).kind, 'locked');
});

test('этапы олимпиады: попытка тратится при старте, повторный старт её не сбрасывает', () => {
  const key = stageKey(olympiad.id, qualifying.id);
  const started = markStageStarted(defaultProfile(), key, 1000);
  assert.equal(stageState(started, olympiad, 0).kind, 'interrupted');
  assert.equal(stageState(started, olympiad, 1).kind, 'ready', 'попытка потрачена, поэтому следующий этап не блокируется');
  const again = markStageStarted(started, key, 5000);
  assert.equal(again.stages[key].at, 1000);
  assert.equal(started.stages[key].pending, true);
});

test('этапы олимпиады: сдача снимает отметку «прервано» и открывает следующий этап', () => {
  const key = stageKey(olympiad.id, qualifying.id);
  let profile = markStageStarted(defaultProfile(), key, 1000);
  const session = finished(qualifying.build());
  const summary = { ...session.summary(), timeSec: 60 };
  const score = computeScore(summary);
  const result = applyStageAttempt(profile, key, qualifying.title, summary, score, 1, 2000);
  profile = result.profile;
  assert.equal(profile.stages[key].pending, undefined);
  assert.equal(stageState(profile, olympiad, 0).kind, 'done');
  assert.equal(stageState(profile, olympiad, 1).kind, 'ready');
  assert.ok(final);
});

test('экраны платформы отрисовываются без браузера и без Phaser', () => {
  const empty = defaultProfile();
  let seeded = empty;
  const mission = MISSIONS[0];
  const session = finished(mission.build(), 'training');
  const summary = { ...session.summary(), timeSec: 20 };
  seeded = applyMissionAttempt(seeded, mission.id, summary, computeScore(summary), summary.opsTotal).profile;
  for (const profile of [empty, seeded]) {
    const noop = () => undefined;
    for (const element of [
      createElement(Hub, { profile }),
      createElement(MissionMap, { profile }),
      createElement(Olympiads, { profile }),
      createElement(ProfileScreen, { profile, onName: noop, onMotion: noop, onReset: noop }),
    ]) {
      const html = renderToString(element);
      assert.ok(html.length > 500);
      assert.ok(!/undefined|NaN|\[object/.test(html), 'в разметке не должно быть служебных значений');
    }
  }
  const map = renderToString(createElement(MissionMap, { profile: seeded }));
  assert.match(map, /Механическая обработка/);
  assert.match(map, /Запланировано/);
});

test('профиль: сохранение и загрузка сохраняют отметку прерванного этапа', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const key = stageKey(olympiad.id, qualifying.id);
  saveProfile(storage, markStageStarted(defaultProfile(), key, 10));
  assert.equal(loadProfile(storage).stages[key].pending, true);
});
