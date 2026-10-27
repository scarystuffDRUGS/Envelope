import type { AirVar, OsmData, OsmReceptor, Provenance, SiteData, WeatherVar } from '@envelope/data';
import {
  AIR_VARS,
  SENSITIVE_AMENITIES,
  WEATHER_VARS,
  airQualityUrl,
  archiveUrl,
  applyNominatimOutlines,
  nominatimLookupUrl,
  nominatimReceptorUrl,
  normaliseHourly,
  normaliseNominatimReceptors,
  normaliseOverpass,
  overpassQuery,
  receptorQuery,
} from '@envelope/data';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { correctBackground } from './background';
import type { CacheEntry } from './cache';
import { FileCache } from './cache';
import { env } from './env';
import { NOMINATIM_USER_AGENT, nominatimSlot } from './geocode';

const cache = new FileCache(env.cacheDir);
const SNAPSHOT_DIR = env.snapshotDir;

/** The committed snapshot belongs to the demo site (fixtures/demo/building.json). */
const DEMO_SITE = (() => {
  try {
    const b = JSON.parse(readFileSync(resolve(SNAPSHOT_DIR, 'building.json'), 'utf8')) as {
      site: { lat: number; lon: number };
    };
    return b.site;
  } catch {
    return null;
  }
})();

/**
 * True within 1 km of the demo site. Only there may a live fetch refresh the committed snapshot,
 * and only there may the snapshot stand in when live data and cache both fail: an imported
 * building elsewhere must never get, or overwrite, Gurugram's data (import plan, D-027).
 */
