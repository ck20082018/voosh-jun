import { useEffect, useState } from 'react';
import type { ResultData } from '../platform/result';
import { formatTime } from '../platform/result';
import { rankFor, xpProgress } from '../platform/progress';
import { isReducedMotion } from '../ui/motion';
import { Icon } from '../ui/Icon';
import { Button, Chip, Meter } from '../ui/primitives';

function useCountUp(target: number, ms = 1100) {
  const [value, setValue] = useState(() => (isReducedMotion() ? target : 0));
  useEffect(() => {
    if (isReducedMotion()) { setValue(target); return; }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

export interface ResultScreenProps {
  result: ResultData;
  olympiad?: boolean;
  onRetry?: () => void;
  onNext?: () => void;
  onBack: () => void;
  backLabel: string;
}

export function ResultScreen({ result, olympiad = false, onRetry, onNext, onBack, backLabel }: ResultScreenProps) {
  const { score, summary } = result;
  const shown = useCountUp(score.total);
  const stamp = result.ended === 'timeout' ? { text: 'Время вышло', tone: 'amber' } : !summary.completed ? { text: 'Не завершено', tone: 'red' } : score.stars === 3 ? { text: 'Максимальная оценка', tone: 'green' } : { text: 'Принято', tone: 'teal' };
  const xpNow = xpProgress(result.xpAfter), xpWas = xpProgress(result.xpBefore);
  const leveledUp = result.levelAfter > result.levelBefore;
  const rankUp = rankFor(result.levelAfter).title !== rankFor(result.levelBefore).title;
  const [xpFill, setXpFill] = useState(isReducedMotion() ? 1 : 0);
  useEffect(() => { const id = window.setTimeout(() => setXpFill(1), 650); return () => window.clearTimeout(id); }, []);
  const barFraction = leveledUp ? (xpFill ? xpNow.fraction : 1) : xpWas.fraction + (xpNow.fraction - xpWas.fraction) * xpFill;

  return (
    <main className="result" data-tone={stamp.tone}>
      <div className="result__grid">
        <section className="result__hero surface" aria-labelledby="result-title">
          <span className="eyebrow">{result.kind === 'stage' ? 'Результат этапа' : 'Результат миссии'}</span>
          <h1 id="result-title" className="t-h2">{result.title}</h1>
          <div className={`stamp stamp--${stamp.tone}`} role="img" aria-label={`Статус: ${stamp.text}`}><span>{stamp.text}</span></div>
          <div className="score" aria-live="polite">
            <b className="num" aria-hidden="true">{shown}</b><span>из {score.max}</span>
            <span className="sr-only">{score.total} из {score.max} баллов</span>
          </div>
          <div className="stars" role="img" aria-label={`Оценка: ${score.stars} из 3`}>
            {[1, 2, 3].map(i => <Icon key={i} name="star" size={30} className={i <= score.stars ? 'is-on' : ''} />)}
          </div>
          <dl className="result__facts">
            <div><dt>Точность</dt><dd className="num">{Math.round(score.accuracy * 100)}%</dd></div>
            <div><dt>Ошибок</dt><dd className="num">{summary.errors}</dd></div>
            <div><dt>Время</dt><dd className="num">{formatTime(summary.timeSec)}<small> / норма {formatTime(summary.parSec)}</small></dd></div>
            {result.previousBest > 0 && !olympiad && <div><dt>Прошлый рекорд</dt><dd className="num">{result.previousBest}</dd></div>}
          </dl>
          {result.improved && result.previousBest > 0 && <Chip tone="green" icon="bolt">Новый рекорд</Chip>}
          {olympiad && <p className="t-small t-dim note"><Icon name="shield" size={16} /> Оценка посчитана по формуле из журнала попытки. Уровень и XP на неё не влияют.</p>}
        </section>

        <section className="result__col" aria-label="Подробности">
          <div className="surface block">
            <h2 className="sheet-h">Критерии</h2>
            <ul className="result__crit">
              {score.criteria.map((c, i) => (
                <li key={c.id} data-ok={c.ok} style={{ animationDelay: `${180 + i * 110}ms` }}>
                  <Icon name={c.ok ? 'checkCircle' : 'xCircle'} size={20} />
                  <span>{c.label}</span><b className="num">{c.points}<small> / {c.max}</small></b>
                </li>
              ))}
            </ul>
          </div>

          <div className="surface block">
            <h2 className="sheet-h">Как посчитаны баллы</h2>
            <ul className="lines">
              {score.lines.map(line => (
                <li key={line.id}>
                  <div><span>{line.label}</span><b className="num">{line.points}<small> / {line.max}</small></b></div>
                  <Meter value={line.points} max={line.max} tone={line.points === line.max ? 'green' : line.points === 0 ? 'red' : 'amber'} label={line.label} />
                  <small>{line.note}</small>
                </li>
              ))}
            </ul>
          </div>

          {result.errors.length > 0 && (
            <div className="surface block">
              <h2 className="sheet-h">Разбор ошибок</h2>
              <ol className="errs">
                {result.errors.map((e, i) => <li key={i}><span className="num">{formatTime(e.atSec)}</span><div><b>{e.text}</b><small>Как правильно: {e.fix}</small></div></li>)}
              </ol>
            </div>
          )}

          {result.kind !== 'test' && (
            <div className="surface block xp">
              <h2 className="sheet-h">Развитие</h2>
              <div className="xp__row">
                <span className="xp__level"><b>{result.levelAfter}</b><small>уровень</small></span>
                <div className="xp__bar">
                  <div className="xp__head"><span>{rankFor(result.levelAfter).title}</span><span className="num">{result.xpGained > 0 ? `+${result.xpGained} XP` : 'XP не начислен'}</span></div>
                  <div className="meter meter--amber" role="progressbar" aria-label="Опыт до следующего уровня" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(barFraction * 100)}><i style={{ width: `${Math.round(barFraction * 100)}%`, transitionDuration: '900ms' }} /></div>
                  <small className="t-faint num">{xpNow.into} / {xpNow.span} до уровня {xpNow.level + 1}</small>
                </div>
              </div>
              {leveledUp && <p className="levelup"><Icon name="bolt" size={18} /> Новый уровень: {result.levelAfter}.{rankUp && ` Новое звание: ${rankFor(result.levelAfter).title}.`}</p>}
              {result.xpGained === 0 && summary.completed && <p className="t-small t-faint">Повторное прохождение даёт XP только за улучшение результата.</p>}
              {result.newAchievements.length > 0 && (
                <ul className="awards">
                  {result.newAchievements.map(a => <li key={a.id}><span aria-hidden="true"><Icon name={a.icon} size={22} /></span><div><b>{a.title}</b><small>{a.description}</small></div><Chip tone="amber">+25 XP</Chip></li>)}
                </ul>
              )}
            </div>
          )}

          <details className="surface block protocol">
            <summary>Протокол действий <small>{result.protocol.length} записей</small></summary>
            <ol>{result.protocol.map((p, i) => <li key={i} data-kind={p.kind}><span className="num">{formatTime(p.atSec)}</span>{p.text}</li>)}</ol>
          </details>
        </section>
      </div>

      <footer className="result__actions">
        {onNext && result.next && <Button variant="primary" size="lg" iconRight="next" onClick={onNext}>{result.nextLabel ?? 'Дальше'}: {result.next.title}</Button>}
        {onRetry && !olympiad && <Button variant="ghost" size="lg" icon="refresh" onClick={onRetry}>{summary.completed ? 'Улучшить результат' : 'Попробовать снова'}</Button>}
        <Button variant={onNext && result.next ? 'ghost' : 'primary'} size="lg" icon="map" onClick={onBack}>{backLabel}</Button>
      </footer>
    </main>
  );
}
