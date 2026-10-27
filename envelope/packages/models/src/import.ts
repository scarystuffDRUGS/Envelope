/**
 * Building import (MODELS.md A.6, D-027): the parts of turning an uploaded model into a
 * BuildingSpec that do not need the IFC parser. Pure functions, unit-tested; the browser
 * parser (apps/web/src/import) produces an ImportDraft and the dialog places it with
 * specFromDraft. The maths always uses the spec; the mesh is only for looks.
 */
import type { BuildingSpec } from './building';
import type { EN, Orientation } from './geometry';
import { facadeEdges, fromLocalEN, orientationOf, signedArea } from './geometry';

const DEG = Math.PI / 180;

/** Default window-to-wall ratio when the model has no window data (demo building value). */
export const DEFAULT_WWR = 0.4;

/** India-only placement in v1 (D-027): the engine works in IST and the rules are Indian. */
export const INDIA_BOUNDS = { latMin: 6, latMax: 37, lonMin: 68, lonMax: 98 } as const;

export function insideIndia(lat: number, lon: number): boolean {
  const b = INDIA_BOUNDS;
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
}

/**
 * IfcCompoundPlaneAngleMeasure → decimal degrees: [deg, min, sec, millionths of a second];
 * every part carries the sign of the angle (IFC4 IfcCompoundPlaneAngleMeasure).
 */
export function dmsToDegrees(parts: readonly number[]): number {
  const [d = 0, m = 0, s = 0, micro = 0] = parts;
  return d + m / 60 + s / 3600 + micro / 3.6e9;
}

/** SI prefix → factor for IfcSIUnit lengths (MILLI, CENTI, …). */
const SI_PREFIX: Record<string, number> = { MILLI: 1e-3, CENTI: 1e-2, DECI: 1e-1, KILO: 1e3 };

/**
 * Metres per model length unit. `si` = IfcSIUnit prefix (null = none, i.e. metres);
 * `conversionFactor` = metres per unit of an IfcConversionBasedUnit (feet 0.3048, inches 0.0254).
 */
export function lengthUnitToMetres(unit: {
  prefix?: string | null;
  conversionFactor?: number | null;
}): number {
  if (unit.conversionFactor && unit.conversionFactor > 0) return unit.conversionFactor;
  return unit.prefix ? (SI_PREFIX[unit.prefix] ?? 1) : 1;
}

export type Point2 = [number, number];

