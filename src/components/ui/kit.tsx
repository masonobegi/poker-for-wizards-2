/**
 * The UI kit. Deliberately small — a handful of primitives the scenes compose,
 * rather than a component for every shape on screen.
 */
import {
  forwardRef, memo, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { playSfx, soundProps } from '@/lib/sound';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export type ButtonTone = 'default' | 'primary' | 'danger' | 'good' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  display?: boolean;
  loading?: boolean;
  /** Sound played on press. Pass null for a silent control. */
  sound?: string | null;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = 'default', size = 'md', block, display, loading, sound = 'ui_click',
    className = '', children, disabled, onPointerEnter, onPointerDown, ...rest },
  ref,
) {
  const classes = [
    'btn',
    tone !== 'default' ? `btn-${tone}` : '',
    size !== 'md' ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    display ? 'btn-display' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      onPointerEnter={(e) => {
        if (!disabled && !loading) playSfx('ui_hover', { vol: 0.3 });
        onPointerEnter?.(e);
      }}
      onPointerDown={(e) => {
        if (!disabled && !loading && sound) playSfx(sound);
        onPointerDown?.(e);
      }}
      {...rest}
    >
      {loading ? <span className="spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, className = '', id, ...rest }, ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <label className="field" htmlFor={fieldId}>
      {label ? <span className="field-label">{label}</span> : null}
      <input ref={ref} id={fieldId} className={`input ${className}`} {...rest} />
      {hint ? <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)' }}>{hint}</span> : null}
    </label>
  );
});

export function Toggle({ checked, onChange, label }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => { playSfx('ui_click', { vol: 0.5 }); onChange(e.target.checked); }}
      />
      <span className="toggle-track"><span className="toggle-knob" /></span>
      <span>{label}</span>
    </label>
  );
}

export function Range({ value, min, max, step = 1, onChange, ...rest }: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className="range"
      style={{ ['--pct' as string]: `${pct}%` }}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Badge / tooltip
// ---------------------------------------------------------------------------

export function Badge({ tone, children, style }: {
  tone?: 'gold' | 'magic' | 'bad' | 'good';
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`} style={style}>{children}</span>;
}

export const Tooltip = memo(function Tooltip({ body, children, delay = 220 }: {
  body: ReactNode;
  children: ReactNode;
  delay?: number;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <span
      className="tip"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <AnimatePresence>
        {open && body ? (
          <motion.span
            className="tip-body"
            role="tooltip"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {body}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
});

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({ open, onClose, children, labelledBy }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export const Chips = memo(function Chips({ amount, className = '' }: {
  amount: number;
  className?: string;
}) {
  return <span className={`chips-amount ${className}`}>{amount.toLocaleString()}</span>;
});

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

export { soundProps };
