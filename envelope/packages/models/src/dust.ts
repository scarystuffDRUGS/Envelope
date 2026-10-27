/**
 * Dust module (MODELS.md A.2): emission factors, wind erosion, Pasquill–Turner stability,
 * Briggs urban dispersion and the Gaussian plume. Units: SI unless noted.
 */

// ---------- Emission factors ----------

/** AP-42 13.2.4 eq. 1, material handling (kg/Mg). U wind speed (m/s), M moisture (%). */
export function ap42DropKgPerMg(k: number, U: number, M: number): number {
  return (k * 0.0016 * Math.pow(U / 2.2, 1.3)) / Math.pow(M / 2, 1.4); // src: AP-42 13.2.4, eq. 1
}
export const K_DROP = { PM10: 0.35, PM25: 0.053 } as const; // src: AP-42 13.2.4, particle size multipliers

/** AP-42 13.2.2 eq. 1a, unpaved industrial roads, converted to g per vehicle-km. */
export function ap42UnpavedGPerVkt(size: 'PM10' | 'PM25', siltPct: number, wTons: number): number {
  const k = size === 'PM10' ? 1.5 : 0.15; // src: AP-42 13.2.2, Table 13.2.2-2
  const lbPerVmt = k * Math.pow(siltPct / 12, 0.9) * Math.pow(wTons / 3, 0.45); // a = 0.9, b = 0.45
  return lbPerVmt * 281.9; // 1 lb/VMT = 281.9 g/VKT
}

/** WRAP (2006) construction activity: short ton/acre/month → Mg/ha/month. */
export const SHORT_TON_PER_ACRE_TO_MG_PER_HA = 2.2417; // src: unit conversion, HANDOVER A.2.1

// ---------- Wind erosion (AP-42 13.2.5, industrial wind erosion, 11/06) ----------

/** AP-42 13.2.5 aerodynamic particle size multipliers for Equation 2. */
export const K_EROSION = { PM10: 0.5, PM25: 0.075 } as const; // src: AP-42 13.2.5, multipliers table

/** Erosion potential P (g/m²) of a dry, exposed surface for one period between disturbances. AP-42 13.2.5 eq. 3. */
export function erosionPotential(ustar: number, ustarT: number): number {
  if (ustar <= ustarT) return 0;
  const d = ustar - ustarT;
  return 58 * d * d + 25 * d; // src: AP-42 13.2.5, eq. 3
}

/** Friction velocity (m/s) of a flat exposed area from the 10 m fastest mile, z0 = 0.5 cm. AP-42 13.2.5 eq. 4. */
export function flatFrictionVelocity(fastestMile10: number): number {
  return 0.053 * fastestMile10; // src: AP-42 13.2.5, eq. 4
}

/**
 * Subareas of a conical pile by surface-to-approach wind ratio us/ur (pile A, Table 13.2.5-3;
 * the 0.2a and 0.2b regimes are merged). Friction velocity on a subarea: u* = 0.10·us (eq. 7),
 * us = (us/ur)·u⁺10 (eq. 6).
 */
export const CONICAL_PILE_SUBAREAS = [
  { ratio: 0.2, share: 0.4 },
  { ratio: 0.6, share: 0.48 },
  { ratio: 0.9, share: 0.12 },
] as const; // src: AP-42 13.2.5, Table 13.2.5-3 (pile A: 5% + 35%, 48%, 12%)

/**
 * PM10 mass (g) from one wind-erosion event: AP-42 13.2.5 eq. 2 for a single disturbance period,
 * flat exposed soil (eq. 4) plus conical stockpiles (eqs. 6–7). `flatFactor` and `pileFactor`
 * are the shares left after controls (1 = uncontrolled).
 */
export function erosionEventPm10G(
  fastestMile10: number,
  ustarT: number,
  flatAreaM2: number,
  pileAreaM2: number,
  flatFactor: number,
  pileFactor: number,
): number {
  const flat = erosionPotential(flatFrictionVelocity(fastestMile10), ustarT) * flatAreaM2 * flatFactor;
  const pile = CONICAL_PILE_SUBAREAS.reduce(
    (s, sub) => s + erosionPotential(0.1 * sub.ratio * fastestMile10, ustarT) * sub.share * pileAreaM2,
    0,
  );
  return K_EROSION.PM10 * (flat + pile * pileFactor);
}

// ---------- Stability and dispersion ----------

export type StabilityClass = 'A' | 'A-B' | 'B' | 'B-C' | 'C' | 'C-D' | 'D' | 'E' | 'F';
export type BriggsGroup = 'AB' | 'C' | 'D' | 'EF';

