import type { ConstructionPhase, ConstructionPhaseId } from './construction';
import { DEFAULT_SCHEDULE, phaseForMonth } from './construction';
import type { EN, LonLat, Orientation } from './geometry';
import { centroid, facadeEdges, openRing, orientationOf, signedArea, toLocalEN } from './geometry';

/** Shape of fixtures/demo/building.json. Geometry for all maths comes from this spec. */
export interface BuildingSpec {
  name: string;
  use: 'office' | 'residential' | 'retail' | 'mixed';
  structure: 'rcc-frame';
  stage: 'pre-construction';
  site: {
    label: string;
    lat: number;
    lon: number;
    timezone: string;
    /** Plot boundary = footprint buffered by this distance (m); clipped out of the 3D tiles. */
    plotBufferM: number;
    /**
     * Ground height (WGS84 ellipsoidal m) at the plot, sampled from Google 3D tiles and
     * committed with the demo snapshot so the building can be placed before tiles load.
     * The viewer re-samples and corrects it live.
     */
    groundEllipsoidalM?: number;
  };
  /** Footprint ring, [lon, lat] pairs, counter-clockwise. */
  footprint: [number, number][];
  floors: number;
  floorToFloorM: number;
  /** Window-to-wall ratio by facade orientation, 0–1. */
  wwr: Record<Orientation, number>;
  roofType: 'flat';
  /**
   * Quantities read from an imported model (MODELS.md A.6). When present they replace the
   * per-m² intensity for that material; `source` is shown in the report.
   */
  quantities?: { concreteM3: number; source: string };
}

/**
 * Problems that stop a spec from being used (import dialog, D-027): footprint is a convex,
 * counter-clockwise ring of at least 3 points; floors 1–100; floor height 2.5–6 m; WWR 0–0.9;
 * plot buffer 0–100 m; site inside India. Empty when the spec is usable.
 */
export function validateSpec(spec: BuildingSpec): string[] {
  const out: string[] = [];
  const ring = footprintLonLat(spec);
  if (ring.length < 3) out.push('The footprint needs at least 3 corners.');
  else {
    const en = ring.map((p) => toLocalEN(p, { lon: spec.site.lon, lat: spec.site.lat }));
    if (signedArea(en) <= 0) out.push('The footprint must run counter-clockwise.');
    else if (!isConvex(en)) out.push('The footprint must be convex.');
  }
  if (!Number.isInteger(spec.floors) || spec.floors < 1 || spec.floors > 100)
    out.push('Floors must be a whole number from 1 to 100.');
  // No range limit; only a positive number, since the models divide and multiply by it.
  if (!(spec.floorToFloorM > 0)) out.push('Floor-to-floor height must be more than 0 m.');
  for (const [o, v] of Object.entries(spec.wwr))
    if (!(v >= 0 && v <= 0.9)) out.push(`Window-to-wall ratio ${o} must be between 0 and 0.9.`);
  if (!(spec.site.plotBufferM >= 0 && spec.site.plotBufferM <= 100))
    out.push('Plot buffer must be between 0 and 100 m.');
  const { lat, lon } = spec.site;
  if (!(lat >= 6 && lat <= 37 && lon >= 68 && lon <= 98))
    out.push('The site must be in India: the models use IST and Indian limits (D-027).');
  if (spec.quantities && !(spec.quantities.concreteM3 > 0)) out.push('Concrete volume must be positive.');
  return out;
}