/** Convex hull (Andrew's monotone chain), counter-clockwise, no repeated closing point. */
export function convexHull(points: readonly Point2[]): Point2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Point2, a: Point2, b: Point2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function polygonArea(ring: readonly Point2[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/**
 * Reduces a convex ring to at most `max` vertices by repeatedly dropping the vertex whose
 * triangle with its neighbours has the smallest area (Visvalingam). Dropping a vertex of a
 * convex ring keeps it convex; the result lies inside the original by that area.
 */
export function simplifyConvex(ring: readonly Point2[], max = 12): Point2[] {
  const r = [...ring];
  const tri = (i: number) => {
    const a = r[(i - 1 + r.length) % r.length]!;
    const b = r[i]!;
    const c = r[(i + 1) % r.length]!;
    return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  };
  while (r.length > Math.max(3, max)) {
    let k = 0;
    for (let i = 1; i < r.length; i++) if (tri(i) < tri(k)) k = i;
    r.splice(k, 1);
  }
  return r;
}

/** Distance from point p to segment ab (plan metres). */
export function distanceToSegment(p: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Index of the hull edge (from vertex i to i + 1) nearest to a plan point, e.g. a window. */
export function nearestEdge(hull: readonly Point2[], p: Point2): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const d = distanceToSegment(p, hull[i]!, hull[(i + 1) % hull.length]!);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Field of the import form a warning belongs to, so the dialog shows it beside that field. */
export type DraftField =
  'file' | 'floors' | 'floorToFloorM' | 'wwr' | 'footprint' | 'location' | 'basements' | 'quantities';

export interface ImportDraft {
  kind: 'ifc' | 'mesh';
  fileName: string;
  name: string;
  use: BuildingSpec['use'];
  /** Storeys at or above ground; null when the file cannot tell (mesh uploads). */
  floors: number | null;
  floorToFloorM: number | null;
  /** Storeys below ground from the model; they set the Basements assumptions. */
  basements: { count: number; depthM: number } | null;
  /**
   * Convex footprint in model plan coordinates (m): x = model X, y = model Y, counter-clockwise,
   * centred on its own centroid, at most 12 vertices.
   */
  hull: Point2[];
  /** Window area (m²) on each hull edge i (vertex i → i + 1); null when the model has no windows. */
  edgeWindowAreaM2: number[] | null;
  /** Bearing of model +Y in degrees clockwise from true north (IFC TrueNorth); 0 when unknown. */
  northRotationDeg: number;
  /** IfcSite reference point, when the file has one other than 0, 0. */
  ifcSite: { lat: number; lon: number } | null;
  /** Concrete volume from the model's base quantities (m³), when present. */
  concreteM3: number | null;
  /** Height of a mesh above its ground level, in model units; IFC drafts leave it out. */
  heightM?: number;
  warnings: { field: DraftField; text: string }[];
}

export interface DraftPlacement {
  lat: number;
  lon: number;
  label: string;
  /** Extra rotation chosen in the dialog, degrees clockwise, added to the model's true north. */
  rotationDeg: number;
  plotBufferM: number;
}

export interface DraftEdits {
  name: string;
  use: BuildingSpec['use'];
  floors: number;
  floorToFloorM: number;
  /** WWR per orientation typed in the dialog; missing orientations come from the model. */
  wwr?: Partial<Record<Orientation, number>>;
}

/** Hull (model plan) → local east/north metres at the site, for a total bearing of model +Y. */
export function hullToEN(hull: readonly Point2[], bearingDeg: number): EN[] {
  const c = Math.cos(bearingDeg * DEG);
  const s = Math.sin(bearingDeg * DEG);
  // Model +Y points to the bearing, model +X to the bearing + 90° (clockwise).
  return hull.map(([x, y]) => ({ e: x * c + y * s, n: -x * s + y * c }));
}

/**
 * WWR per orientation from window areas per hull edge: Σ window area ÷ Σ wall area of the edges
 * facing that way (wall = edge length × building height, as in the takeoff). Orientations
 * without wall get 0; no window data gives DEFAULT_WWR everywhere.
 */
export function wwrFromEdges(
  footprintEN: readonly EN[],
  edgeWindowAreaM2: readonly number[] | null,
  heightM: number,
): Record<Orientation, number> {
  if (!edgeWindowAreaM2) return { N: DEFAULT_WWR, E: DEFAULT_WWR, S: DEFAULT_WWR, W: DEFAULT_WWR };
  const wall: Record<Orientation, number> = { N: 0, E: 0, S: 0, W: 0 };
  const win: Record<Orientation, number> = { N: 0, E: 0, S: 0, W: 0 };
  for (const e of facadeEdges(footprintEN)) {
    const o = orientationOf(e.normalAzimuthDeg);
    wall[o] += e.lengthM * heightM;
    win[o] += edgeWindowAreaM2[e.index] ?? 0;
  }
  const r = (o: Orientation) => (wall[o] > 0 ? Math.min(0.9, win[o] / wall[o]) : 0);
  return { N: r('N'), E: r('E'), S: r('S'), W: r('W') };
}

/** Places a draft at a site: rotates the hull by true north + the dialog rotation, then to lon/lat. */
export function specFromDraft(draft: ImportDraft, place: DraftPlacement, edits: DraftEdits): BuildingSpec {
  const en = hullToEN(draft.hull, draft.northRotationDeg + place.rotationDeg);
  const ring = signedArea(en) > 0 ? en : [...en].reverse();
  const wwr = {
    ...wwrFromEdges(en, draft.edgeWindowAreaM2, edits.floors * edits.floorToFloorM),
    ...edits.wwr,
  };
  return {
    name: edits.name,
    use: edits.use,
    structure: 'rcc-frame',
    stage: 'pre-construction',
    site: {
      label: place.label,
      lat: place.lat,
      lon: place.lon,
      timezone: 'Asia/Kolkata',
      plotBufferM: place.plotBufferM,
    },
    footprint: ring.map((p) => {
      const ll = fromLocalEN(p, { lon: place.lon, lat: place.lat });
      return [ll.lon, ll.lat];
    }),
    floors: edits.floors,
    floorToFloorM: edits.floorToFloorM,
    wwr,
    roofType: 'flat',
    ...(draft.concreteM3
      ? { quantities: { concreteM3: draft.concreteM3, source: `${draft.fileName}, IFC base quantities` } }
      : {}),
  };
}