const DAY: Record<'strong' | 'moderate' | 'slight', StabilityClass[]> = {
  strong: ['A', 'A-B', 'B', 'C', 'C'],
  moderate: ['A-B', 'B', 'B-C', 'C-D', 'D'],
  slight: ['B', 'C', 'C', 'D', 'D'],
};
const NIGHT_CLOUDY: StabilityClass[] = ['E', 'E', 'D', 'D', 'D'];
const NIGHT_CLEAR: StabilityClass[] = ['F', 'F', 'E', 'D', 'D'];

/** Pasquill–Turner class from U10, incoming shortwave (W/m²) and cloud cover (%). HANDOVER A.2.2 table. */
export function stabilityClass(U10: number, shortwave: number, cloudPct: number): StabilityClass {
  const row = U10 < 2 ? 0 : U10 < 3 ? 1 : U10 < 5 ? 2 : U10 <= 6 ? 3 : 4;
  if (cloudPct >= 87.5) return 'D'; // overcast (8/8 and near) day or night
  if (shortwave > 5) {
    const band = shortwave > 600 ? 'strong' : shortwave >= 300 ? 'moderate' : 'slight';
    return DAY[band][row]!;
  }
  return (cloudPct >= 50 ? NIGHT_CLOUDY : NIGHT_CLEAR)[row]!;
}

export function briggsGroup(c: StabilityClass): BriggsGroup {
  if (c === 'A' || c === 'A-B' || c === 'B') return 'AB';
  if (c === 'B-C' || c === 'C') return 'C';
  if (c === 'C-D' || c === 'D') return 'D';
  return 'EF';
}

/** Briggs urban σy, σz (m) at downwind distance x (m). HANDOVER A.2.2. */
export function briggsUrban(g: BriggsGroup, x: number): { sy: number; sz: number } {
  const yf = Math.pow(1 + 0.0004 * x, -0.5);
  switch (g) {
    case 'AB':
      return { sy: 0.32 * x * yf, sz: 0.24 * x * Math.pow(1 + 0.001 * x, 0.5) };
    case 'C':
      return { sy: 0.22 * x * yf, sz: 0.2 * x };
    case 'D':
      return { sy: 0.16 * x * yf, sz: 0.14 * x * Math.pow(1 + 0.0003 * x, -0.5) };
    case 'EF':
      return { sy: 0.11 * x * yf, sz: 0.08 * x * Math.pow(1 + 0.0015 * x, -0.5) };
  }
}

export const WIND_EXPONENT: Record<BriggsGroup, number> = { AB: 0.15, C: 0.2, D: 0.25, EF: 0.3 }; // src: HANDOVER A.2.2 (urban)
/** Used only when the weather data has no boundary-layer height. [verify] */
export const DEFAULT_MIXING_HEIGHT_M: Record<BriggsGroup, number> = { AB: 1500, C: 1000, D: 800, EF: 300 };

/** Wind at release height H: power law, U10 floored at 0.5 (calm), result floored at 1.0 m/s. */
export function windAtHeight(U10: number, H: number, g: BriggsGroup): number {
  return Math.max(1.0, Math.max(0.5, U10) * Math.pow(Math.max(H, 1) / 10, WIND_EXPONENT[g]));
}

/**
 * Gaussian plume concentration (g/m³) with ground reflection; uniformly mixed form when
 * σz > 1.6·h_mix. Q g/s, u m/s, y crosswind m, z receptor height, H release height.
 */
export function plume(
  Q: number,
  u: number,
  sy: number,
  sz: number,
  y: number,
  z: number,
  H: number,
  hmix: number,
): number {
  if (sz > 1.6 * hmix)
    return (Q / (Math.sqrt(2 * Math.PI) * u * sy * hmix)) * Math.exp((-y * y) / (2 * sy * sy));
  const lateral = Math.exp((-y * y) / (2 * sy * sy));
  const vertical = Math.exp(-((z - H) ** 2) / (2 * sz * sz)) + Math.exp(-((z + H) ** 2) / (2 * sz * sz));
  return (Q / (2 * Math.PI * u * sy * sz)) * lateral * vertical;
}

/** A virtual point source: one ≤ 10 m sub-square of the site (HANDOVER A.2.2). */
export interface SubSource {
  e: number;
  n: number;
  /** Share of the site emission rate (sums to 1). */
  share: number;
  sy0: number;
  sz0: number;
  H: number;
}

/**
 * Site increment (µg/m³ per g/s of total site emission) at a point, summed over sub-sources.
 * Wind direction is meteorological (the direction the wind comes from, degrees).
 */
