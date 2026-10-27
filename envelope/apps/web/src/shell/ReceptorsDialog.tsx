import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components';
import { USER_RECEPTOR_RADIUS_M, isSensitive, toLocalEN } from '@envelope/models';
import { useState } from 'react';
import type { UserReceptor } from '../store/appStore';
import { useAppStore } from '../store/appStore';
import type { GeocodeResults } from '../viewer/controller';
import { viewerCommands } from '../viewer/controller';
import { Icon, IconButton } from './ui';

const useStyles = makeStyles({
  surface: { width: '620px', maxWidth: '96vw', padding: 0 },
  body: { display: 'flex', flexDirection: 'column', gap: 0 },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px 12px 24px',
    borderBottom: '1px solid var(--outline-variant)',
  },
  title: {
    flexGrow: 1,
    fontFamily: 'var(--font-brand)',
    fontSize: '22px',
    lineHeight: '28px',
    fontWeight: 400,
  },
  content: {
    padding: '16px 24px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '72vh',
  },
  meta: { fontSize: '13px', lineHeight: '18px', color: 'var(--on-surface-variant)', margin: 0 },
  note: {
    fontSize: '13px',
    lineHeight: '18px',
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--warning-container)',
    color: 'var(--on-warning-container)',
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 8px',
    borderRadius: 'var(--radius-xs)',
    backgroundColor: 'var(--surface-container-low)',
    fontSize: '13px',
  },
  grow: { flexGrow: 1, minWidth: 0 },
  muted: { color: 'var(--on-surface-variant)', fontSize: '12px' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  result: {
    width: '100%',
    textAlign: 'left',
    border: 0,
    borderRadius: 'var(--radius-xs)',
    padding: '6px 8px',
    fontSize: '13px',
    backgroundColor: 'var(--surface-container)',
    color: 'var(--on-surface)',
    cursor: 'pointer',
  },
  h: { fontSize: '14px', fontWeight: 500, margin: '8px 0 0' },
});

const KINDS: { value: UserReceptor['kind']; label: string }[] = [
  { value: 'school', label: 'School' },
  { value: 'college', label: 'College' },
  { value: 'university', label: 'University' },
  { value: 'kindergarten', label: 'Kindergarten' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'nursing_home', label: 'Nursing home' },
];
const LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label.toLowerCase()]));

function parsePair(text: string): [number, number] | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * Schools, colleges and hospitals near the site (D-029): what OpenStreetMap found, and the ones
 * the user adds by hand, which also covers sites where OpenStreetMap is incomplete or unreachable.
 */
