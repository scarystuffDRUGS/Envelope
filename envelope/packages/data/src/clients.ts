import type { BackgroundCard } from '@envelope/models';
/**
 * Upstream API request builders and normalisers (docs/DATA_SOURCES.md).
 * The server performs the fetches (with cache and snapshot fallback); the browser only
 * ever sees normalised SiteData.
 */

export const WEATHER_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'surface_pressure',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'precipitation',
  'shortwave_radiation',
  'direct_radiation',
  'diffuse_radiation',
  'direct_normal_irradiance',
  'soil_moisture_0_to_7cm',
  'boundary_layer_height',
] as const;
export type WeatherVar = (typeof WEATHER_VARS)[number];

export const AIR_VARS = ['pm10', 'pm2_5', 'dust', 'aerosol_optical_depth'] as const;
export type AirVar = (typeof AIR_VARS)[number];

/** Hourly series in UTC, one value per hour of the weather year. */
export interface HourlySeries<K extends string> {
  time: string[]; // ISO 8601 UTC, e.g. 2025-01-01T00:00
  values: Record<K, number[]>;
  /** Count of missing values filled by interpolation, per variable. */
  filled: Partial<Record<K, number>>;
}

export interface OsmBuilding {
  id: number;
  ring: [number, number][]; // [lon, lat]
  heightM: number;
  heightSource: 'height' | 'levels' | 'default';
}

export interface OsmArea {
  id: number;
  kind: 'green' | 'water' | 'residential';
  ring: [number, number][];
}

/** Sensitive land uses for the dust check (MODELS.md A.2.2): education, health care, housing. */
export type ReceptorKind =
  | 'school'
  | 'college'
  | 'university'
  | 'kindergarten'
  | 'hospital'
  | 'clinic'
  | 'nursing_home'
  | 'residential';

/** OSM amenity values read as sensitive receptors. */
export const SENSITIVE_AMENITIES = [
  'school',
  'college',
  'university',
  'kindergarten',
  'hospital',
  'clinic',
  'nursing_home',
] as const;

export interface OsmReceptor {
  id: number;
  name: string;
  kind: ReceptorKind;
  /** Representative point (node position or outline centre). */
  lon: number;
  lat: number;
  /**
   * Outline of a campus or area ([lon, lat]); the engine places the receptor at the outline
   * point nearest the site, since large campuses reach far closer than their centre.
   */
  ring?: [number, number][];
  /** Set when found through Nominatim because Overpass was down. */
  source?: 'nominatim';
  /** OSM reference ("W123", "R45", "N6") of a Nominatim result, for the outline lookup. */
  osmRef?: string;
}

export interface OsmRoad {
  id: number;
  line: [number, number][]; // [lon, lat]
  widthM: number;
}

export interface OsmData {
  buildings: OsmBuilding[];
  /** Absent in snapshots taken before roads were added. */
  roads?: OsmRoad[];
  areas: OsmArea[];
  receptors: OsmReceptor[];
}

export type ProvenanceStatus = 'live' | 'cached' | 'snapshot' | 'unavailable';

export interface Provenance {
  source: string;
  status: ProvenanceStatus;
  fetchedAt: string | null;
  url: string;
  attribution: string;
}

/**
 * Station-corrected background PM (D-038, MODELS.md A.8), computed by the server from CAMS + ERA5.
 * Inside the trained area the series replace CAMS as the dust background; the raw CAMS series stay
 * in `airQuality` for display.
 */
export interface BackgroundCorrection {
  status: 'corrected' | 'outside' | 'unavailable';
  model: { id: string; region: string; trainedAreaKm: number; period: { from: string; to: string } };
  /** Model card for the report (training data, held-out metrics, limitations), without the station list. */
  card: Omit<BackgroundCard, 'stations'>;
  nearestStation: { name: string; km: number } | null;
  /** Same time axis as airQuality; present only when status is 'corrected'. */
  pm10?: number[];
  pm2_5?: number[];
}