export function unitConcentration(
  sources: readonly SubSource[],
  pe: number,
  pn: number,
  z: number,
  windFromDeg: number,
  u: number,
  g: BriggsGroup,
  hmix: number,
): number {
  const th = (windFromDeg * Math.PI) / 180;
  const dx = -Math.sin(th); // downwind unit vector (east, north)
  const dy = -Math.cos(th);
  let c = 0;
  for (const s of sources) {
    const de = pe - s.e;
    const dn = pn - s.n;
    const x = de * dx + dn * dy;
    if (x <= 0) continue;
    const y = -de * dy + dn * dx;
    const b = briggsUrban(g, x);
    const sy = Math.hypot(b.sy, s.sy0);
    if (y * y > 25 * sy * sy) continue; // beyond 5σy the lateral term is < 4e-6 of the centreline
    const sz = Math.hypot(b.sz, s.sz0);
    c += plume(s.share, u, sy, sz, y, z, s.H, hmix);
  }
  return c * 1e6; // g/m³ → µg/m³
}

// ---------- Site emissions ----------

export interface DustControls {
  sprinkling: boolean;
  pavedRoads: boolean;
  windBarriers: boolean;
  coverStockpiles: boolean;
  greenNetting: boolean;
  antiSmogGun: boolean;
  wheelWashing: boolean;
  /** Stop dusty work when U10 exceeds this (m/s); null = off. */
  highWindStopMs: number | null;
}

/** Control efficiencies, HANDOVER Appendix C defaults [verify]. */
export const CONTROL_EFFICIENCY = {
  sprinkling: 0.55,
  /** Watering of the work area, applied to general construction activity (WRAP 2006 control measure) [verify]. */
  sprinklingActivity: 0.5,
  pavedRoads: 0.9,
  windBarriers: 0.5,
  coverStockpiles: 0.9,
  greenNetting: 0.3,
  antiSmogGun: 0.3, // low evidence; flagged in the UI
  wheelWashing: 0.8,
} as const;

export const NO_DUST_CONTROLS: DustControls = {
  sprinkling: false,
  pavedRoads: false,
  windBarriers: false,
  coverStockpiles: false,
  greenNetting: false,
  antiSmogGun: false,
  wheelWashing: false,
  highWindStopMs: null,
};

export interface HourMet {
  U10: number;
  windFromDeg: number;
  tempC: number;
  pressureHpa: number;
  precipMm: number;
  soilMoisture: number;
  shortwave: number;
  cloudPct: number;
  blhM: number;
}

export interface SiteDustContext {
  phase: 'excavation' | 'structure' | 'finishing';
  working: boolean;
  plotAreaM2: number;
  footprintAreaM2: number;
  /** Material handled in the phase, Mg per working hour. */
  handledMgPerHour: number;
  /** On-site haul VKT per working hour. */
  vktPerHour: number;
  workingHoursPerMonth: number;
  /**
   * This hour carries the wind-erosion event of its disturbance period (the windiest dry hour of
   * the day; the site is disturbed daily, AP-42 13.2.5 N = 365). Erosion is zero in other hours.
   */
  erosionEvent: boolean;
}

export interface EmissionBreakdown {
  activity: number;
  erosion: number;
  handling: number;
  haul: number;
  trackout: number;
  total: number;
}

type DustParams = {
  wrapGeneral: number;
  wrapEarthmoving: number;
  pm25ShareActivity: number;
  ustarT0: number;
  fastestMileFactor: number;
  stockpileAreaM2: number;
  materialMoisturePct: number;
  siltPct: number;
  meanVehicleWeightT: number;
  trackoutShare: number;
};

