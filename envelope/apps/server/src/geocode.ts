/**
 * Address search for the import dialog when the map is not Google 3D tiles (with Google tiles the
 * browser uses Google geocoding through Cesium ion, as Google's tile terms require). OpenStreetMap
 * Nominatim usage policy: at most 1 request a second, an identifying User-Agent, cached results, no
 * search-as-you-type (the dialog searches on Enter). Results are limited to India (D-027).
 */
import { FileCache } from './cache';
import { env } from './env';

export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
}

const cache = new FileCache(env.cacheDir);
const URL_BASE = 'https://nominatim.openstreetmap.org/search';
export const NOMINATIM_USER_AGENT = 'Envelope/0.1 (hackathon demo; construction impact screening)';
let nextSlot = 0;

/** Serialises Nominatim calls (search and the receptor fallback) to at most one per second per instance. */
export async function nominatimSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + 1000;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

export async function geocode(q: string): Promise<GeocodeResult[]> {
  const query = q.trim().slice(0, 200);
  const key = `geocode:${query.toLowerCase()}`;
  const hit = await cache.get<GeocodeResult[]>(key);
  if (hit) return hit.data;
  await nominatimSlot();
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', countrycodes: 'in' });
  const ctrl = AbortSignal.timeout(10_000);
  const res = await fetch(`${URL_BASE}?${params}`, {
    signal: ctrl,
    headers: {
      'User-Agent': NOMINATIM_USER_AGENT,
      'Accept-Language': 'en',
    },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const body = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  const results = body.map((r) => ({ label: r.display_name, lat: Number(r.lat), lon: Number(r.lon) }));
  await cache.set(key, 'geocode', results).catch(() => undefined);
  return results;
}
