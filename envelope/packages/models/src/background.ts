/**
 * CAMS background PM correction (MODELS.md A.8, D-038): gradient-boosted trees trained on CPCB
 * stations (ml/train.py) map CAMS + ERA5 at the site to station-like hourly PM10 and PM2.5.
 * This file evaluates the exported trees; the feature function mirrors ml/train.py `features`
 * and a parity test checks both against Python's output.
 */

/** One tree as flat arrays: internal nodes 0..n-1; a child < 0 is leaf ~child. */
export interface FlatTree {
  root: number;
  f: number[]; // feature index
  t: number[]; // threshold (go left when value <= t)
  l: number[];
  r: number[];
  d: number[]; // 1 = missing values go left
  m: number[]; // missing type: 0 None (NaN compared as 0), 1 Zero, 2 NaN
  v: number[]; // leaf values
}

export interface BackgroundModel {
  pollutant: 'pm10' | 'pm25';
  transform: 'log1p';
  /** Duan smearing factor for the log1p back-transform. */
  smear: number;
  features: string[];
  trees: FlatTree[];
}

function tree(t: FlatTree, x: Float64Array): number {
  let n = t.root;
  while (n >= 0) {
    const raw = x[t.f[n]!]!;
    const missing = t.m[n] === 2 ? Number.isNaN(raw) : t.m[n] === 1 ? Number.isNaN(raw) || raw === 0 : false;
    const v = Number.isNaN(raw) ? 0 : raw;
    n = missing ? (t.d[n] ? t.l[n]! : t.r[n]!) : v <= t.t[n]! ? t.l[n]! : t.r[n]!;
  }
  return t.v[~n]!;
}

/** Corrected concentration (µg/m³) for one feature row, in model feature order. */
export function predictRow(model: BackgroundModel, x: Float64Array): number {
  let s = 0;
  for (const t of model.trees) s += tree(t, x);
  return Math.max(0, Math.expm1(s) * model.smear + (model.smear - 1));
}

export interface BackgroundInputs {
  /** ISO 8601 UTC hours, e.g. 2025-01-01T00:00 (Open-Meteo, timezone=GMT). */
  time: string[];
  air: Record<string, number[]>;
  weather: Record<string, number[]>;
}

const IST_MS = 5.5 * 3600_000;

/** Trailing mean over n hours (fewer at the start), as pandas rolling(n, min_periods=1). */
function rolling(a: number[], n: number, sum = false): number[] {
  const out = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0;
    let k = 0;
    for (let j = Math.max(0, i - n + 1); j <= i; j++) {
      const v = a[j]!;
      if (!Number.isNaN(v)) {
        s += v;
        k++;
      }
    }
    out[i] = k ? (sum ? s : s / k) : Number.NaN;
  }
  return out;
}

/** Day of year 1–366 of a UTC timestamp shifted to IST. */
function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86_400_000) + 1;
}