/** Hourly site emission rates (g/s) by source for PM10 and PM2.5 (MODELS.md A.2.1). */
export function siteEmissions(
  met: HourMet,
  ctx: SiteDustContext,
  a: DustParams,
  ctl: DustControls,
): { pm10: EmissionBreakdown; pm25: EmissionBreakdown } {
  const rain = met.precipMm > 0.25;
  const stopped = ctl.highWindStopMs !== null && met.U10 > ctl.highWindStopMs;
  const work = ctx.working && !stopped;

  // 1. General construction activity (WRAP 2006).
  const factor = ctx.phase === 'excavation' ? a.wrapEarthmoving : a.wrapGeneral;
  const mgPerMonth = factor * SHORT_TON_PER_ACRE_TO_MG_PER_HA * (ctx.plotAreaM2 / 10_000);
  const watering = ctl.sprinkling ? 1 - CONTROL_EFFICIENCY.sprinklingActivity : 1;
  const activity10 = work ? ((mgPerMonth * 1e6) / (ctx.workingHoursPerMonth * 3600)) * watering : 0;

  // 2. Wind erosion of exposed soil and stockpiles (AP-42 13.2.5): one event per daily disturbance
  // period, released in its windiest dry hour. Fastest mile = hourly mean U10 × gust factor.
  const exposedSoil = ctx.phase === 'excavation' ? ctx.plotAreaM2 : ctx.plotAreaM2 - ctx.footprintAreaM2;
  const barrier = ctl.windBarriers ? 1 - CONTROL_EFFICIENCY.windBarriers : 1;
  const cover = ctl.coverStockpiles ? 1 - CONTROL_EFFICIENCY.coverStockpiles : 1;
  const erosion10 =
    ctx.erosionEvent && !rain
      ? erosionEventPm10G(
          met.U10 * a.fastestMileFactor,
          a.ustarT0,
          exposedSoil,
          a.stockpileAreaM2,
          barrier,
          cover * barrier,
        ) / 3600
      : 0;

  // 3. Material handling (AP-42 13.2.4).
  const netting = ctl.greenNetting && ctx.phase !== 'excavation' ? 1 - CONTROL_EFFICIENCY.greenNetting : 1;
  const U = Math.max(met.U10, 0.5);
  const drop = (k: number) =>
    work
      ? (ap42DropKgPerMg(k, U, a.materialMoisturePct) * ctx.handledMgPerHour * 1000 * barrier * netting) /
        3600
      : 0;

  // 4. Haul traffic on unpaved roads (AP-42 13.2.2) and trackout.
  const haulCtl =
    (ctl.sprinkling ? 1 - CONTROL_EFFICIENCY.sprinkling : 1) *
    (ctl.pavedRoads ? 1 - CONTROL_EFFICIENCY.pavedRoads : 1);
  const haulRaw = (size: 'PM10' | 'PM25') =>
    work && !rain ? (ap42UnpavedGPerVkt(size, a.siltPct, a.meanVehicleWeightT) * ctx.vktPerHour) / 3600 : 0;
  const wash = ctl.wheelWashing ? 1 - CONTROL_EFFICIENCY.wheelWashing : 1;

  const mk = (activity: number, erosion: number, handling: number, haulRawV: number): EmissionBreakdown => {
    const haul = haulRawV * haulCtl;
    const trackout = haulRawV * a.trackoutShare * wash;
    return {
      activity,
      erosion,
      handling,
      haul,
      trackout,
      total: activity + erosion + handling + haul + trackout,
    };
  };
  return {
    pm10: mk(activity10, erosion10, drop(K_DROP.PM10), haulRaw('PM10')),
    pm25: mk(
      activity10 * a.pm25ShareActivity,
      (erosion10 * K_EROSION.PM25) / K_EROSION.PM10,
      drop(K_DROP.PM25),
      haulRaw('PM25'),
    ),
  };
}

/** Splits a convex plot (local metres) into ≤ 10 m virtual point sources (HANDOVER A.2.2). */
export function plotSubSources(
  plot: readonly { e: number; n: number }[],
  plumeTopM: number,
  maxSide = 10,
): SubSource[] {
  // src: US EPA (2012) Haul Road Workgroup: release height = top/2, initial σz = top/2.15.
  const releaseHeightM = plumeTopM / 2;
  const es = plot.map((p) => p.e);
  const ns = plot.map((p) => p.n);
  const [e0, e1, n0, n1] = [Math.min(...es), Math.max(...es), Math.min(...ns), Math.max(...ns)];
  const nx = Math.ceil((e1 - e0) / maxSide);
  const ny = Math.ceil((n1 - n0) / maxSide);
  const w = (e1 - e0) / nx;
  const h = (n1 - n0) / ny;
  const inside = (e: number, n: number) => {
    let s = 0;
    for (let i = 0; i < plot.length; i++) {
      const p = plot[i]!;
      const q = plot[(i + 1) % plot.length]!;
      const cross = (q.e - p.e) * (n - p.n) - (q.n - p.n) * (e - p.e);
      if (cross !== 0) {
        if (s === 0) s = Math.sign(cross);
        else if (Math.sign(cross) !== s) return false;
      }
    }
    return true;
  };
  const pts: SubSource[] = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const e = e0 + (i + 0.5) * w;
      const n = n0 + (j + 0.5) * h;
      if (inside(e, n))
        pts.push({ e, n, share: 0, sy0: Math.max(w, h) / 4.3, sz0: plumeTopM / 2.15, H: releaseHeightM });
    }
  for (const p of pts) p.share = 1 / pts.length;
  return pts;
}
