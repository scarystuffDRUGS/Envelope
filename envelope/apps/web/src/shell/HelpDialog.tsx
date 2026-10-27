import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  makeStyles,
} from '@fluentui/react-components';
import { useAppStore } from '../store/appStore';

const useStyles = makeStyles({
  surface: { width: '560px', maxWidth: '92vw' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    minHeight: '36px',
    fontSize: '14px',
    color: 'var(--on-surface)',
    borderBottom: '1px solid var(--outline-variant)',
  },
  key: {
    fontFamily: 'var(--font-plain)',
    fontSize: '12px',
    fontWeight: 500,
    minWidth: '20px',
    textAlign: 'center',
    padding: '2px 8px',
    borderRadius: 'var(--radius-xs)',
    backgroundColor: 'var(--surface-container-highest)',
    color: 'var(--on-surface)',
  },
  note: { fontSize: '13px', color: 'var(--on-surface-variant)', marginTop: '16px', lineHeight: '18px' },
});

const SHORTCUTS: [string, string][] = [
  ['/', 'Search'],
  ['?', 'Keyboard shortcuts'],
  ['←', 'Previous hour'],
  ['→', 'Next hour'],
  ['F', 'Fit to site'],
  ['M', 'Before / after mitigation'],
  ['I', 'Indicators dropdown (narrower windows)'],
  ['L', 'Layers dropdown (narrow windows)'],
  ['D', 'Dust layer'],
  ['H', 'Surface temperature layer'],
  ['U', 'Worker heat stress (UTCI) layer'],
  ['G', 'GHG on envelope layer'],
  ['Ctrl+E', 'Export report'],
];

export function HelpDialog() {
  const s = useStyles();
  const open = useAppStore((st) => st.ui.helpOpen);
  const setHelpOpen = useAppStore((st) => st.setHelpOpen);
  return (
    <Dialog open={open} onOpenChange={(_, d) => setHelpOpen(d.open)}>
      <DialogSurface className={s.surface} data-testid="dialog-help">
        <DialogBody>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogContent>
            <div className={s.grid}>
              {SHORTCUTS.map(([k, d]) => (
                <div key={k} className={s.row}>
                  <span>{d}</span>
                  <kbd className={s.key}>{k}</kbd>
                </div>
              ))}
            </div>
            <p className={s.note}>
              Envelope is a screening-level tool. Its results are indicative and do not replace an EIA by an
              accredited consultant.
            </p>
          </DialogContent>
          <DialogActions>
            <button
              type="button"
              className="env-btn env-btn--filled env-state"
              data-testid="ctl-help-close"
              onClick={() => setHelpOpen(false)}
            >
              Close
            </button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
