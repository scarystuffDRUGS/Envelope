import { Tooltip, makeStyles, mergeClasses } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { useAppStore } from '../store/appStore';

/**
 * Small Material 3 building blocks shared by the shell. Visual rules live in theme/global.css (env-*
 * classes) and the Envelope design system; these components add behaviour, tooltips and test ids.
 */

/** Material Symbols Outlined glyph by ligature name, e.g. <Icon name="air" />. */
export function Icon({
  name,
  size = 20,
  filled = false,
  className,
}: {
  name: string;
  size?: 18 | 20 | 24;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={mergeClasses(
        'env-icon',
        size === 24 && 'env-icon--24',
        size === 18 && 'env-icon--18',
        filled && 'env-icon--filled',
        className,
      )}
    >
      {name}
    </span>
  );
}

export function IconButton({
  icon,
  label,
  testId,
  onClick,
  pressed,
  disabled,
  small,
  filled,
  tooltipPosition,
  className,
}: {
  icon: string;
  /** Accessible name and tooltip; include the shortcut, e.g. "Next hour (→)". */
  label: string;
  testId: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  small?: boolean;
  filled?: boolean;
  tooltipPosition?: 'above' | 'below' | 'before' | 'after';
  className?: string;
}) {
  return (
    <Tooltip content={label} relationship="label" positioning={tooltipPosition} withArrow>
      <button
        type="button"
        className={mergeClasses('env-icon-btn env-state', small && 'env-icon-btn--sm', className)}
        data-testid={testId}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
      >
        <Icon name={icon} size={small ? 20 : 24} filled={filled ?? pressed} />
      </button>
    </Tooltip>
  );
}

const useSectionStyles = makeStyles({
  root: {
    backgroundColor: 'var(--surface-container-lowest)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  head: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minHeight: '48px',
    padding: '0 8px 0 16px',
    border: 0,
    background: 'transparent',
    color: 'var(--on-surface)',
    fontFamily: 'var(--font-plain)',
    fontSize: '16px',
    lineHeight: '24px',
    fontWeight: 500,
    letterSpacing: '0.15px',
    textAlign: 'left',
    cursor: 'pointer',
    borderRadius: 'var(--radius-md)',
  },
  headStatic: { cursor: 'default' },
  title: { flexGrow: 1 },
  meta: {
    fontSize: '12px',
    fontWeight: 400,
    letterSpacing: '0.4px',
    color: 'var(--on-surface-variant)',
  },
  lead: { color: 'var(--on-surface-variant)' },
  chevron: {
    color: 'var(--on-surface-variant)',
    transitionProperty: 'transform',
    transitionDuration: 'var(--duration-medium)',
    transitionTimingFunction: 'var(--ease-standard)',
  },
  chevronOpen: { transform: 'rotate(180deg)' },
  body: { padding: '0 16px 16px' },
  flush: { padding: '0 0 8px' },
});

/**
 * A card-like section with a title row. Collapsible sections keep their open state in the store
 * (ui.sections), so the e2e click-everything test sees each toggle change state.
 */
export function Section({
  id,
  title,
  icon,
  meta,
  children,
  collapsible = true,
  defaultOpen = true,
  flush = false,
  testId,
}: {
  id: string;
  title: string;
  icon?: string;
  meta?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** No side padding in the body (tables, lists). */
  flush?: boolean;
  testId?: string;
}) {
  const s = useSectionStyles();
  const stored = useAppStore((st) => st.ui.sections[id]);
  const setOpen = useAppStore((st) => st.setSectionOpen);
  const open = !collapsible || (stored ?? defaultOpen);
  const head = (
    <>
      {icon && <Icon name={icon} className={s.lead} />}
      <span className={s.title}>{title}</span>
      {meta && <span className={s.meta}>{meta}</span>}
      {collapsible && (
        <Icon name="expand_more" size={24} className={mergeClasses(s.chevron, open && s.chevronOpen)} />
      )}
    </>
  );
  return (
    <section className={s.root} data-testid={testId} aria-label={title}>
      {collapsible ? (
        <button
          type="button"
          className={mergeClasses(s.head, 'env-state')}
          aria-expanded={open}
          data-testid={`ctl-section-${id}`}
          onClick={() => setOpen(id, !open)}
        >
          {head}
        </button>
      ) : (
        <div className={mergeClasses(s.head, s.headStatic)}>{head}</div>
      )}
      {open && <div className={mergeClasses(flush ? s.flush : s.body, 'env-enter')}>{children}</div>}
    </section>
  );
}

const useSegStyles = makeStyles({
  root: {
    display: 'inline-flex',
    borderRadius: 'var(--radius-full)',
    boxShadow: 'inset 0 0 0 1px var(--outline)',
    overflow: 'hidden',
    flexShrink: 0,
  },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    height: '32px',
    padding: '0 14px',
    border: 0,
    borderRight: '1px solid var(--outline)',
    background: 'transparent',
    color: 'var(--on-surface)',
    fontFamily: 'var(--font-plain)',
    fontSize: '13px',
    fontWeight: 500,
    letterSpacing: '0.1px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':last-child': { borderRight: 0 },
  },
  on: { backgroundColor: 'var(--secondary-container)', color: 'var(--on-secondary-container)' },
});

/** Material segmented button: one choice of a few. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; testId: string; tooltip?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  const s = useSegStyles();
  return (
    <div className={s.root} role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        const btn = (
          <button
            key={o.value}
            type="button"
            className={mergeClasses(s.item, on && s.on, 'env-state')}
            aria-pressed={on}
            data-testid={o.testId}
            onClick={() => !on && onChange(o.value)}
          >
            {on && <Icon name="check" size={18} />}
            {o.label}
          </button>
        );
        return o.tooltip ? (
          <Tooltip key={o.value} content={o.tooltip} relationship="description" withArrow>
            {btn}
          </Tooltip>
        ) : (
          btn
        );
      })}
    </div>
  );
}

const useGroupStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px 16px',
    backgroundColor: 'var(--surface-container-lowest)',
    borderRadius: 'var(--radius-md)',
    flexShrink: 0,
    minHeight: '64px',
    boxSizing: 'border-box',
  },
  label: {
    fontSize: '11px',
    lineHeight: '16px',
    fontWeight: 500,
    letterSpacing: '0.5px',
    color: 'var(--on-surface-variant)',
    textTransform: 'none',
  },
  body: { display: 'flex', alignItems: 'center', gap: '8px' },
});

/** One segment of the workspace bar: a small card with a label and its controls. */
export function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  const s = useGroupStyles();
  return (
    <div className={s.root} role="group" aria-label={label}>
      <div className={s.label}>{label}</div>
      <div className={s.body}>{children}</div>
    </div>
  );
}
