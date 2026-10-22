import type { IconName } from '../ui/Icon';
import type { MotionSetting } from '../ui/motion';
import { MISSIONS, ZONES, zoneById, type MissionSpec, type Zone } from './missions';
import { MAX_GRADE_SCORE, type AttemptSummary, type Score } from './scoring';

export const PROFILE_KEY = 'factory-profile-v1';
export type MissionStatus = 'locked' | 'available' | 'in-progress' | 'passed' | 'max';

export interface MissionRecord {
  status: 'in-progress' | 'passed' | 'max';
  best: number;
  attempts: number;
  bestTimeSec: number | null;
  bestErrors: number | null;
  lastPlayed: number;
}
/** pending: этап начат, но не завершён (например, страницу закрыли). Попытка при этом уже использована. */
export interface StageRecord { score: number; timeSec: number; errors: number; completed: boolean; at: number; pending?: boolean }
export interface HistoryEntry { t: number; kind: 'mission' | 'achievement' | 'olympiad'; title: string; detail: string }
export interface Profile {
  version: 1;
  name: string;
  xp: number;
  records: Record<string, MissionRecord>;
  stages: Record<string, StageRecord>;
  achievements: Record<string, number>;
  history: HistoryEntry[];
  settings: { motion: MotionSetting };
  lastMissionId: string | null;
}

export const defaultProfile = (): Profile => ({
  version: 1, name: 'Инженер', xp: 0, records: {}, stages: {}, achievements: {}, history: [], settings: { motion: 'system' }, lastMissionId: null,
});

/* ---------- уровни, ранги ---------- */
const XP_UNIT = 60;
export const levelFromXp = (xp: number) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / XP_UNIT));
export const xpForLevel = (level: number) => XP_UNIT * (level - 1) ** 2;
export function xpProgress(xp: number) {
  const level = levelFromXp(xp), from = xpForLevel(level), to = xpForLevel(level + 1);
  return { level, from, to, into: xp - from, span: to - from, fraction: (xp - from) / (to - from) };
}
export const RANKS = [
  { from: 1, title: 'Стажёр' },
  { from: 3, title: 'Оператор станка' },
  { from: 5, title: 'Наладчик' },
  { from: 7, title: 'Технолог' },
  { from: 10, title: 'Инженер' },
];
export const rankFor = (level: number) => [...RANKS].reverse().find(rank => level >= rank.from)!;
export const nextRank = (level: number) => RANKS.find(rank => rank.from > level) ?? null;

/* ---------- доступность миссий ---------- */
export function zoneState(profile: Profile, zone: Zone): { unlocked: boolean; reason: string } {
  const level = levelFromXp(profile.xp);
  const missing = zone.requiresMissions.filter(id => !isPassed(profile, id));
  if (missing.length) {
    const names = missing.map(id => MISSIONS.find(m => m.id === id)?.title ?? id).map(name => `«${name}»`).join(', ');
    return { unlocked: false, reason: `Сначала пройдите ${names}` };
  }
  if (level < zone.minLevel) return { unlocked: false, reason: `Откроется на уровне ${zone.minLevel}` };
  return { unlocked: true, reason: '' };
}
export const isPassed = (profile: Profile, id: string) => {
  const status = profile.records[id]?.status;
  return status === 'passed' || status === 'max';
};
export function lockReason(profile: Profile, mission: MissionSpec): string {
  const zone = zoneState(profile, zoneById(mission.zone));
  if (!zone.unlocked) return `${zoneById(mission.zone).title}: ${zone.reason.charAt(0).toLowerCase()}${zone.reason.slice(1)}`;
  const missing = mission.requires.filter(id => !isPassed(profile, id));
  if (missing.length) return `Сначала пройдите «${MISSIONS.find(m => m.id === missing[0])?.title}»`;
  return '';
}
export function missionStatus(profile: Profile, mission: MissionSpec): MissionStatus {
  const record = profile.records[mission.id];
  if (record?.status === 'max') return 'max';
  if (record?.status === 'passed') return 'passed';
  if (lockReason(profile, mission)) return 'locked';
  return record?.status === 'in-progress' ? 'in-progress' : 'available';
}
export const STATUS_LABEL: Record<MissionStatus, string> = {
  locked: 'Заблокировано', available: 'Доступно', 'in-progress': 'В процессе', passed: 'Пройдено', max: 'Максимальная оценка',
};
export function recommended(profile: Profile): MissionSpec | null {
  const open = MISSIONS.filter(m => ['in-progress', 'available'].includes(missionStatus(profile, m)));
  return open.find(m => missionStatus(profile, m) === 'in-progress') ?? open[0] ?? null;
}

