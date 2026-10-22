import { evaluateExercise, type Exercise, type ExerciseAnswer, type Evaluation } from './exercises';
import type { AttemptSummary } from './scoring';
import type { ErrorRecord, ProtocolEntry } from './session';

export interface AttemptReport {
  ended: 'completed' | 'timeout' | 'abandoned' | null;
  opsTotal: number;
  summary(): AttemptSummary;
  protocol: readonly ProtocolEntry[];
  errors: readonly ErrorRecord[];
}

/** Owns attempt state and rechecks every submission; UI receives copies of results. */
export class ExerciseSession implements AttemptReport {
  private elapsed = 0;
  private finished = false;
  private started = false;
  private hintCount = 0;
  private mistakes: ErrorRecord[] = [];
  private journal: ProtocolEntry[] = [];
  private result: Evaluation;
  private readonly exercise: Exercise;
  constructor(exercise: Exercise, private readonly parSec: number) {
    this.exercise = structuredClone(exercise);
    this.result = evaluateExercise(this.exercise, {});
  }
  get ended() { return this.finished ? 'completed' as const : null; }
  get opsTotal() { return 0; }
  get errors() { return structuredClone(this.mistakes); }
  get protocol() { return structuredClone(this.journal); }
  start() {
    if (this.started || this.finished) return false;
    this.started = true;
    this.journal.push({ atSec: 0, kind: 'action', text: 'Задание принято' });
    return true;
  }
  tick(seconds: number) { if (this.started && !this.finished && Number.isFinite(seconds) && seconds > 0) this.elapsed += seconds; }
  hint() {
    if (!this.started || this.finished) return false;
    this.hintCount++;
    this.journal.push({ atSec: this.elapsed, kind: 'hint', text: 'Открыта памятка задания' });
    return true;
  }
  submit(answer: ExerciseAnswer): Evaluation | null {
    if (!this.started || this.finished) return null;
    this.result = evaluateExercise(this.exercise, structuredClone(answer));
    const wrong = this.result.checks.filter(c => !c.ok);
    if (wrong.length) {
      const text = wrong.map(c => c.label).join('; '), fix = wrong.map(c => c.detail).join(' ');
      this.mistakes.push({ atSec: this.elapsed, code: 'invalid-command', text, fix });
      this.journal.push({ atSec: this.elapsed, kind: 'error', text: `${text}. ${fix}` });
    } else {
      this.finished = true;
      this.journal.push({ atSec: this.elapsed, kind: 'result', text: 'Все условия задания выполнены' });
    }
    this.journal.push(...this.result.trace.map(text => ({ atSec: this.elapsed, kind: 'action' as const, text })));
    return structuredClone(this.result);
  }
  summary(): AttemptSummary {
    const n = this.result.checks.length;
    return { mode: 'training', completed: this.finished, installed: false, stored: false,
      opsDone: 0, opsTotal: 0, errors: this.mistakes.length, hints: this.hintCount, coaching: false,
      timeSec: this.elapsed, parSec: this.parSec,
      criteria: this.result.checks.map((c, i) => {
        const max = Math.floor(500 / n) + (i < 500 % n ? 1 : 0);
        return { id: c.id, label: c.label, ok: this.finished && c.ok, points: this.finished && c.ok ? max : 0, max };
      }) };
  }
}
