import type { BuildingSpec, BuildingTakeoff, LonLat } from '@envelope/models';
import { bufferConvex, fromLocalEN, takeoff } from '@envelope/models';
import buildingJson from '../../../../fixtures/demo/building.json';

export const demoBuilding = buildingJson as BuildingSpec;

/** Margin around the footprint cut out of the 3D tiles (m), so old roofs do not poke through. */
export const CLIP_MARGIN_M = 0.3;

export interface SiteGeometry {
  spec: BuildingSpec;
  takeoff: BuildingTakeoff;
  origin: LonLat;
  footprintLL: LonLat[];
  /** Plot boundary: footprint buffered by spec.site.plotBufferM. Drawn on the ground, not cut out. */
  plotLL: LonLat[];
  /** Footprint plus CLIP_MARGIN_M: the only area clipped out of the 3D tiles (D-033). */
  clipLL: LonLat[];
  /**
   * Points every ≤ 2 m around the clip edge (+2 m) where the ground height is sampled. Only this
   * near ring: the plot ring reached roads and drains well below the building (D-039).
   */
  groundProbeLL: LonLat[];
  /** Half-diagonal of the plot (m), for camera framing. */
  plotRadiusM: number;
}

type EN = { e: number; n: number };

/** Points every ≤ `stepM` along a closed ring (vertices included, not repeated at the end). */
export function densify(ring: readonly EN[], stepM: number): EN[] {
  const out: EN[] = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const k = Math.max(1, Math.ceil(Math.hypot(b.e - a.e, b.n - a.n) / stepM));
    for (let j = 0; j < k; j++) out.push({ e: a.e + ((b.e - a.e) * j) / k, n: a.n + ((b.n - a.n) * j) / k });
  });
  return out;
}

export function siteGeometry(spec: BuildingSpec = demoBuilding): SiteGeometry {
  const t = takeoff(spec);
  const plotEN = bufferConvex(t.footprintEN, spec.site.plotBufferM);
  const clipEN = bufferConvex(t.footprintEN, CLIP_MARGIN_M);
  const toLL = (p: EN) => fromLocalEN(p, t.origin);
  return {
    spec,
    takeoff: t,
    origin: t.origin,
    footprintLL: t.footprintEN.map(toLL),
    plotLL: plotEN.map(toLL),
    clipLL: clipEN.map(toLL),
    groundProbeLL: densify(bufferConvex(clipEN, 2), 2).map(toLL),
    plotRadiusM: Math.max(
      ...plotEN.map((p) => Math.hypot(p.e - t.footprintCentroidEN.e, p.n - t.footprintCentroidEN.n)),
    ),
  };
}