export function ReceptorsDialog() {
  const s = useStyles();
  const open = useAppStore((st) => st.ui.receptorsOpen);
  const setOpen = useAppStore((st) => st.setReceptorsOpen);
  const results = useAppStore((st) => st.results);
  const siteData = useAppStore((st) => st.siteData);
  const site = useAppStore((st) => st.building.site);
  const userReceptors = useAppStore((st) => st.userReceptors);
  const add = useAppStore((st) => st.addUserReceptor);
  const remove = useAppStore((st) => st.removeUserReceptor);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<UserReceptor['kind']>('school');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<GeocodeResults | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  const listed = (results?.mitigated.dust.receptors ?? []).filter((r) => isSensitive(r.kind));
  const within = results?.mitigated.dust.siteWithin ?? [];
  const status = siteData?.provenance.receptors?.status ?? siteData?.provenance.osm.status;
  const latN = Number(lat);
  const lonN = Number(lon);
  const valid =
    name.trim() !== '' &&
    lat.trim() !== '' &&
    lon.trim() !== '' &&
    Number.isFinite(latN) &&
    Number.isFinite(lonN);
  const fromCentre = valid
    ? Math.hypot(...Object.values(toLocalEN({ lon: lonN, lat: latN }, { lon: site.lon, lat: site.lat })))
    : 0;
  // Kept by the engine up to 1 km from the plot boundary; checked here against the centre, with the plot's half-width added.
  const tooFar = valid && fromCentre > USER_RECEPTOR_RADIUS_M + 100;

  const search = async () => {
    if (query.trim().length < 3) return;
    setSearchError(null);
    try {
      setFound(await viewerCommands.geocode(query.trim()));
    } catch (e) {
      setFound(null);
      setSearchError((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogSurface className={s.surface} data-testid="dialog-receptors">
        <DialogBody className={s.body}>
          <div className={s.head}>
            <Icon name="school" size={24} />
            <DialogTitle className={s.title}>Schools, colleges and hospitals</DialogTitle>
            <IconButton
              icon="close"
              label="Close"
              testId="ctl-receptors-close"
              onClick={() => setOpen(false)}
            />
          </div>
          <DialogContent className={mergeClasses(s.content, 'env-scroll')}>
            <p className={s.meta}>
              Each is placed at its point nearest the site; the dust model gives the site&apos;s PM10
              increment there for every hour of the programme. OpenStreetMap entries are used up to 500 m from
              the site boundary, ones you add up to 1 km.
            </p>
            {status === 'unavailable' && (
              <div className={s.note} data-testid="receptors-osm-unavailable">
                OpenStreetMap could not be reached for this site, so nearby schools and hospitals were not
                looked up. Add them below; the check retries on the next load.
              </div>
            )}
            {within.length > 0 && (
              <div className={s.note}>
                The plot lies within {within.join(', ')}: the site-boundary values apply to it.
              </div>
            )}
            <ul className={s.list} data-testid="receptors-list">
              {listed.length === 0 && (
                <li className={s.meta}>
                  {status === 'unavailable'
                    ? 'None checked yet.'
                    : 'None mapped within 500 m of the site boundary.'}
                </li>
              )}
              {listed.map((r) => {
                const userId = r.source === 'user' ? r.id.replace(/^user/, '') : null;
                return (
                  <li key={r.id} className={s.item}>
                    <Icon
                      name={/hospital|clinic|nursing/.test(r.kind) ? 'local_hospital' : 'school'}
                      size={18}
                    />
                    <div className={s.grow}>
                      <div>{r.name}</div>
                      <div className={s.muted}>
                        {LABEL[r.kind] ?? r.kind} · {Math.round(r.distanceM)} m from the site ·{' '}
                        {r.day.pm10Inc.toFixed(1)} µg/m³ on the selected day ·{' '}
                        {r.source === 'user' ? 'added by you' : 'OpenStreetMap'}
                      </div>
                    </div>
                    {userId && (
                      <IconButton
                        icon="delete"
                        label={`Remove ${r.name}`}
                        testId={`ctl-receptor-remove-${userId}`}
                        small
                        onClick={() => remove(userId)}
                      />
                    )}
                  </li>
                );
              })}
              {userReceptors
                .filter((u) => !listed.some((r) => r.id === `user${u.id}`))
                .map((u) => {
                  // Not in the results yet: either the model is still rerunning, or it is too far away.
                  const near =
                    Math.hypot(
                      ...Object.values(
                        toLocalEN({ lon: u.lon, lat: u.lat }, { lon: site.lon, lat: site.lat }),
                      ),
                    ) <=
                    USER_RECEPTOR_RADIUS_M + 100;
                  return (
                    <li key={u.id} className={s.item}>
                      <Icon name={near ? 'hourglass_empty' : 'location_off'} size={18} />
                      <div className={s.grow}>
                        <div>{u.name}</div>
                        <div className={s.muted}>
                          {near
                            ? 'Added by you · updating results…'
                            : 'Added by you · more than 1 km from this site, not modelled'}
                        </div>
                      </div>
                      <IconButton
                        icon="delete"
                        label={`Remove ${u.name}`}
                        testId={`ctl-receptor-remove-${u.id}`}
                        small
                        onClick={() => remove(u.id)}
                      />
                    </li>
                  );
                })}
            </ul>

            <h3 className={s.h}>Add a school, college or hospital</h3>
            <div className={s.row}>
              <Field label="Name">
                <Input value={name} onChange={(_, d) => setName(d.value)} data-testid="ctl-receptor-name" />
              </Field>
              <Field label="Type">
                <select
                  className="env-field"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as UserReceptor['kind'])}
                  data-testid="ctl-receptor-kind"
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Find its location (press Enter)">
              <Input
                value={query}
                onChange={(_, d) => setQuery(d.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void search();
                }}
                contentBefore={<Icon name="search" size={18} />}
                data-testid="ctl-receptor-search"
              />
            </Field>
            {searchError && <div className={s.note}>{searchError}</div>}
            {found && (
              <>
                <ul className={s.list}>
                  {found.results.length === 0 && <li className={s.meta}>No places found.</li>}
                  {found.results.map((r, i) => (
                    <li key={`${r.lat},${r.lon}`}>
                      <button
                        type="button"
                        className={mergeClasses(s.result, 'env-state')}
                        data-testid={`ctl-receptor-result-${i}`}
                        onClick={() => {
                          setLat(r.lat.toFixed(6));
                          setLon(r.lon.toFixed(6));
                          if (!name.trim()) setName(r.label.split(',')[0]!);
                        }}
                      >
                        {r.label}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className={s.meta}>{found.attribution}</p>
              </>
            )}
            <div className={s.row}>
              <Field label="Latitude (° N)">
                <Input
                  value={lat}
                  onChange={(_, d) => {
                    const pair = parsePair(d.value);
                    if (pair) {
                      setLat(String(pair[0]));
                      setLon(String(pair[1]));
                    } else setLat(d.value);
                  }}
                  data-testid="ctl-receptor-lat"
                />
              </Field>
              <Field label="Longitude (° E)">
                <Input value={lon} onChange={(_, d) => setLon(d.value)} data-testid="ctl-receptor-lon" />
              </Field>
            </div>
            {tooFar && (
              <div className={s.note}>
                This place is {Math.round(fromCentre)} m from the site centre, beyond the 1 km the dust check
                covers.
              </div>
            )}
            <div>
              <button
                type="button"
                className="env-btn env-btn--filled env-btn--icon-lead env-state"
                disabled={!valid || tooFar}
                data-testid="ctl-receptor-add"
                onClick={() => {
                  add({ name: name.trim(), kind, lat: latN, lon: lonN });
                  setName('');
                  setQuery('');
                  setFound(null);
                  setLat('');
                  setLon('');
                }}
              >
                <Icon name="add_location_alt" size={18} />
                Add
              </button>
            </div>
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
