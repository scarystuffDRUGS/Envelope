// The package typings do not parse under TS 5.8; this local declaration replaces them.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./jsthermalcomfort.d.ts" />
/**
 * Heat module (MODELS.md A.3): sky longwave, steady-state surface energy balance,
 * simplified mean radiant temperature and UTCI for workers on the construction site.
 */
// Deep import: the package's index type declarations do not parse under TS 5.8.
import { utci as utciLib } from 'jsthermalcomfort/lib/esm/models/utci.js';

export const SIGMA = 5.670374419e-8; // Stefan–Boltzmann, W/m²K⁴

export interface SurfaceClass {
  albedo: number;
  emissivity: number;
  ef: number;
  cG: number;
}

/** Surface classes, HANDOVER A.1 table (Oke et al. 2017) [verify]. */
export const SURFACES = {
  road: { albedo: 0.1, emissivity: 0.95, ef: 0, cG: 0.4 },
  paving: { albedo: 0.25, emissivity: 0.92, ef: 0, cG: 0.35 },
  roof: { albedo: 0.2, emissivity: 0.9, ef: 0, cG: 0.2 },
  soil: { albedo: 0.25, emissivity: 0.93, ef: 0.1, cG: 0.3 },
  grass: { albedo: 0.23, emissivity: 0.96, ef: 0.5, cG: 0.15 },
  trees: { albedo: 0.15, emissivity: 0.97, ef: 0.6, cG: 0.1 },
  water: { albedo: 0.08, emissivity: 0.97, ef: 0.9, cG: 0.5 },
  urban: { albedo: 0.15, emissivity: 0.94, ef: 0.05, cG: 0.35 },
} as const satisfies Record<string, SurfaceClass>;

/** Saturation vapour pressure (hPa), Magnus form. */
export function vapourPressureHpa(dewPointC: number): number {
  return 6.112 * Math.exp((17.67 * dewPointC) / (dewPointC + 243.5));
}

/** Downwelling longwave (W/m²): Brutsaert clear sky, cloud correction, wall term. MODELS A.3.3. */
export function longwaveDown(taC: number, dewPointC: number, cloudFrac: number, svf: number): number {
  const ta = taC + 273.15;
  const ea = vapourPressureHpa(dewPointC);
  const epsClear = 1.24 * Math.pow(ea / ta, 1 / 7);
  const epsSky = Math.min(1, epsClear * (1 + 0.22 * cloudFrac * cloudFrac));
  return svf * epsSky * SIGMA * ta ** 4 + (1 - svf) * SIGMA * (ta + 2) ** 4;
}

export interface SebInput {
  /** Direct beam on the horizontal (W/m²), Open-Meteo direct_radiation. */
  directH: number;
  diffuse: number;
  /** 0 = sunlit, 1 = fully shaded from the beam. */
  shade: number;
  svf: number;
  taC: number;
  lDown: number;
  /** Near-surface wind (m/s). */
  uLocal: number;
  surface: SurfaceClass;
}

/** Steady-state surface temperature (°C) by Newton–Raphson on R_n − G − λE − H = 0. MODELS A.3.4. */
export function surfaceTemperature(i: SebInput): number {
  const s = i.surface;
  const kDown = i.directH + i.diffuse;
  const kStar = (1 - s.albedo) * (i.directH * (1 - i.shade) + i.diffuse * i.svf + 0.2 * kDown * (1 - i.svf));
  const hc = 5.7 + 3.8 * i.uLocal;
  const ta = i.taC + 273.15;
  const f = (ts: number) => {
    const rn = kStar + s.emissivity * i.lDown - s.emissivity * SIGMA * ts ** 4;
    const g = s.cG * rn;
    const le = s.ef * Math.max(0, rn - g);
    return rn - g - le - hc * (ts - ta);
  };
  let ts = ta;
  for (let k = 0; k < 30; k++) {
    const fx = f(ts);
    const d = (f(ts + 0.01) - fx) / 0.01;
    const step = fx / d;
    ts -= step;
    if (Math.abs(step) < 1e-4) break;
  }
  return ts - 273.15;
}

/** Projected-area factor of a standing person (sun altitude in degrees). MODELS A.3.5. */
export function projectedAreaFactor(altDeg: number): number {
  if (altDeg <= 0) return 0;
  return 0.308 * Math.cos(altDeg * (1 - (altDeg * altDeg) / 48402) * (Math.PI / 180));
}

export interface TmrtInput {
  dni: number;
  diffuse: number;
  globalH: number;
  altDeg: number;
  shade: number;
  svf: number;
  lDown: number;
  groundTsC: number;
  groundAlbedo: number;
  groundEmissivity: number;
}

/**
 * Mean radiant temperature at 1.1 m (°C), SOLWEIG-style simplification: direct beam on the
 * person's projected area, diffuse and longwave from the upper hemisphere, reflected shortwave
 * and ground emission from the lower hemisphere (view factor 0.5 each). a_k 0.70, ε_p 0.97.
 */
export function meanRadiantTemp(i: TmrtInput): number {
  const ak = 0.7;
  const ep = 0.97;
  const direct = projectedAreaFactor(i.altDeg) * i.dni * (1 - i.shade);
  const shortwave = ak * (direct + 0.5 * i.diffuse * i.svf + 0.5 * i.groundAlbedo * i.globalH);
  const groundLw = i.groundEmissivity * SIGMA * (i.groundTsC + 273.15) ** 4;
  const longwave = ep * (0.5 * i.lDown + 0.5 * groundLw);
  return Math.pow((shortwave + longwave) / (ep * SIGMA), 0.25) - 273.15;
}

/** UTCI (°C) from jsthermalcomfort; v10 clamped to the model's 0.5–17 m/s validity range. */
export function utci(taC: number, tmrtC: number, v10: number, rh: number): number | null {
  const v = Math.min(17, Math.max(0.5, v10));
  const r = utciLib(taC, tmrtC, v, rh) as { utci: number | null };
  return r.utci;
}

export type UtciCategory =
  | 'extreme heat stress'
  | 'very strong heat stress'
  | 'strong heat stress'
  | 'moderate heat stress'
  | 'no thermal stress'
  | 'cold stress';

/** UTCI assessment scale (Bröde et al. 2012). MODELS A.3.6. */
export function utciCategory(u: number): UtciCategory {
  if (u > 46) return 'extreme heat stress';
  if (u > 38) return 'very strong heat stress';
  if (u > 32) return 'strong heat stress';
  if (u > 26) return 'moderate heat stress';
  if (u >= 9) return 'no thermal stress';
  return 'cold stress';
}
