import { Tooltip, makeStyles, mergeClasses } from '@fluentui/react-components';
import { useRef, useState } from 'react';
import type { PanelId } from '../store/appStore';
import { PANEL_WIDTHS, useAppStore } from '../store/appStore';

const useStyles = makeStyles({
  root: {
    position: 'relative',
    flexShrink: 0,
    width: '12px',
    cursor: 'col-resize',
    touchAction: 'none',
    outline: 'none',
    // The pill: hidden until the edge is hovered, focused or dragged.
    '::after': {
      content: '""',
      position: 'absolute',
      top: '50%',
      left: '4px',
      width: '4px',
      height: '40px',
      marginTop: '-20px',
      borderRadius: '2px',
      backgroundColor: 'var(--outline-variant)',
      opacity: 0,
      transitionProperty: 'opacity, background-color',
      transitionDuration: '150ms',
    },
    ':hover::after': { opacity: 1 },
    ':focus-visible::after': { opacity: 1, backgroundColor: 'var(--primary)' },
    '@media (prefers-reduced-motion: reduce)': { '::after': { transitionDuration: '0ms' } },
  },
  active: { '::after': { opacity: 1, backgroundColor: 'var(--primary)' } },
});

const STEP_PX = 16;

/**
 * Vertical drag edge between two areas (D-032). `side` is where the resized area sits: dragging
 * away from it grows it. `value` is in any unit; `pxPerUnit` converts the pointer movement (1 for
 * pixels, container width / 100 for percent). Arrow keys step `step`, Home and End go to the
 * limits, double-click restores `initial`.
 */
export function DragHandle({
  value,
  min,
  max,
  initial,
  onChange,
  side,
  label,
  testId,
  pxPerUnit = 1,
  step = STEP_PX,
}: {
  value: number;
  min: number;
  max: number;
  initial: number;
  onChange: (v: number) => void;
  side: 'left' | 'right';
  label: string;
  testId: string;
  pxPerUnit?: number;
  step?: number;
}) {
  const s = useStyles();
  const drag = useRef<{ x: number; v: number } | null>(null);
  const [active, setActive] = useState(false);
  const dir = side === 'left' ? 1 : -1;
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));

  return (
    <Tooltip content={`${label}: drag to resize, double-click to reset`} relationship="description" withArrow>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        className={mergeClasses(s.root, active && s.active)}
        data-testid={testId}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: value };
          setActive(true);
          document.body.style.cursor = 'col-resize';
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          set(drag.current.v + (dir * (e.clientX - drag.current.x)) / pxPerUnit);
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          drag.current = null;
          setActive(false);
          document.body.style.cursor = '';
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setActive(false);
          document.body.style.cursor = '';
        }}
        onDoubleClick={() => set(initial)}
        onKeyDown={(e) => {
          const d = e.key === 'ArrowRight' ? dir * step : e.key === 'ArrowLeft' ? -dir * step : 0;
          if (d) set(value + d);
          else if (e.key === 'Home') set(min);
          else if (e.key === 'End') set(max);
          else return;
          e.preventDefault();
          e.stopPropagation(); // ← / → also step the hour (useShortcuts)
        }}
      />
    </Tooltip>
  );
}

/** Drag edge between a docked side panel and the map; the width is kept in this browser. */
export function ResizeHandle({
  panel,
  side,
  label,
}: {
  panel: PanelId;
  side: 'left' | 'right';
  label: string;
}) {
  const width = useAppStore((st) => st.ui.panelWidths[panel]);
  const setWidth = useAppStore((st) => st.setPanelWidth);
  const { min, max, initial } = PANEL_WIDTHS[panel];
  return (
    <DragHandle
      value={width}
      min={min}
      max={max}
      initial={initial}
      onChange={(w) => setWidth(panel, w)}
      side={side}
      label={label}
      testId={`ctl-resize-${panel}`}
    />
  );
}