/* ---------- достижения ---------- */
export interface AttemptContext { missionId: string; opsTotal: number; summary: AttemptSummary; score: Score; mode: 'training' | 'olympiad' }
export interface AchievementDef { id: string; title: string; description: string; icon: IconName; test: (profile: Profile, attempt: AttemptContext) => boolean }
const playable = MISSIONS.filter(m => m.direction === 'machining' && m.build);
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-chip', title: 'Первая стружка', description: 'Сдайте первую деталь на склад.', icon: 'lathe', test: (p, a) => a.summary.completed && a.summary.stored && a.mode === 'training' || MISSIONS.some(m => !!m.build && isPassed(p, m.id)) },
  { id: 'clean-work', title: 'Чистая работа', description: 'Выполните задание без единой ошибки.', icon: 'checkCircle', test: (_p, a) => a.summary.completed && a.summary.errors === 0 },
  { id: 'self-made', title: 'Сам себе мастер', description: 'Пройдите тренировку без обучения и подсказок.', icon: 'hand', test: (_p, a) => a.mode === 'training' && a.summary.completed && !a.summary.coaching && a.summary.hints === 0 },
  { id: 'on-schedule', title: 'В пределах нормы', description: 'Уложитесь во время нормы заказа.', icon: 'clock', test: (_p, a) => a.summary.completed && a.summary.timeSec <= a.summary.parSec },
  { id: 'top-grade', title: 'Высшая оценка', description: `Наберите ${MAX_GRADE_SCORE} баллов или больше.`, icon: 'medal', test: (_p, a) => a.score.stars === 3 },
  { id: 'multi-stage', title: 'Многоступенчатый', description: 'Сдайте деталь, обработанную в две операции или больше.', icon: 'layers', test: (_p, a) => a.summary.completed && a.opsTotal >= 2 },
  { id: 'shop-master', title: 'Мастер учебного цеха', description: 'Пройдите все задания учебного цеха.', icon: 'warehouse', test: p => MISSIONS.filter(m => m.zone === 'shop' && m.build).every(m => isPassed(p, m.id)) },
  { id: 'turner', title: 'Токарь', description: 'Пройдите все задания направления «Механическая обработка».', icon: 'gears', test: p => playable.every(m => isPassed(p, m.id)) },
  { id: 'olympian', title: 'Олимпиец', description: 'Сдайте этап олимпиады.', icon: 'trophy', test: (p, a) => a.mode === 'olympiad' && a.summary.completed || Object.values(p.stages).some(s => s.completed) },
  { id: 'steady-hand', title: 'Твёрдая рука', description: 'Три задания без ошибок.', icon: 'target', test: p => Object.values(p.records).filter(r => r.bestErrors === 0).length >= 3 },
];
export const ACHIEVEMENT_XP = 25;

/* ---------- применение результата ---------- */
export interface AttemptResult {
  profile: Profile;
  xpGained: number;
  firstClear: boolean;
  improved: boolean;
  newAchievements: AchievementDef[];
  previousBest: number;
  levelBefore: number;
  levelAfter: number;
}

const pushHistory = (profile: Profile, entry: HistoryEntry) => { profile.history = [entry, ...profile.history].slice(0, 40); };

export function markStarted(profile: Profile, missionId: string, now = Date.now()): Profile {
  const next = structuredClone(profile);
  const record = next.records[missionId];
  if (!record) next.records[missionId] = { status: 'in-progress', best: 0, attempts: 0, bestTimeSec: null, bestErrors: null, lastPlayed: now };
  else record.lastPlayed = now;
  next.lastMissionId = missionId;
  return next;
}

