import type { ScenarioResult } from '@envelope/models';
import { toLocalEN } from '@envelope/models';
import * as Cesium from 'cesium';
import type { DustMetric, ImpactLayerId } from '../store/appStore';
import type { ColourScale } from '../theme/colormaps';
import { dustScale, fieldToCanvas, ghgScale, surfaceTempScale, utciScale } from '../theme/colormaps';
import type { SiteGeometry } from './site';

export interface ActiveLayer {
  id: ImpactLayerId;
  scale: ColourScale;
  /** Grid field for draped layers; null for the GHG envelope layer. */
  field: Float32Array | null;
  ghg?: { facades: string[]; roof: string; values: number[]; roofValue: number };
}

export function activeLayer(
  r: ScenarioResult | null,
  id: ImpactLayerId | null,
  metric: DustMetric,
): ActiveLayer | null {
  if (!r || !id) return null;
  if (id === 'ghg') {
    const vals = r.ghg.facades.map((f) => f.kgPerM2);
    const all = [...vals, r.ghg.roofKgPerM2];
    const s = ghgScale(Math.floor(Math.min(...all) * 0.9), Math.ceil(Math.max(...all) * 1.05));
    return {
      id,
      scale: s,
      field: null,
      ghg: {
        facades: vals.map((v) => s.css(v)),
        roof: s.css(r.ghg.roofKgPerM2),
        values: vals,
        roofValue: r.ghg.roofKgPerM2,
      },
    };
  }
  if (!r.ok) return null;
  if (id === 'dust') {
    const field = metric === 'hour' ? r.dust.hourPm10 : r.dust.dayPm10;
    let max = 0;
    for (const v of field) if (v > max) max = v;
    const s = dustScale(max);
    s.title = metric === 'hour' ? 'PM10 site increment, selected hour' : 'PM10 site increment, 24 h mean';
    return { id, scale: s, field };
  }
  if (id === 'ts') {
    // Colour range from the focus area (within 260 m of the site), where the layer is opaque.
    let lo = Infinity;
    let hi = -Infinity;
    const { n, cellM } = r.grid;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const v = r.heat.ts[j * n + i]!;
        if (!Number.isFinite(v) || Math.hypot(i + 0.5 - n / 2, j + 0.5 - n / 2) * cellM > 260) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    return { id, scale: surfaceTempScale(Math.floor(lo), Math.ceil(hi)), field: r.heat.ts };
  }
  const s = utciScale();
  s.title = 'Worker heat stress on and around the site (UTCI)';
  return { id, scale: s, field: r.heat.utci };
}

/** Field value at a lon/lat (nearest cell), for the hover probe. */
export function sampleField(
  r: ScenarioResult,
  field: Float32Array,
  lon: number,
  lat: number,
  origin: { lon: number; lat: number },
): number | null {
  const p = toLocalEN({ lon, lat }, origin);
  const { e0, n0, cellM, n } = r.grid;
  const i = Math.floor((p.e - e0) / cellM);
  const j = Math.floor((p.n - n0) / cellM);
  if (i < 0 || j < 0 || i >= n || j >= n) return null;
  const v = field[j * n + i]!;
  return Number.isFinite(v) ? v : null;
}

/**
 * Drapes the field over the 3D tiles and terrain (classification). Only the building's footprint
 * is clipped out of the tiles (D-033), so the plot itself is covered by the same drape.
 */
export function renderImpact(
  ds: Cesium.CustomDataSource,
  r: ScenarioResult,
  layer: ActiveLayer | null,
  geo: SiteGeometry,
  opacity: number,
): void {
  ds.entities.removeAll();
  if (!layer?.field) return;
  const { n, rect, cellM } = r.grid;
  const tint = Cesium.Color.WHITE.withAlpha(opacity);
  // Heat layers cover every cell; fade them outside a focus area so the city stays readable.
  // Worker heat stress is shown only where people work: the site and about 50 m around it.
  const fade =
    layer.id === 'ts'
      ? { inner: 260 / cellM, outer: 540 / cellM }
      : layer.id === 'utci'
        ? { inner: (geo.plotRadiusM + 30) / cellM, outer: (geo.plotRadiusM + 70) / cellM }
        : undefined;
  ds.entities.add({
    rectangle: {
      coordinates: Cesium.Rectangle.fromDegrees(...rect),
      material: new Cesium.ImageMaterialProperty({
        image: fieldToCanvas(layer.field, n, layer.scale, undefined, fade),
        transparent: true,
        color: tint,
      }),
      classificationType: Cesium.ClassificationType.BOTH,
    },
  });
}