/** Feature columns by name, one value per hour (mirrors ml/train.py `features`). */
export function backgroundFeatures(inp: BackgroundInputs): Record<string, number[]> {
  const num = (a: (number | null)[] | undefined) =>
    (a ?? inp.time.map(() => Number.NaN)).map((v) => (v == null ? Number.NaN : v));
  const a = (k: string) => num(inp.air[k]);
  const w = (k: string) => num(inp.weather[k]);
  const pm10 = a('pm10');
  const pm25 = a('pm2_5');
  const dust = a('dust');
  const cols: Record<string, number[]> = {
    cams_pm10: pm10,
    cams_pm2_5: pm25,
    cams_dust: dust,
    cams_aerosol_optical_depth: a('aerosol_optical_depth'),
  };
  for (const [k, s] of [
    ['cams_pm10', pm10],
    ['cams_pm2_5', pm25],
    ['cams_dust', dust],
  ] as const) {
    cols[`${k}_mean3h`] = rolling(s, 3);
    cols[`${k}_mean24h`] = rolling(s, 24);
  }
  cols.dust_share = dust.map((d, i) => d / Math.max(1, pm10[i]!));
  cols.fine_share = pm25.map((p, i) => p / Math.max(1, pm10[i]!));
  for (const k of [
    'temperature_2m',
    'relative_humidity_2m',
    'dew_point_2m',
    'surface_pressure',
    'wind_speed_10m',
    'wind_gusts_10m',
    'cloud_cover',
    'precipitation',
    'shortwave_radiation',
    'soil_moisture_0_to_7cm',
    'boundary_layer_height',
  ])
    cols[k] = w(k);
  const dir = w('wind_direction_10m').map((d) => (d * Math.PI) / 180);
  cols.wind_dir_sin = dir.map(Math.sin);
  cols.wind_dir_cos = dir.map(Math.cos);
  cols.precip_24h = rolling(w('precipitation'), 24, true);
  cols.blh_mean24h = rolling(w('boundary_layer_height'), 24);
  const local = inp.time.map((t) => new Date(Date.parse(`${t.length === 16 ? `${t}:00` : t}Z`) + IST_MS));
  const hour = local.map((d) => d.getUTCHours() + d.getUTCMinutes() / 60);
  const doy = local.map(dayOfYear);
  cols.hour_sin = hour.map((h) => Math.sin((2 * Math.PI * h) / 24));
  cols.hour_cos = hour.map((h) => Math.cos((2 * Math.PI * h) / 24));
  cols.doy_sin = doy.map((d) => Math.sin((2 * Math.PI * d) / 365.25));
  cols.doy_cos = doy.map((d) => Math.cos((2 * Math.PI * d) / 365.25));
  // pandas dayofweek: Monday 0 … Sunday 6; JS getUTCDay: Sunday 0 … Saturday 6.
  cols.weekend = local.map((d) => (d.getUTCDay() === 0 || d.getUTCDay() === 6 ? 1 : 0));
  return cols;
}

interface CardScores {
  stations: number;
  hours: number;
  hourlyRmse: { cams: number; corrected: number };
  hourlyBias: { cams: number; corrected: number };
  dailyR2: { cams: number | null; corrected: number | null };
  exceedance: {
    limit: number;
    obsDays: number;
    cams: { days: number; pod: number | null; far: number | null };
    corrected: { days: number; pod: number | null; far: number | null };
  };
}

/** Model card written by ml/card.py: what the model was trained on and how it tested. */
export interface BackgroundCard {
  id: string;
  region: string;
  period: { from: string; to: string };
  method: string;
  inputs: string;
  target: string;
  /** A site within this distance of a training station counts as inside the trained area. */
  trainedAreaKm: number;
  stations: { id: number; name: string; lat: number; lon: number; heldOut: boolean }[];
  heldOutStations: string[];
  metrics: Record<'pm10' | 'pm25', { spatialTest: CardScores; timeTest: CardScores }>;
  timeSplit: string;
  limitations: string[];
}

/** Nearest training station to a site (great-circle km). */
export function nearestStation(card: BackgroundCard, lat: number, lon: number): { name: string; km: number } {
  const rad = Math.PI / 180;
  let best = { name: '', km: Number.POSITIVE_INFINITY };
  for (const s of card.stations) {
    const c =
      Math.sin(lat * rad) * Math.sin(s.lat * rad) +
      Math.cos(lat * rad) * Math.cos(s.lat * rad) * Math.cos((s.lon - lon) * rad);
    const km = 6371 * Math.acos(Math.min(1, c));
    if (km < best.km) best = { name: s.name, km };
  }
  return best;
}

/** Corrected hourly series for a model; NaN where an input row is entirely missing. */
export function correctSeries(model: BackgroundModel, cols: Record<string, number[]>): number[] {
  const n = cols[model.features[0]!]?.length ?? 0;
  const x = new Float64Array(model.features.length);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    model.features.forEach((f, j) => (x[j] = cols[f]?.[i] ?? Number.NaN));
    out[i] = predictRow(model, x);
  }
  return out;
}
