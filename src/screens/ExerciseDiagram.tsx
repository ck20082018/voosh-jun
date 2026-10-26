import type { Exercise, ExerciseAnswer } from '../platform/exercises';

export function ExerciseDiagram({ exercise, answer = {} }: { exercise: Exercise; answer?: ExerciseAnswer }) {
  if (exercise.kind === 'measurement') {
    const origin = 90, pitch = 30, offset = exercise.tick * 3;
    return <figure className="exercise-diagram dwg">
      <svg viewBox="0 0 640 240" role="img" aria-label={`Штангенциркуль. Целых миллиметров слева от нуля нониуса: ${exercise.whole}. Совпавший штрих нониуса: ${exercise.tick}. Цена деления 0,1 мм.`}>
        <rect x="20" y="30" width="600" height="80" rx="4" fill="#c8d0d7" stroke="#273750" />
        {Array.from({ length: 17 }, (_, i) => <g key={i}><path d={`M${origin + (i - 2) * pitch} 105 v-${i % 5 === 2 ? 38 : 24}`} stroke="#273750" /><text x={origin + (i - 2) * pitch} y="58" textAnchor="middle" fontSize="13">{exercise.whole + i - 2}</text></g>)}
        <rect x={origin + offset - 18} y="112" width="315" height="90" rx="4" fill="#e4e8e9" stroke="#273750" />
        {Array.from({ length: 11 }, (_, i) => <g key={i}><path d={`M${origin + offset + i * pitch * .9} 115 v30`} stroke={i === exercise.tick ? '#b94c26' : '#273750'} strokeWidth={i === exercise.tick ? 3 : 1} /><text x={origin + offset + i * pitch * .9} y="172" textAnchor="middle" fontSize="13">{i}</text></g>)}
        <text x="35" y="225" fontSize="14">Нониус · 0,1 мм · красный штрих совпадает с основной шкалой</text>
      </svg><figcaption>Допуск: {exercise.min}–{exercise.max} мм, включая границы</figcaption>
    </figure>;
  }
  if (exercise.kind === 'assembly') {
    const a = Number(answer.first) || 20, b = Number(answer.second) || 40;
    const radius = (teeth: number) => teeth * 2;
    const gear = (teeth: number, x: number, color: string) => {
      const r = radius(teeth);
      const points = Array.from({ length: teeth * 4 }, (_, i) => {
        const theta = i / (teeth * 4) * Math.PI * 2, rr = r + (i % 4 < 2 ? 4 : -4);
        return `${x + rr * Math.cos(theta)},${125 + rr * Math.sin(theta)}`;
      }).join(' ');
      return <g><polygon points={points} fill={color} stroke="#24344b" strokeWidth="2" /><circle cx={x} cy="125" r="9" fill="#f4f1e7" stroke="#24344b" /><path d={`M${x - 15} 125 h30 M${x} 110 v30`} stroke="#24344b" /></g>;
    };
    const x1 = 240 - radius(a), x2 = 240 + radius(b);
    return <figure className="exercise-diagram dwg"><svg viewBox="0 0 640 280" role="img" aria-label="Схема двух шестерён на параллельных валах">
      {gear(a, x1, '#9cbdb5')}{gear(b, x2, '#d5b66f')}
      <text x={x1} y="245" textAnchor="middle">Вход · {exercise.inputRpm} об/мин</text><text x={x2} y="265" textAnchor="middle">Выход · {exercise.outputRpm} об/мин</text>
      <text x="320" y="25" textAnchor="middle">m = {exercise.module} мм · a = {exercise.distance} мм</text>
    </svg><figcaption>Выберите число зубьев для каждого вала. Схема показывает выбранные колёса; совместимость проверяется отдельно.</figcaption></figure>;
  }
  const title = exercise.kind === 'route' ? 'Заготовка → обработка → контроль → готовая деталь'
    : exercise.kind === 'automation' ? 'Датчики → программа → зажим → станок → выдача'
    : exercise.kind === 'schedule' ? 'Партии → станок A → станок B → отгрузка'
    : `${exercise.material} · ${exercise.shape === 'cylinder' ? 'цилиндр' : 'брусок'} → ${exercise.operation}`;
  return <figure className="exercise-diagram dwg"><svg viewBox="0 0 640 170" role="img" aria-label={title}>
    {[0, 1, 2].map(i => <g key={i}><rect x={30 + i * 215} y="40" width="150" height="70" rx="6" fill={['#c6d8d1', '#e2d3a8', '#c8d5e1'][i]} stroke="#273750" />{i < 2 && <path d={`M${185 + i * 215} 75 h45 l-8 -6 m8 6 l-8 6`} fill="none" stroke="#273750" />}<text x={105 + i * 215} y="82" textAnchor="middle" fontSize="18">{exercise.kind === 'schedule' ? ['Партии', 'Станок A', 'Станок B'][i] : exercise.kind === 'automation' ? ['Датчики', 'Программа', 'Станок'][i] : exercise.kind === 'route' ? ['Заготовка', 'Операции', 'Контроль'][i] : ['Заготовка', 'Инструмент', 'Деталь'][i]}</text></g>)}
  </svg><figcaption>{title}</figcaption></figure>;
}
