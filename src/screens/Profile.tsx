import { useState } from 'react';
import { MISSIONS } from '../platform/missions';
import { ACHIEVEMENTS, isPassed, levelFromXp, nextRank, rankFor, RANKS, xpProgress, type Profile } from '../platform/progress';
import { formatTime } from '../platform/result';
import type { MotionSetting } from '../ui/motion';
import { Icon } from '../ui/Icon';
import { Button, Chip, Dialog, Ring, Segmented } from '../ui/primitives';
import { PageHeader } from './shared';

export function ProfileScreen({ profile, onName, onMotion, onReset }: { profile: Profile; onName: (name: string) => void; onMotion: (m: MotionSetting) => void; onReset: () => void }) {
  const [name, setName] = useState(profile.name);
  const [confirm, setConfirm] = useState(false);
  const level = levelFromXp(profile.xp), prog = xpProgress(profile.xp);
  const rank = rankFor(level), upcoming = nextRank(level);
  const records = Object.values(profile.records);
  const best = records.reduce((m, r) => Math.max(m, r.best), 0);
  const attempts = records.reduce((s, r) => s + r.attempts, 0);
  const passed = MISSIONS.filter(m => isPassed(profile, m.id)).length;
  const earnedCount = ACHIEVEMENTS.filter(a => profile.achievements[a.id]).length;
  const commit = () => { const clean = name.trim().slice(0, 40); if (clean && clean !== profile.name) onName(clean); else setName(profile.name); };

  return (
    <main className="page profile-page">
      <PageHeader eyebrow="Инженерная книжка" title="Профиль" />
      <div className="profile-grid">
        <section className="surface block profile-card" aria-label="Игрок">
          <Ring value={prog.fraction} size={104} stroke={8} tone="amber" label="Прогресс до следующего уровня"><span className="level-card__num"><b>{level}</b><small>уровень</small></span></Ring>
          <div className="profile-card__body">
            <form className="field" onSubmit={e => { e.preventDefault(); commit(); (document.activeElement as HTMLElement | null)?.blur(); }}>
              <label htmlFor="player-name">Имя в списках</label>
              <input id="player-name" className="input" value={name} maxLength={40} onChange={e => setName(e.target.value)} onBlur={commit} />
            </form>
            <p className="t-h3">{rank.title}</p>
            <p className="t-small t-dim num">{profile.xp} XP · до уровня {level + 1} осталось {prog.span - prog.into}</p>
            <ol className="ranks" aria-label="Звания">
              {RANKS.map(r => <li key={r.title} data-on={level >= r.from} aria-current={r.title === rank.title ? 'true' : undefined}><b>{r.title}</b><small>с уровня {r.from}</small></li>)}
            </ol>
            {upcoming && <p className="t-small t-faint">Следующее звание: «{upcoming.title}».</p>}
          </div>
        </section>

        <section className="surface block stats" aria-label="Статистика">
          <h2 className="sheet-h">Статистика</h2>
          <dl>
            <div><dt>Пройдено заданий</dt><dd className="num">{passed} из {MISSIONS.length}</dd></div>
            <div><dt>Попыток всего</dt><dd className="num">{attempts}</dd></div>
            <div><dt>Лучший результат</dt><dd className="num">{best || '—'}</dd></div>
            <div><dt>Достижений</dt><dd className="num">{earnedCount} из {ACHIEVEMENTS.length}</dd></div>
          </dl>
        </section>

        <section className="surface block ach" aria-label="Достижения">
          <h2 className="sheet-h">Достижения</h2>
          <ul>
            {ACHIEVEMENTS.map(a => {
              const at = profile.achievements[a.id];
              return (
                <li key={a.id} data-on={!!at}>
                  <span aria-hidden="true"><Icon name={at ? a.icon : 'lock'} size={22} /></span>
                  <div><b>{a.title}</b><small>{a.description}</small>{at && <small className="t-faint">{new Date(at).toLocaleDateString('ru-RU')}</small>}</div>
                  <span className="sr-only">{at ? 'получено' : 'не получено'}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="surface block hist" aria-label="История">
          <h2 className="sheet-h">История</h2>
          {profile.history.length === 0 ? <p className="t-small t-dim">Здесь появятся сданные задания и полученные достижения.</p> : (
            <ol>
              {profile.history.slice(0, 12).map((h, i) => (
                <li key={i}><Icon name={h.kind === 'achievement' ? 'medal' : h.kind === 'olympiad' ? 'trophy' : 'lathe'} size={18} /><div><b>{h.title}</b><small>{h.detail}</small></div><time className="t-faint num" dateTime={new Date(h.t).toISOString()}>{new Date(h.t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></li>
              ))}
            </ol>
          )}
          {Object.values(profile.records).some(r => r.bestTimeSec !== null) && <p className="t-small t-faint">Лучшее время по заданиям: {Object.entries(profile.records).filter(([, r]) => r.bestTimeSec !== null).map(([id, r]) => `${MISSIONS.find(m => m.id === id)?.title ?? id} ${formatTime(r.bestTimeSec!)}`).join(' · ')}</p>}
        </section>

        <section className="surface block settings-block" aria-label="Настройки">
          <h2 className="sheet-h">Настройки</h2>
          <div className="field"><span>Анимации</span><Segmented label="Анимации" value={profile.settings.motion} onChange={onMotion} options={[{ value: 'system', label: 'Как в системе' }, { value: 'reduce', label: 'Меньше' }, { value: 'full', label: 'Обычные' }]} /></div>
          <p className="t-small t-faint">«Меньше» отключает покачивание, искры и счётчики. Сцена и подсказки остаются прежними.</p>
          <hr />
          <Chip tone="amber" icon="info">Только этот браузер</Chip>
          <p className="t-small t-faint">Прогресс хранится в localStorage. Аккаунтов и синхронизации между устройствами в прототипе нет.</p>
          <Button variant="danger" icon="trash" onClick={() => setConfirm(true)}>Сбросить прогресс</Button>
        </section>
      </div>
      {confirm && (
        <Dialog title="Сбросить прогресс?" onClose={() => setConfirm(false)}>
          <p className="t-dim">Будут удалены результаты заданий, олимпиадные попытки, XP и достижения. Уровни в редакторе не затрагиваются.</p>
          <div className="dialog__actions"><Button variant="ghost" data-autofocus onClick={() => setConfirm(false)}>Отмена</Button><Button variant="danger" onClick={() => { setConfirm(false); onReset(); }}>Сбросить</Button></div>
        </Dialog>
      )}
    </main>
  );
}