export function isDemoSite(lat: number, lon: number): boolean {
  if (!DEMO_SITE) return false;
  const dLat = (lat - DEMO_SITE.lat) * 111_320;
  const dLon = (lon - DEMO_SITE.lon) * 111_320 * Math.cos((DEMO_SITE.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon) <= 1000;
}
const FRESH_MS = 24 * 3600_000;
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// Public mirrors, tried in order when the main instance is overloaded (frequent 504s).
const OVERPASS_MIRRORS = [
  OVERPASS_URL,
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/**
 * Overpass is often overloaded. Each query kind has a total time budget across mirrors, so a
 * site-data request never stalls for long, and after every mirror fails that kind is skipped for
 * 5 minutes. The heavy buildings query and the light receptor query are tracked separately, so
 * one failing does not block the other (D-029).
 */
const overpassDownUntil: Record<'osm' | 'receptors', number> = { osm: 0, receptors: 0 };
const OVERPASS_RETRY_MS = 5 * 60_000;
const OVERPASS_BUDGET_MS = { osm: 20_000, receptors: 15_000 };

async function fetchOverpass(q: string, kind: 'osm' | 'receptors'): Promise<unknown> {
  if (Date.now() < overpassDownUntil[kind]) throw new Error('Overpass marked unavailable (recent failure)');
  const deadline = Date.now() + OVERPASS_BUDGET_MS[kind];
  let lastErr: unknown = new Error('Overpass time budget spent');
  // The light receptor query tries every mirror; the heavy one the first two.
  for (const url of kind === 'receptors' ? OVERPASS_MIRRORS : OVERPASS_MIRRORS.slice(0, 2)) {
    const left = deadline - Date.now();
    if (left < 2_000) break;
    try {
      return await fetchJson(
        url,
        {
          method: 'POST',
          body: new URLSearchParams({ data: q }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
        Math.min(left, kind === 'receptors' ? 8_000 : 12_000),
      );
    } catch (err) {
      lastErr = err;
    }
  }
  overpassDownUntil[kind] = Date.now() + OVERPASS_RETRY_MS;
  throw lastErr;
}
const OSM_RADIUS_M = 700;

/**
 * Schools, colleges and hospitals from Nominatim when Overpass is down (D-031): one search per
 * amenity, inside the geocoder's one-request-a-second limit. Any failed search fails the lookup,
 * so a partial list is never reported as complete.
 */
async function nominatimReceptors(lat: number, lon: number, radiusM: number): Promise<OsmReceptor[]> {
  const out: OsmReceptor[] = [];
  for (const amenity of SENSITIVE_AMENITIES) {
    await nominatimSlot();
    const body = (await fetchJson(
      nominatimReceptorUrl(lat, lon, radiusM, amenity),
      { headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept-Language': 'en' } },
      10_000,
    )) as Parameters<typeof normaliseNominatimReceptors>[1];
    out.push(...normaliseNominatimReceptors(amenity, body));
  }
  // Outlines for campuses and buildings (search gives only boxes); boxes stay if this fails.
  const refs = out.map((r) => r.osmRef).filter((x): x is string => Boolean(x && !x.startsWith('N')));
  try {
    for (let i = 0; i < refs.length; i += 50) {
      await nominatimSlot();
      const lookup = (await fetchJson(
        nominatimLookupUrl(refs.slice(i, i + 50)),
        { headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept-Language': 'en' } },
        10_000,
      )) as Parameters<typeof applyNominatimOutlines>[1];
      out.splice(0, out.length, ...applyNominatimOutlines(out, lookup));
    }
  } catch (err) {
    console.warn(`[site-data] Nominatim outline lookup failed: ${(err as Error).message}`);
  }
  return out;
}

const ATTR = {
  weather: 'Weather data by Open-Meteo.com (CC BY 4.0), ERA5 reanalysis',
  airQuality: 'Open-Meteo.com; CAMS global atmospheric composition (Copernicus)',
  osm: '© OpenStreetMap contributors (ODbL), via Overpass API',
  receptors: '© OpenStreetMap contributors (ODbL), via Overpass API: schools, colleges, hospitals',
};

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 45_000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Envelope/0.1 (hackathon demo)', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function readSnapshot<T>(name: string): Promise<CacheEntry<T> | null> {
  try {
    return JSON.parse(await readFile(resolve(SNAPSHOT_DIR, `${name}.json`), 'utf8')) as CacheEntry<T>;
  } catch {
    return null;
  }
}

async function writeSnapshot<T>(name: string, entry: CacheEntry<T>): Promise<void> {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(resolve(SNAPSHOT_DIR, `${name}.json`), JSON.stringify(entry), 'utf8');
}

/**
 * Cache-first fetch with fallbacks (demo resilience):
 * fresh cache → live → stale cache → committed snapshot → unavailable.
 */
async function resolveSource<T>(
  name: 'weather' | 'airQuality' | 'osm' | 'receptors',
  key: string,
  url: string,
  load: () => Promise<T>,
  opts: { offline: boolean; refresh: boolean; demoSite: boolean },
): Promise<{ data: T | null; prov: Provenance }> {
  const prov = (status: Provenance['status'], fetchedAt: string | null): Provenance => ({
    source: name,
    status,
    fetchedAt,
    url,
    attribution: ATTR[name],
  });
  const cached = await cache.get<T>(key);
  if (cached && !opts.refresh && FileCache.isFresh(cached, FRESH_MS))
    return { data: cached.data, prov: prov('cached', cached.fetchedAt) };
  if (!opts.offline) {
    try {
      const data = await load();
      // A failed cache write (read-only or full disk) must not discard live data.
      const entry = await cache.set(key, name, data).catch((err: Error) => {
        console.warn(`[site-data] ${name} cache write failed: ${err.message}`);
        return { key, source: name, fetchedAt: new Date().toISOString(), data };
      });
      if (env.writeSnapshots && opts.demoSite) await writeSnapshot(name, entry);
      return { data, prov: prov('live', entry.fetchedAt) };
    } catch (err) {
      console.warn(`[site-data] ${name} live fetch failed: ${(err as Error).message}`);
    }
  }
  if (cached) return { data: cached.data, prov: prov('cached', cached.fetchedAt) };
  const snap = opts.demoSite ? await readSnapshot<T>(name) : null;
  if (snap) return { data: snap.data, prov: prov('snapshot', snap.fetchedAt) };
  return { data: null, prov: prov('unavailable', null) };
}

export async function getSiteData(
  lat: number,
  lon: number,
  year: number,
  opts: { offline?: boolean; refresh?: boolean } = {},
): Promise<SiteData> {
  const o = {
    offline: Boolean(opts.offline),
    refresh: Boolean(opts.refresh),
    demoSite: isDemoSite(lat, lon),
  };
  const wUrl = archiveUrl(lat, lon, year);
  const aUrl = airQualityUrl(lat, lon, year);
  const q = overpassQuery(lat, lon, OSM_RADIUS_M);
  // Receptors up to 500 m from the plot boundary: 700 m from the centre covers plots up to ~200 m across.
  const rq = receptorQuery(lat, lon, OSM_RADIUS_M);
  const [weather, air, osm, receptors] = await Promise.all([
    resolveSource(
      'weather',
      `weather:${wUrl}`,
      wUrl,
      async () => {
        const body = (await fetchJson(wUrl)) as {
          hourly?: Record<string, (number | null)[]>;
          elevation?: number;
        };
        return { series: normaliseHourly<WeatherVar>(body, WEATHER_VARS), elevation: body.elevation ?? null };
      },
      o,
    ),
    resolveSource(
      'airQuality',
      `aq:${aUrl}`,
      aUrl,
      async () =>
        normaliseHourly<AirVar>(
          (await fetchJson(aUrl)) as { hourly?: Record<string, (number | null)[]> },
          AIR_VARS,
        ),
      o,
    ),
    resolveSource<OsmData>(
      'osm',
      `osm:${q}`,
      OVERPASS_URL,
      async () => normaliseOverpass((await fetchOverpass(q, 'osm')) as { elements?: [] }),
      o,
    ),
    resolveSource<OsmReceptor[]>(
      'receptors',
      `receptors:${rq}`,
      OVERPASS_URL,
      async () => {
        try {
          return normaliseOverpass((await fetchOverpass(rq, 'receptors')) as { elements?: [] }).receptors;
        } catch (err) {
          console.warn(
            `[site-data] receptors via Overpass failed (${(err as Error).message}); trying Nominatim`,
          );
          return await nominatimReceptors(lat, lon, OSM_RADIUS_M);
        }
      },
      o,
    ),
  ]);
  // Sensitive receptors come from their own query; older caches and the demo snapshot carry
  // them inside the OSM data instead. Residential areas always come from the OSM data.
  const fromOsm = osm.data?.receptors ?? [];
  const sensitive = receptors.data ?? fromOsm.filter((r) => r.kind !== 'residential');
  const receptorProv: Provenance =
    receptors.data || !fromOsm.some((r) => r.kind !== 'residential')
      ? receptors.prov
      : { ...osm.prov, source: 'receptors', attribution: ATTR.receptors };
  if (receptors.data?.some((r) => r.source === 'nominatim'))
    receptorProv.attribution =
      '© OpenStreetMap contributors (ODbL), via Nominatim while Overpass was unavailable';
  const osmData: OsmData | null =
    osm.data || receptors.data
      ? {
          ...(osm.data ?? { buildings: [], roads: [], areas: [] }),
          receptors: [...sensitive, ...fromOsm.filter((r) => r.kind === 'residential')],
        }
      : null;
  const series = weather.data?.series ?? null;
  return {
    site: { lat, lon, elevationM: weather.data?.elevation ?? null },
    weatherYear: year,
    weather: series,
    airQuality: air.data,
    osm: osmData,
    provenance: { weather: weather.prov, airQuality: air.prov, osm: osm.prov, receptors: receptorProv },
    background: correctBackground(
      lat,
      lon,
      series,
      air.data,
      `${lat},${lon},${year},${weather.prov.fetchedAt},${air.prov.fetchedAt}`,
    ),
  };
}
