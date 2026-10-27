/**
 * Sensitive receptors for the dust check (MODELS.md A.2.2, D-029): schools, colleges,
 * universities, kindergartens, hospitals, clinics and nursing homes, then residential areas.
 * Each sits at the point of its outline nearest the plot (a campus reaches the site long before
 * its centre does), and distance is measured from the plot boundary.
 */
import type { EN, LonLat } from './geometry';
import { toLocalEN } from './geometry';

export const SENSITIVE_KINDS = [
  'school',
  'college',
  'university',
  'kindergarten',
  'hospital',
  'clinic',
  'nursing_home',
] as const;

/** Education and health care: the receptors the NAAQS check and the KPI are about. */
export function isSensitive(kind: string): boolean {
  return (SENSITIVE_KINDS as readonly string[]).includes(kind);
}

/** Receptors found in OpenStreetMap are kept within this distance of the plot boundary. */
export const RECEPTOR_RADIUS_M = 500;
/** Receptors the user added are kept up to this distance. */
export const USER_RECEPTOR_RADIUS_M = 1000;
/** Upper limit of off-site receptors, so the hourly dispersion table stays small. */
export const MAX_RECEPTORS = 32;

export interface ReceptorCandidate {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  ring?: [number, number][];
  source: 'osm' | 'user';
}

export interface PlacedReceptor {
  id: string;
  name: string;
  kind: string;
  e: number;
  n: number;
  /** From the plot boundary (m). */
  distanceM: number;
  source: 'osm' | 'user';
}

function insideRing(p: EN, ring: readonly EN[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.n > p.n !== b.n > p.n && p.e < ((b.e - a.e) * (p.n - a.n)) / (b.n - a.n) + a.e) inside = !inside;
  }
  return inside;
}

function segmentDistance(p: EN, a: EN, b: EN): number {
  const de = b.e - a.e;
  const dn = b.n - a.n;
  const len2 = de * de + dn * dn || 1;
  const t = Math.max(0, Math.min(1, ((p.e - a.e) * de + (p.n - a.n) * dn) / len2));
  return Math.hypot(p.e - (a.e + t * de), p.n - (a.n + t * dn));
}

/** Distance (m) from a point to a polygon's boundary; 0 inside. */
export function distanceToPolygon(p: EN, poly: readonly EN[]): number {
  if (insideRing(p, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++)
    d = Math.min(d, segmentDistance(p, poly[i]!, poly[(i + 1) % poly.length]!));
  return d;
}

/** Points along a ring, at most `stepM` apart, so the nearest point to the plot is found. */
function sampleRing(ring: readonly EN[], stepM = 10): EN[] {
  const out: EN[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const n = Math.max(1, Math.min(200, Math.ceil(Math.hypot(b.e - a.e, b.n - a.n) / stepM)));
    for (let k = 0; k < n; k++) out.push({ e: a.e + ((b.e - a.e) * k) / n, n: a.n + ((b.n - a.n) * k) / n });
  }
  return out;
}

export interface ReceptorSelection {
  receptors: PlacedReceptor[];
  /**
   * Schools, colleges or hospitals whose mapped grounds contain the plot: the site-boundary
   * receptors are their exposure, so they are named rather than placed at an arbitrary point.
   */
  siteWithin: string[];
}

/** Places, filters, de-duplicates and orders receptors around a plot (local metres around `origin`). */
export function selectReceptors(
  candidates: readonly ReceptorCandidate[],
  plotEN: readonly EN[],
  origin: LonLat,
): ReceptorSelection {
  const placed: PlacedReceptor[] = [];
  const siteWithin: string[] = [];
  const centre = {
    e: plotEN.reduce((s, p) => s + p.e, 0) / plotEN.length,
    n: plotEN.reduce((s, p) => s + p.n, 0) / plotEN.length,
  };
  for (const c of candidates) {
    const ringEN = c.ring?.map(([lon, lat]) => toLocalEN({ lon, lat }, origin));
    if (ringEN && ringEN.length >= 3 && insideRing(centre, ringEN)) {
      if (isSensitive(c.kind)) siteWithin.push(c.name);
      continue;
    }
    const pts = ringEN?.length ? sampleRing(ringEN) : [toLocalEN({ lon: c.lon, lat: c.lat }, origin)];
    let best = pts[0]!;
    let bestD = Infinity;
    for (const p of pts) {
      const d = distanceToPolygon(p, plotEN);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    // A mapped area that covers the plot is the site itself, not a receptor.
    if (bestD === 0 && c.source === 'osm') continue;
    if (bestD > (c.source === 'user' ? USER_RECEPTOR_RADIUS_M : RECEPTOR_RADIUS_M)) continue;
    placed.push({
      id: c.id,
      name: c.name,
      kind: c.kind,
      e: best.e,
      n: best.n,
      distanceM: bestD,
      source: c.source,
    });
  }
  // The same school is often mapped twice (a point and a campus outline): keep the nearer one.
  const key = (r: PlacedReceptor) => `${r.kind}|${r.name.trim().toLowerCase()}`;
  const byKey = new Map<string, PlacedReceptor>();
  for (const r of placed) {
    const prev = byKey.get(key(r));
    if (!prev || r.source === 'user' || (prev.source !== 'user' && r.distanceM < prev.distanceM))
      byKey.set(key(r), r);
  }
  const unique = [...byKey.values()];
  const rank = (r: PlacedReceptor) => (isSensitive(r.kind) ? 0 : 1);
  unique.sort((a, b) => rank(a) - rank(b) || a.distanceM - b.distanceM);
  return { receptors: unique.slice(0, MAX_RECEPTORS), siteWithin: [...new Set(siteWithin)] };
}
