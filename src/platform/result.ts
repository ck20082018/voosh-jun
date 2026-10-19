import type { AchievementDef } from './progress';
import type { ErrorRecord, ProtocolEntry } from './session';
import type { AttemptSummary, Score } from './scoring';

/** Всё, что нужно экрану результата. Заполняется платформой после сохранения прогресса. */
export interface ResultData {
  kind: 'mission' | 'stage' | 'test';
  title: string;
  ended: 'completed' | 'timeout' | 'abandoned';
  score: Score;
  summary: AttemptSummary;
  xpGained: number;
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  newAchievements: AchievementDef[];
  previousBest: number;
  improved: boolean;
  protocol: ProtocolEntry[];
  errors: ErrorRecord[];
  next?: { id: string; title: string } | null;
  nextLabel?: string;
}

export const formatTime = (sec: number) => {
  const total = Math.max(0, Math.round(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