export interface SiteData {
  site: { lat: number; lon: number; elevationM: number | null };
  weatherYear: number;
  weather: HourlySeries<WeatherVar> | null;
  airQuality: HourlySeries<AirVar> | null;
  osm: OsmData | null;
  /** 'receptors' = the separate schools/hospitals query; absent in older cached responses. */
  provenance: Record<'weather' | 'airQuality' | 'osm', Provenance> & { receptors?: Provenance };
  /** Absent from responses of older servers and from the offline error fallback. */
  background?: BackgroundCorrection;
}

export function archiveUrl(lat: number, lon: number, year: number): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    timezone: 'GMT',
    wind_speed_unit: 'ms',
    hourly: WEATHER_VARS.join(','),
  });
  return `https://archive-api.open-meteo.com/v1/archive?${p}`;
}

export function airQualityUrl(lat: number, lon: number, year: number): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    timezone: 'GMT',
    hourly: AIR_VARS.join(','),
  });
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${p}`;
}

export function overpassQuery(lat: number, lon: number, radiusM: number): string {
  const r = Math.round(radiusM);
  return `[out:json][timeout:60];
(
  way["building"](around:${r},${lat},${lon});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service)$"](around:${r},${lat},${lon});
  way["leisure"~"park|garden"](around:${r},${lat},${lon});
  way["landuse"~"grass|forest|meadow|recreation_ground|residential"](around:${r},${lat},${lon});
  way["natural"~"wood|scrub|water"](around:${r},${lat},${lon});
);
out tags geom;`;
}

/**
 * Schools, colleges, universities, kindergartens, hospitals, clinics and nursing homes around the
 * site: a separate, light query, so receptors survive when the heavy buildings query times out.
 */
export function receptorQuery(lat: number, lon: number, radiusM: number): string {
  const r = Math.round(radiusM);
  return `[out:json][timeout:25];
nwr["amenity"~"^(${SENSITIVE_AMENITIES.join('|')})$"](around:${r},${lat},${lon});
out tags geom;`;
}

/**
 * Fallback when every Overpass instance is down (D-031): OpenStreetMap Nominatim search for one
 * amenity inside a box `radiusM` around the site. Same OSM data, but points and bounding boxes
 * instead of outlines, and at most 40 results per amenity.
 */
export function nominatimReceptorUrl(lat: number, lon: number, radiusM: number, amenity: string): string {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const p = new URLSearchParams({
    format: 'jsonv2',
    amenity,
    viewbox: [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map((v) => v.toFixed(5)).join(','),
    bounded: '1',
    limit: '40',
  });
  return `https://nominatim.openstreetmap.org/search?${p}`;
}

interface NominatimPlace {
  osm_type?: string;
  osm_id: number;
  category?: string;
  type?: string;
  name?: string;
  lat: string;
  lon: string;
  /** [south, north, west, east] as strings. */
  boundingbox?: string[];
}

/** Nominatim results for one amenity → receptors; a box wider than 15 m stands in for the outline. */
export function normaliseNominatimReceptors(amenity: ReceptorKind, body: NominatimPlace[]): OsmReceptor[] {
  return body
    .filter((r) => r.category === 'amenity' && r.type === amenity)
    .map((r) => {
      const [s, n, w, e] = (r.boundingbox ?? []).map(Number);
      const lat = Number(r.lat);
      const box =
        s !== undefined &&
        n !== undefined &&
        w !== undefined &&
        e !== undefined &&
        (n - s) * 111_320 > 15 &&
        (e - w) * 111_320 * Math.cos((lat * Math.PI) / 180) > 15;
      return {
        id: r.osm_id,
        ...(r.osm_type ? { osmRef: `${r.osm_type[0]!.toUpperCase()}${r.osm_id}` } : {}),
        name: r.name || UNNAMED[amenity],
        kind: amenity,
        lat,
        lon: Number(r.lon),
        source: 'nominatim' as const,
        ...(box
          ? {
              ring: [
                [w!, s!],
                [e!, s!],
                [e!, n!],
                [w!, n!],
                [w!, s!],
              ] as [number, number][],
            }
          : {}),
      };
    });
}

