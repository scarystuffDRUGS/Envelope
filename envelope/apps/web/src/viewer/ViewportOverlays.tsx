import { ProgressBar, Tooltip, makeStyles, mergeClasses } from '@fluentui/react-components';
import { Icon, IconButton } from '../shell/ui';
import { useAppStore } from '../store/appStore';
import { viewerCommands } from './controller';
import { Legend } from './Legend';
import { StageCard } from './StageCard';

const useStyles = makeStyles({
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  // Notice and construction stage card, stacked at the top left.
  topLeft: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    zIndex: 2,
    maxWidth: 'min(60%, 720px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
  },
  status: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    backgroundColor: 'var(--tertiary-container)',
    color: 'var(--on-tertiary-container)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--elevation-1)',
    padding: '8px 12px',
    fontSize: '13px',
    lineHeight: '18px',
  },
  loading: { backgroundColor: 'var(--surface-container-high)', color: 'var(--on-surface-variant)' },
  controls: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fab: {
    backgroundColor: 'var(--surface-container-lowest)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--elevation-1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    overflow: 'hidden',
  },
  ctl: { borderRadius: 0, width: '40px', height: '40px', color: 'var(--on-surface)' },
  divider: { width: '24px', height: '1px', backgroundColor: 'var(--outline-variant)' },
  compass: { width: '32px', height: '32px' },
  north: { fill: 'var(--error)' },
  south: { fill: 'var(--outline)' },
  nLabel: { fill: 'var(--on-surface)', fontFamily: 'Roboto, sans-serif', fontWeight: 700 },
  scale: {
    position: 'absolute',
    right: '12px',
    bottom: '12px',
    zIndex: 2,
    fontSize: '11px',
    color: 'var(--on-surface)',
    backgroundColor: 'color-mix(in srgb, var(--surface-container-lowest) 88%, transparent)',
    padding: '2px 8px 4px',
    borderRadius: 'var(--radius-xs)',
    fontVariantNumeric: 'tabular-nums',
  },
  scaleBar: { height: '4px', border: '1.5px solid var(--on-surface)', borderTop: 'none', marginTop: '1px' },
});

/** Largest 1-2-5 step that fits in ~100 px. */
function niceScale(metresPerPixel: number): { metres: number; px: number } {
  const target = metresPerPixel * 100;
  const pow = 10 ** Math.floor(Math.log10(target));
  const step = [5, 2, 1].map((k) => k * pow).find((v) => v <= target) ?? pow;
  return { metres: step, px: step / metresPerPixel };
}

function formatMetres(m: number): string {
  return m >= 1000 ? `${m / 1000} km` : `${m} m`;
}

export function ViewportOverlays() {
  const s = useStyles();
  const basemap = useAppStore((st) => st.basemap);
  const placed = useAppStore((st) => st.buildingPlaced);
  const view = useAppStore((st) => st.view);
  const heading = view?.headingDeg ?? 0;
  const scale = view ? niceScale(view.metresPerPixel) : null;
  const loading = basemap.state === 'loading' || !placed;
  const siteData = useAppStore((st) => st.siteData);
  const dataState = useAppStore((st) => st.dataState);
  const stale = siteData
    ? Object.values(siteData.provenance).filter((p) => p.status === 'cached' || p.status === 'snapshot')
    : [];
  const dataNotice =
    dataState === 'error'
      ? 'Site data could not be loaded. Dust and heat need weather data; GHG results are still shown.'
      : stale.length
        ? `Cached data from ${new Date(Math.min(...stale.map((p) => Date.parse(p.fetchedAt ?? '') || Date.now()))).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} (${stale.map((p) => p.source).join(', ')})`
        : null;

  return (
    <>
      {loading && (
        <div className={s.topBar}>
          <ProgressBar thickness="medium" aria-label="Loading the 3D site" />
        </div>
      )}
      <div className={s.topLeft}>
        {loading ? (
          <div className={mergeClasses(s.status, s.loading)} data-testid="viewport-loading">
            <Icon name="hourglass_top" size={18} />
            {basemap.state === 'loading' ? 'Loading basemap…' : 'Placing the building on the ground…'}
          </div>
        ) : (
          (basemap.notice || dataNotice) && (
            <div className={s.status} role="status" data-testid="viewport-notice">
              <Icon name={dataState === 'error' ? 'error' : 'info'} size={18} />
              {[basemap.notice, dataNotice].filter(Boolean).join(' ')}
            </div>
          )
        )}
        {!loading && <StageCard />}
      </div>

      <div className={s.controls}>
        <div className={s.fab}>
          <Tooltip content={`Heading ${heading}°. Reset to north`} relationship="label" positioning="before">
            <button
              type="button"
              className={mergeClasses('env-icon-btn env-state', s.ctl)}
              data-testid="ctl-compass"
              onClick={() => viewerCommands.resetNorth()}
            >
              <svg className={s.compass} viewBox="0 0 32 32" aria-hidden>
                <g transform={`rotate(${-heading} 16 16)`}>
                  <path className={s.north} d="M16 5 L20 16 L16 14.5 L12 16 Z" />
                  <path className={s.south} d="M16 27 L20 16 L16 17.5 L12 16 Z" />
                  <text className={s.nLabel} x="16" y="4.6" textAnchor="middle" fontSize="5">
                    N
                  </text>
                </g>
              </svg>
            </button>
          </Tooltip>
        </div>
        <div className={s.fab}>
          <IconButton
            icon="add"
            label="Zoom in"
            testId="ctl-zoom-in"
            tooltipPosition="before"
            className={s.ctl}
            onClick={() => viewerCommands.zoom(1)}
          />
          <span className={s.divider} />
          <IconButton
            icon="remove"
            label="Zoom out"
            testId="ctl-zoom-out"
            tooltipPosition="before"
            className={s.ctl}
            onClick={() => viewerCommands.zoom(-1)}
          />
        </div>
        <div className={s.fab}>
          <IconButton
            icon="center_focus_strong"
            label="Reset view (F)"
            testId="ctl-reset-view"
            tooltipPosition="before"
            className={s.ctl}
            onClick={() => viewerCommands.fitToSite()}
          />
        </div>
      </div>

      <Legend />
      {scale && (
        <div className={s.scale} data-testid="scale-bar" title="Scale at the site centre">
          {formatMetres(scale.metres)}
          <div className={s.scaleBar} style={{ width: `${Math.round(scale.px)}px` }} />
        </div>
      )}
    </>
  );
}
