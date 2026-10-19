export type MotionSetting = 'system' | 'reduce' | 'full';

/** Разрешает настройку «системная / уменьшить / обычная» в итоговое значение и пишет его в <html data-motion>. */
export function applyMotionSetting(setting: MotionSetting): 'reduce' | 'full' {
  const system = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const resolved = setting === 'system' ? (system ? 'reduce' : 'full') : setting;
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = resolved;
  return resolved;
}

export function isReducedMotion(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduce';
}