/** Nominatim /lookup with outlines for ways and relations ("W123", "R45"), at most 50 per call. */
export function nominatimLookupUrl(osmRefs: string[]): string {
  const p = new URLSearchParams({ format: 'jsonv2', osm_ids: osmRefs.join(','), polygon_geojson: '1' });
  return `https://nominatim.openstreetmap.org/lookup?${p}`;
}

type GeoJsonArea =
  | { type: 'Polygon'; coordinates: [number, number][][] }
  | { type: 'MultiPolygon'; coordinates: [number, number][][][] }
  | { type: string; coordinates?: unknown };

/** Outer ring(s) of a lookup result's GeoJSON as one point list ([lon, lat]); null for points and lines. */
export function outlineFromGeojson(g: GeoJsonArea | undefined): [number, number][] | null {
  if (!g) return null;
  if (g.type === 'Polygon') return (g.coordinates as [number, number][][])[0] ?? null;
  if (g.type === 'MultiPolygon')
    return (g.coordinates as [number, number][][][]).flatMap((poly) => poly[0] ?? []);
  return null;
}

/** Replaces bounding boxes with the outlines from a /lookup response, matched by OSM reference. */
export function applyNominatimOutlines(
  receptors: OsmReceptor[],
  lookup: { osm_type?: string; osm_id: number; geojson?: GeoJsonArea }[],
): OsmReceptor[] {
  const rings = new Map<string, [number, number][]>();
  for (const l of lookup) {
    const ring = outlineFromGeojson(l.geojson);
    if (l.osm_type && ring && ring.length >= 3) rings.set(`${l.osm_type[0]!.toUpperCase()}${l.osm_id}`, ring);
  }
  return receptors.map((r) => {
    const ring = r.osmRef ? rings.get(r.osmRef) : undefined;
    return ring ? { ...r, ring } : r;
  });
}

/** Fills nulls by linear interpolation (edges hold the nearest value; all-null → 0). */
export function fillGaps(raw: (number | null)[]): { values: number[]; filled: number } {
  const out = new Array<number>(raw.length);
  let filled = 0;
  let last = -1;
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      if (last === -1 && i > 0) for (let j = 0; j < i; j++) out[j] = v;
      else if (last >= 0 && i - last > 1) {
        const a = out[last]!;
        for (let j = last + 1; j < i; j++) out[j] = a + ((v - a) * (j - last)) / (i - last);
      }
      out[i] = v;
      last = i;
    } else filled++;
  }
  if (last === -1) return { values: raw.map(() => 0), filled };
  for (let j = last + 1; j < raw.length; j++) out[j] = out[last]!;
  return { values: out, filled };
}

export function normaliseHourly<K extends string>(
  body: { hourly?: Record<string, (number | null)[] | string[]> },
  vars: readonly K[],
): HourlySeries<K> {
  const h = body.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error('Open-Meteo response has no hourly.time');
  const time = h.time as string[];
  const values = {} as Record<K, number[]>;
  const filled: Partial<Record<K, number>> = {};
  for (const k of vars) {
    const series = (h[k] as (number | null)[] | undefined) ?? time.map(() => null);
    const r = fillGaps(series);
    values[k] = r.values;
    if (r.filled) filled[k] = r.filled;
  }
  return { time, values, filled };
}

const LEVEL_HEIGHT_M = 3.2; // src: HANDOVER A.1 (building:levels × 3.2 m) [verify]
const DEFAULT_HEIGHT_M = 9; // src: HANDOVER A.1 default when untagged [verify per city]
const LANE_WIDTH_M = 3.5; // src: HANDOVER A.1 (buffered roads, lanes × 3.5 m)
/** Default lanes when untagged, by highway class [verify]. */
const DEFAULT_LANES: Record<string, number> = {
  motorway: 4,
  trunk: 4,
  primary: 2,
  secondary: 2,
  tertiary: 2,
  unclassified: 2,
  residential: 1.5,
  service: 1,
};

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  members?: { type: string; role?: string; geometry?: { lat: number; lon: number }[] }[];
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  tags?: Record<string, string>;
}

