import { Tooltip, makeStyles } from '@fluentui/react-components';
import { DATA_SOURCES } from '@envelope/data';
import type { FreshnessState } from '@envelope/data';
import { calendarMonthFor, formatHour, phaseForMonth, toSchedule, totalMonths } from '@envelope/models';
import { backgroundNote } from '../analysis/background';
import { useAppStore } from '../store/appStore';
import { Icon } from './ui';

const useStyles = makeStyles({
  root: {
    height: '32px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0 12px 0 96px',
    backgroundColor: 'var(--surface)',
    fontSize: '12px',
    color: 'var(--on-surface-variant)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },
  item: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 10px',
    lineHeight: '24px',
    borderRadius: 'var(--radius-full)',
  },
  cursor: { minWidth: '196px' },
  spacer: { flexGrow: 1 },
  source: { display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '10px' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },
});

// Freshness dots; pairs with the text in the tooltip, so colour never carries meaning alone.
const STATE_COLOUR: Record<FreshnessState, string> = {
  'not-loaded': 'var(--outline-variant)',
  loading: 'var(--outline)',
  live: 'var(--primary)',
  cached: '#d29e00',
  error: 'var(--error)',
};

const STATE_TEXT: Record<FreshnessState, string> = {
  'not-loaded': 'Not loaded',
  loading: 'Loading',
  live: 'Live',
  cached: 'Cached',
  error: 'Unavailable',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const BASEMAP_TEXT = {
  google: 'Google 3D tiles',
  'ion-fallback': 'World Terrain + OSM Buildings',
  osm: 'OpenStreetMap',
  none: 'No basemap',
} as const;

export function StatusBar() {
  const s = useStyles();
  const { hour, constructionMonth, weatherYear } = useAppStore((st) => st.scenario);
  const cursor = useAppStore((st) => st.cursor);
  const view = useAppStore((st) => st.view);
  const basemap = useAppStore((st) => st.basemap);
  const results = useAppStore((st) => st.results);
  const eff = results?.baseline.programme.effective;
  const total = eff ? eff.excavation + eff.structure + eff.finishing : totalMonths();
  const { phase } = phaseForMonth(constructionMonth, eff ? toSchedule(eff) : undefined);
  const calMonth = MONTHS[calendarMonthFor(constructionMonth) - 1];
  const siteData = useAppStore((st) => st.siteData);
  const dataState = useAppStore((st) => st.dataState);
  const runMs = useAppStore((st) => st.runMs);
  const bgNote = backgroundNote(siteData);
  const running = useAppStore((st) => st.running);
  const PROV_KEY = {
    'open-meteo-archive': 'weather',
    'open-meteo-forecast': null,
    'open-meteo-air-quality': 'airQuality',
    overpass: 'osm',
  } as const;
  const stateOf = (id: keyof typeof PROV_KEY): { state: FreshnessState; when: string } => {
    const k = PROV_KEY[id];
    if (!k) return { state: 'not-loaded', when: 'not used in this build (Live mode deferred)' };
    if (!siteData) return { state: dataState === 'error' ? 'error' : 'loading', when: '' };
    const p = siteData.provenance[k];
    const st: FreshnessState = p.status === 'live' ? 'live' : p.status === 'unavailable' ? 'error' : 'cached';
    return {
      state: st,
      when: p.fetchedAt ? `fetched ${new Date(p.fetchedAt).toLocaleString('en-IN')}` : 'no data',
    };
  };

  return (
    <footer className={s.root} data-testid="panel-statusbar">
      <span className={`${s.item} ${s.cursor}`} data-testid="status-cursor">
        <Icon name="my_location" size={18} />
        {cursor ? `${cursor.lat.toFixed(5)}° N, ${cursor.lon.toFixed(5)}° E` : 'Cursor: –'}
      </span>
      <Tooltip content="Sun position and shadows use this date and hour" relationship="description">
        <span className={s.item} data-testid="status-hour" tabIndex={0}>
          <Icon name="schedule" size={18} />
          {results ? results.baseline.selected.dateLabel : `15 ${calMonth} ${weatherYear}`},{' '}
          {formatHour(hour)} IST
        </span>
      </Tooltip>
      <span className={s.item} data-testid="status-month">
        <Icon name="construction" size={18} />
        Month {Math.min(constructionMonth, total)}/{total} · {phase.label}
      </span>
      <span className={s.item} data-testid="status-camera">
        <Icon name="videocam" size={18} />
        {view ? `Camera ${view.rangeM.toLocaleString('en-IN')} m · ${view.headingDeg}°` : 'Camera –'}
      </span>
      <span className={s.spacer} />
      <Tooltip content={bgNote.long} relationship="description">
        <span className={s.item} data-testid="status-background" tabIndex={0}>
          <Icon name={bgNote.corrected ? 'tune' : 'info'} size={18} />
          {bgNote.short}
        </span>
      </Tooltip>
      <span className={s.item} data-testid="status-basemap">
        {basemap.kind ? BASEMAP_TEXT[basemap.kind] : 'Basemap loading'}
      </span>
      <span className={s.item}>
        {DATA_SOURCES.map((src) => {
          const { state, when } = stateOf(src.id);
          return (
            <Tooltip
              key={src.id}
              content={`${src.label}: ${STATE_TEXT[state]} ${when}`}
              relationship="description"
            >
              <span className={s.source} data-testid={`status-source-${src.id}`} tabIndex={0}>
                <span className={s.dot} style={{ backgroundColor: STATE_COLOUR[state] }} />
                {src.label}
              </span>
            </Tooltip>
          );
        })}
      </span>
      <span className={s.item} data-testid="status-runtime">
        {running
          ? 'Model running…'
          : runMs !== null
            ? `Model run ${runMs.toLocaleString('en-IN')} ms`
            : 'Model run: –'}
      </span>
    </footer>
  );
}
