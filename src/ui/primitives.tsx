import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'run' | 'ghost' | 'quiet' | 'danger';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  /** Кнопка без текста: label обязателен для доступности. */
  label?: string;
}

export function Button({ variant = 'ghost', size = 'md', icon, iconRight, label, className, children, type = 'button', ...rest }: ButtonProps) {
  const iconOnly = !children && !!icon;
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size} ${iconOnly ? 'btn--icon' : ''} ${className ?? ''}`}
      aria-label={label}
      title={iconOnly ? label : rest.title}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 22 : size === 'sm' ? 16 : 18} />}
      {children && <span className="btn__text">{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === 'lg' ? 22 : 18} />}
    </button>
  );
}

type Tone = 'neutral' | 'teal' | 'amber' | 'green' | 'red';
export function Chip({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={`chip chip--${tone} ${className ?? ''}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export function Meter({ value, max = 100, tone = 'teal', label, className }: { value: number; max?: number; tone?: Tone; label: string; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`meter meter--${tone} ${className ?? ''}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Кольцевой индикатор прогресса. */
export function Ring({ value, size = 56, stroke = 5, tone = 'teal', children, label }: { value: number; size?: number; stroke?: number; tone?: Tone; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className={`ring ring--${tone}`} style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(pct * 100)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring__track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring__bar"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <div className="ring__label">{children}</div>}
    </div>
  );
}

/** Модальное окно с ловушкой фокуса и закрытием по Escape. */
export function Dialog({ title, children, onClose, wide = false, labelledBy }: { title?: string; children: ReactNode; onClose?: () => void; wide?: boolean; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const titleId = labelledBy ?? autoId;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? []);
    (root?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? root)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) { event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div ref={ref} className={`dialog ${wide ? 'dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1}>
        {title && <h2 id={titleId} className="t-h2 dialog__title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span className="switch__track" aria-hidden="true"><i /></span>
      <span className="switch__text">{label}{hint && <small>{hint}</small>}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; icon?: IconName }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button key={option.value} type="button" aria-pressed={value === option.value} className={value === option.value ? 'is-on' : ''} onClick={() => onChange(option.value)}>
          {option.icon && <Icon name={option.icon} size={16} />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface ToastItem { id: number; tone: 'ok' | 'err' | 'info'; title: string; text?: string }
/** Стек коротких уведомлений. Сообщения исчезают сами, важные ошибки читаются через aria-live. */
export function useToasts(ttl = 4800) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setItems(list => list.filter(t => t.id !== id)), []);
  const push = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = ++counter.current;
    setItems(list => [...list.slice(-2), { ...toast, id }]);
    window.setTimeout(() => dismiss(id), ttl);
  }, [dismiss, ttl]);
  const node = (
    <div className="toasts" role="status" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <Icon name={t.tone === 'err' ? 'alert' : t.tone === 'ok' ? 'checkCircle' : 'info'} size={20} />
          <div><strong>{t.title}</strong>{t.text && <span>{t.text}</span>}</div>
          <Button variant="quiet" size="sm" icon="close" label="Закрыть уведомление" onClick={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
  return { push, node };
}
