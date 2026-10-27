import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components';
import type { Assumptions } from '@envelope/models';
import { PARAMS } from '@envelope/models';
import { Fragment, useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { Icon } from './ui';

const useStyles = makeStyles({
  surface: { width: '760px', maxWidth: '92vw' },
  lead: { fontSize: '14px', color: 'var(--on-surface-variant)', margin: '0 0 12px' },
  scroll: {
    maxHeight: '58vh',
    overflowY: 'auto',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--outline-variant)',
  },
  table: { width: '100%' },
  source: { fontSize: '12px', color: 'var(--on-surface-variant)' },
  input: { width: '96px', height: '32px', textAlign: 'right' },
  changed: {
    backgroundColor: 'color-mix(in srgb, var(--tertiary) 12%, transparent)',
    boxShadow: 'inset 0 0 0 1px var(--tertiary)',
  },
  badge: { marginLeft: '6px' },
});

function AssumptionCell({ id, value, changed }: { id: keyof Assumptions; value: number; changed: boolean }) {
  const s = useStyles();
  const setA = useAppStore((st) => st.setAssumption);
  const [draft, setDraft] = useState(String(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setDraft(String(value));
    setBad(false);
  }, [value]);
  const commit = () => {
    const v = Number(draft);
    const def = PARAMS.find((p) => p.id === id)!;
    if (!Number.isFinite(v) || v < (def.min ?? 0) || (def.max !== undefined && v > def.max)) {
      setBad(true);
      setDraft(String(value));
      return;
    }
    setA(id, v === def.value ? null : v);
  };
  return (
    <input
      className={mergeClasses('env-field', s.input, changed && s.changed)}
      value={draft}
      aria-label={`${id} value`}
      aria-invalid={bad}
      data-testid={`ctl-assumption-${id}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

/** Every model assumption, editable. Changed values are tinted blue. */
export function AssumptionsDialog() {
  const s = useStyles();
  const open = useAppStore((st) => st.ui.assumptionsOpen);
  const setOpen = useAppStore((st) => st.setAssumptionsOpen);
  const overrides = useAppStore((st) => st.assumptions);
  const resetA = useAppStore((st) => st.resetAssumptions);
  const changed = Object.keys(overrides).length;
  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogSurface className={s.surface} data-testid="dialog-assumptions">
        <DialogBody>
          <DialogTitle>Assumptions</DialogTitle>
          <DialogContent>
            <p className={s.lead}>
              Defaults come from cited sources (hover a source to read it). Changes apply to both scenarios
              and re-run the models. {changed} changed.
            </p>
            <div className={mergeClasses(s.scroll, 'env-scroll')}>
              <table className={mergeClasses('env-table', s.table)}>
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Value</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {(['Programme', 'Logistics', 'Dust', 'Heat', 'GHG'] as const).map((g) => (
                    <Fragment key={g}>
                      <tr>
                        <td colSpan={3} className="env-table__group">
                          {g}
                        </td>
                      </tr>
                      {PARAMS.filter((p) => p.group === g).map((p) => {
                        const id = p.id as keyof Assumptions;
                        const v = overrides[id] ?? p.value;
                        return (
                          <tr key={p.id}>
                            <td className="env-wrap">
                              {p.label}
                              {p.status === 'verify' && (
                                <span className={mergeClasses('env-badge env-badge--warn', s.badge)}>
                                  unverified
                                </span>
                              )}
                              <div className={s.source} title={p.source}>
                                {p.source.length > 70 ? `${p.source.slice(0, 70)}…` : p.source}
                              </div>
                            </td>
                            <td>
                              <AssumptionCell id={id} value={v} changed={overrides[id] !== undefined} />
                            </td>
                            <td className={s.source}>{p.unit}</td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
          <DialogActions>
            <button
              type="button"
              className="env-btn env-btn--text env-btn--icon-lead env-state"
              disabled={!changed}
              data-testid="ctl-assumptions-reset-dialog"
              onClick={resetA}
            >
              <Icon name="restart_alt" size={18} />
              Reset to default
            </button>
            <button
              type="button"
              className="env-btn env-btn--filled env-state"
              data-testid="ctl-assumptions-close"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