function centreOf(el: OverpassElement): { lat: number; lon: number } | null {
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lon: el.lon };
  if (el.center) return el.center;
  if (el.geometry?.length) {
    const g = el.geometry;
    return {
      lat: g.reduce((s, p) => s + p.lat, 0) / g.length,
      lon: g.reduce((s, p) => s + p.lon, 0) / g.length,
    };
  }
  if (el.bounds)
    return { lat: (el.bounds.minlat + el.bounds.maxlat) / 2, lon: (el.bounds.minlon + el.bounds.maxlon) / 2 };
  return null;
}

const UNNAMED: Record<ReceptorKind, string> = {
  school: 'Unnamed school',
  college: 'Unnamed college',
  university: 'Unnamed university',
  kindergarten: 'Unnamed kindergarten',
  hospital: 'Unnamed hospital',
  clinic: 'Unnamed clinic',
  nursing_home: 'Unnamed nursing home',
  residential: 'Residential area',
};

export function normaliseOverpass(body: { elements?: OverpassElement[] }): OsmData {
  const buildings: OsmBuilding[] = [];
  const areas: OsmArea[] = [];
  const receptors: OsmReceptor[] = [];
  const roads: OsmRoad[] = [];
  for (const el of body.elements ?? []) {
    const t = el.tags ?? {};
    const ring = el.geometry?.map((p) => [p.lon, p.lat] as [number, number]);
    const amenity = t.amenity;
    if (amenity && (SENSITIVE_AMENITIES as readonly string[]).includes(amenity)) {
      // Relations (multipolygon campuses) carry their outline in the outer members.
      const outline =
        ring ??
        el.members
          ?.filter((m) => m.role !== 'inner')
          .flatMap((m) => m.geometry ?? [])
          .map((p) => [p.lon, p.lat] as [number, number]);
      const c = centreOf(el) ?? (outline?.length ? { lon: outline[0]![0], lat: outline[0]![1] } : null);
      if (c)
        receptors.push({
          id: el.id,
          name: t.name ?? t['name:en'] ?? UNNAMED[amenity as ReceptorKind],
          kind: amenity as ReceptorKind,
          lat: c.lat,
          lon: c.lon,
          ...(outline && outline.length >= 3 ? { ring: outline } : {}),
        });
      if (!t.building) continue;
    }
    if (t.highway && ring && ring.length >= 2) {
      const lanes = parseFloat(t.lanes ?? '') || DEFAULT_LANES[t.highway] || 1;
      roads.push({ id: el.id, line: ring, widthM: lanes * LANE_WIDTH_M });
      continue;
    }
    if (!ring || ring.length < 4) continue;
    if (t.building) {
      const h = parseFloat(t.height ?? '');
      const lv = parseFloat(t['building:levels'] ?? '');
      if (Number.isFinite(h) && h > 0)
        buildings.push({ id: el.id, ring, heightM: h, heightSource: 'height' });
      else if (Number.isFinite(lv) && lv > 0)
        buildings.push({ id: el.id, ring, heightM: lv * LEVEL_HEIGHT_M, heightSource: 'levels' });
      else buildings.push({ id: el.id, ring, heightM: DEFAULT_HEIGHT_M, heightSource: 'default' });
    } else if (t.landuse === 'residential') {
      areas.push({ id: el.id, kind: 'residential', ring });
      const c = centreOf(el);
      if (c)
        receptors.push({ id: el.id, name: t.name ?? 'Residential area', kind: 'residential', ...c, ring });
    } else if (t.natural === 'water') areas.push({ id: el.id, kind: 'water', ring });
    else areas.push({ id: el.id, kind: 'green', ring });
  }
  return { buildings, roads, areas, receptors };
}