/** Чистая функция: возвращает новый профиль и сведения о начисленном. */
export function applyMissionAttempt(profile: Profile, missionId: string, summary: AttemptSummary, score: Score, opsTotal: number, now = Date.now()): AttemptResult {
  const next = structuredClone(profile);
  const levelBefore = levelFromXp(profile.xp);
  const previous = next.records[missionId];
  const previousBest = previous?.best ?? 0;
  const wasPassed = previous?.status === 'passed' || previous?.status === 'max';
  const record: MissionRecord = previous ?? { status: 'in-progress', best: 0, attempts: 0, bestTimeSec: null, bestErrors: null, lastPlayed: now };
  record.attempts += 1;
  record.lastPlayed = now;
  let xpGained = 0;
  const firstClear = summary.completed && !wasPassed;
  if (summary.completed) {
    if (score.total > record.best) record.best = score.total;
    record.bestTimeSec = record.bestTimeSec === null ? summary.timeSec : Math.min(record.bestTimeSec, summary.timeSec);
    record.bestErrors = record.bestErrors === null ? summary.errors : Math.min(record.bestErrors, summary.errors);
    record.status = record.best >= MAX_GRADE_SCORE ? 'max' : 'passed';
    xpGained = firstClear ? Math.round(score.total / 8) : Math.round(Math.max(0, score.total - previousBest) / 16);
  } else if (record.status === 'in-progress') {
    record.best = Math.max(record.best, 0);
  }
  next.records[missionId] = record;
  next.lastMissionId = missionId;
  next.xp += xpGained;
  const mission = MISSIONS.find(m => m.id === missionId);
  if (summary.completed) pushHistory(next, { t: now, kind: 'mission', title: `Миссия «${mission?.title ?? missionId}» выполнена`, detail: `${score.total} из ${score.max} баллов` });
  const newAchievements = grantAchievements(next, { missionId, opsTotal, summary, score, mode: 'training' }, now);
  next.xp += newAchievements.length * ACHIEVEMENT_XP;
  return { profile: next, xpGained: xpGained + newAchievements.length * ACHIEVEMENT_XP, firstClear, improved: summary.completed && score.total > previousBest, newAchievements, previousBest, levelBefore, levelAfter: levelFromXp(next.xp) };
}

/** Олимпиадная попытка тратится в момент начала: закрытие страницы не даёт второго шанса. */
export function markStageStarted(profile: Profile, key: string, now = Date.now()): Profile {
  const next = structuredClone(profile);
  if (!next.stages[key]) next.stages[key] = { score: 0, timeSec: 0, errors: 0, completed: false, at: now, pending: true };
  return next;
}

export function applyStageAttempt(profile: Profile, key: string, title: string, summary: AttemptSummary, score: Score, opsTotal: number, now = Date.now()): AttemptResult {
  const next = structuredClone(profile);
  const levelBefore = levelFromXp(profile.xp);
  const had = next.stages[key] && !next.stages[key].pending ? next.stages[key] : undefined;
  next.stages[key] = { score: score.total, timeSec: summary.timeSec, errors: summary.errors, completed: summary.completed, at: now };
  const xpGained = summary.completed ? Math.round(score.total / 16) : 0;
  next.xp += xpGained;
  pushHistory(next, { t: now, kind: 'olympiad', title: summary.completed ? `Этап «${title}» сдан` : `Этап «${title}» завершён по времени`, detail: `${score.total} из ${score.max} баллов` });
  const newAchievements = grantAchievements(next, { missionId: key, opsTotal, summary, score, mode: 'olympiad' }, now);
  next.xp += newAchievements.length * ACHIEVEMENT_XP;
  return { profile: next, xpGained: xpGained + newAchievements.length * ACHIEVEMENT_XP, firstClear: !had, improved: false, newAchievements, previousBest: had?.score ?? 0, levelBefore, levelAfter: levelFromXp(next.xp) };
}

function grantAchievements(profile: Profile, attempt: AttemptContext, now: number): AchievementDef[] {
  const earned: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (profile.achievements[def.id]) continue;
    if (def.test(profile, attempt)) {
      profile.achievements[def.id] = now;
      earned.push(def);
      pushHistory(profile, { t: now, kind: 'achievement', title: `Достижение «${def.title}»`, detail: def.description });
    }
  }
  return earned;
}

/* ---------- хранение ---------- */
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function loadProfile(storage: Storage): Profile {
  try {
    const raw = storage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || parsed.version !== 1) return defaultProfile();
    const base = defaultProfile();
    const settings = isObject(parsed.settings) && ['system', 'reduce', 'full'].includes(String(parsed.settings.motion)) ? { motion: parsed.settings.motion as MotionSetting } : base.settings;
    return {
      ...base,
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.slice(0, 40) : base.name,
      xp: typeof parsed.xp === 'number' && Number.isFinite(parsed.xp) ? Math.max(0, parsed.xp) : 0,
      records: isObject(parsed.records) ? (parsed.records as Profile['records']) : {},
      stages: isObject(parsed.stages) ? (parsed.stages as Profile['stages']) : {},
      achievements: isObject(parsed.achievements) ? (parsed.achievements as Profile['achievements']) : {},
      history: Array.isArray(parsed.history) ? (parsed.history as HistoryEntry[]).slice(0, 40) : [],
      settings,
      lastMissionId: typeof parsed.lastMissionId === 'string' ? parsed.lastMissionId : null,
    };
  } catch {
    return defaultProfile();
  }
}
export function saveProfile(storage: Storage, profile: Profile): void {
  try { storage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* хранилище недоступно: прогресс живёт до перезагрузки */ }
}

export { ZONES };