function isConvex(ring: readonly EN[]): boolean {
  let sign = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const c = ring[(i + 2) % ring.length]!;
    const cross = (b.e - a.e) * (c.n - b.n) - (b.n - a.n) * (c.e - b.e);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

export interface FacadeTakeoff {
  index: number;
  orientation: Orientation;
  normalAzimuthDeg: number;
  lengthM: number;
  areaM2: number;
  windowAreaM2: number;
  opaqueAreaM2: number;
}

export interface BuildingTakeoff {
  origin: LonLat;
  footprintEN: EN[];
  footprintCentroidEN: EN;
  footprintAreaM2: number;
  perimeterM: number;
  heightM: number;
  gfaM2: number;
  roofAreaM2: number;
  volumeM3: number;
  facades: FacadeTakeoff[];
  facadeAreaM2: number;
  windowAreaM2: number;
}

export function footprintLonLat(spec: BuildingSpec): LonLat[] {
  return openRing(spec.footprint.map(([lon, lat]) => ({ lon, lat })));
}

/** Geometry takeoff (MODELS.md A.1): areas per facade, GFA, roof, volume. */
export function takeoff(spec: BuildingSpec): BuildingTakeoff {
  const origin: LonLat = { lon: spec.site.lon, lat: spec.site.lat };
  const footprintEN = footprintLonLat(spec).map((p) => toLocalEN(p, origin));
  const footprintAreaM2 = Math.abs(signedArea(footprintEN));
  const heightM = spec.floors * spec.floorToFloorM;
  const facades = facadeEdges(footprintEN).map((edge): FacadeTakeoff => {
    const orientation = orientationOf(edge.normalAzimuthDeg);
    const areaM2 = edge.lengthM * heightM;
    const windowAreaM2 = areaM2 * spec.wwr[orientation];
    return {
      index: edge.index,
      orientation,
      normalAzimuthDeg: edge.normalAzimuthDeg,
      lengthM: edge.lengthM,
      areaM2,
      windowAreaM2,
      opaqueAreaM2: areaM2 - windowAreaM2,
    };
  });
  return {
    origin,
    footprintEN,
    footprintCentroidEN: centroid(footprintEN),
    footprintAreaM2,
    perimeterM: facades.reduce((s, f) => s + f.lengthM, 0),
    heightM,
    gfaM2: footprintAreaM2 * spec.floors,
    roofAreaM2: footprintAreaM2,
    volumeM3: footprintAreaM2 * heightM,
    facades,
    facadeAreaM2: facades.reduce((s, f) => s + f.areaM2, 0),
    windowAreaM2: facades.reduce((s, f) => s + f.windowAreaM2, 0),
  };
}

export interface BuildingState {
  phase: ConstructionPhaseId;
  phaseLabel: string;
  /** 0–1 share of the excavation dug (1 from the structure phase on). */
  excavationProgress: number;
  /** Floors with the frame complete. */
  floorsBuilt: number;
  /** Frame height in floors, continuous (e.g. 1.5 = floor 2 half up); drives the 3D view. */
  frameFloors: number;
  /** 0–1 share of the envelope (glazing, cladding) installed. */
  envelopeProgress: number;
  /** Month within the phase (1-based) and the phase length, for the stage description. */
  monthInPhase: number;
  phaseMonths: number;
}

/**
 * What stands on site at the end of a construction month (MODELS.md A.0):
 * excavation progresses linearly; floors rise linearly through the structure phase,
 * floors built = ceil(n_floors × month-in-structure / structure months), and the frame height
 * shown in 3D is the unrounded n_floors × month-in-structure / structure months; the envelope is
 * installed linearly through finishing.
 */
export function buildingStateForMonth(
  month: number,
  floors: number,
  schedule: readonly ConstructionPhase[] = DEFAULT_SCHEDULE,
): BuildingState {
  const { phase, monthInPhase } = phaseForMonth(month, schedule);
  const progress = monthInPhase / phase.months;
  if (phase.id === 'excavation') {
    return {
      phase: phase.id,
      phaseLabel: phase.label,
      excavationProgress: progress,
      floorsBuilt: 0,
      frameFloors: 0,
      envelopeProgress: 0,
      monthInPhase,
      phaseMonths: phase.months,
    };
  }
  if (phase.id === 'structure') {
    return {
      phase: phase.id,
      phaseLabel: phase.label,
      excavationProgress: 1,
      floorsBuilt: Math.min(floors, Math.ceil(floors * progress)),
      frameFloors: Math.min(floors, floors * progress),
      envelopeProgress: 0,
      monthInPhase,
      phaseMonths: phase.months,
    };
  }
  return {
    phase: phase.id,
    phaseLabel: phase.label,
    excavationProgress: 1,
    floorsBuilt: floors,
    frameFloors: floors,
    envelopeProgress: progress,
    monthInPhase,
    phaseMonths: phase.months,
  };
}
