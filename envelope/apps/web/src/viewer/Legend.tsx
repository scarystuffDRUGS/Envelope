import { makeStyles } from '@fluentui/react-components';
import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { activeLayer } from './impactLayer';

const useStyles = makeStyles({
  root: {
    position: 'absolute',
    left: '12px',
    bottom: '12px',
    zIndex: 2,
    width: '240px',
    backgroundColor: 'var(--surface-container-lowest)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--elevation-1)',
    padding: '10px 12px',
    fontSize: '11px',
    color: 'var(--on-surface)',
    fontVariantNumeric: 'tabular-nums',
  },
  title: { fontSize: '12px', fontWeight: 500, marginBottom: '6px' },
  bar: { height: '10px', borderRadius: '5px' },
  ticks: {
    display: 'flex',
    justifyContent: 'space-between',
    color: 'var(--on-surface-variant)',
    marginTop: '3px',
  },
  cls: { display: 'flex', alignItems: 'center', gap: '8px', lineHeight: '17px' },
  sw: { width: '12px', height: '12px', borderRadius: '3px' },
  sub: { color: 'var(--on-surface-variant)', marginTop: '6px', lineHeight: '15px' },
});

export function Legend() {
  const s = useStyles();
  const results = useAppStore((st) => st.results);
  const show = useAppStore((st) => st.showScenario);
  const id = useAppStore((st) => st.impactLayer);
  const metric = useAppStore((st) => st.dustMetric);
  const hour = useAppStore((st) => st.scenario.hour);
  const corrected = useAppStore((st) => st.siteData?.background?.status === 'corrected');
  const layer = useMemo(
    () => activeLayer(results ? results[show] : null, id, metric),
    [results, show, id, metric],
  );
  if (!layer || !results) return null;
  const r = results[show];
  const sc = layer.scale;
  return (
    <div className={s.root} data-testid="legend">
      <div className={s.title}>
        {sc.title} ({sc.unit})
      </div>
      {sc.classes ? (
        sc.classes.slice(0, 5).map((c) => (
          <div key={c.label} className={s.cls}>
            <span className={s.sw} style={{ backgroundColor: c.colour }} />
            {c.label}
          </div>
        ))
      ) : (
        <>
          <div
            className={s.bar}
            style={{ background: `linear-gradient(to right, ${sc.stops!.join(',')})` }}
          />
          <div className={s.ticks}>
            <span>{sc.min.toFixed(0)}</span>
            <span>{id === 'dust' ? 'log scale' : ''}</span>
            <span>{sc.max.toFixed(0)}</span>
          </div>
        </>
      )}
      <div className={s.sub}>
        {show === 'baseline' ? 'Before mitigation' : 'After mitigation'} · {r.selected.dateLabel}
        {id !== 'ghg' && id !== 'dust' ? ` · ${String(hour).padStart(2, '0')}:00 IST` : ''}
        {id === 'dust'
          ? ` · background ${r.dust.background.dayPm10.toFixed(0)} µg/m³ (${corrected ? 'station-corrected CAMS' : 'CAMS'}) not shown`
          : ''}
      </div>
    </div>
  );
}
