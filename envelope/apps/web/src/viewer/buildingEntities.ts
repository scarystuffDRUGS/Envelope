import type { BuildingState, LonLat } from '@envelope/models';
import { bufferConvex, fromLocalEN, toLocalEN } from '@envelope/models';
import * as Cesium from 'cesium';
import type { SiteGeometry } from './site';
import { densify } from './site';

/** Construction-site palette: neutral, material-like colours. */
const COLOURS = {
  soil: Cesium.Color.fromCssColorString('#9E8D74'),
  pit: Cesium.Color.fromCssColorString('#7C6A52'),
  /** Plot boundary: dark dashes with light gaps read on both bare ground and the dust layer. */
  boundary: Cesium.Color.fromCssColorString('#2F2D29'),
  boundaryGap: Cesium.Color.fromCssColorString('#F4F1EA').withAlpha(0.85),
  concrete: Cesium.Color.fromCssColorString('#C2BEB5'),
  slabEdge: Cesium.Color.fromCssColorString('#77736B'),
  glass: Cesium.Color.fromCssColorString('#6F8B9C'),
  /** Timber shuttering on the floor being cast. */
  formwork: Cesium.Color.fromCssColorString('#B5895A').withAlpha(0.45),
  formworkEdge: Cesium.Color.fromCssColorString('#7A5A36'),
  netting: Cesium.Color.fromCssColorString('#2E7D32').withAlpha(0.35),
  /** The finished building, faint, while it is built. */
  ghost: Cesium.Color.fromCssColorString('#FFFFFF').withAlpha(0.14),
  ghostEdge: Cesium.Color.fromCssColorString('#5F5B53').withAlpha(0.7),
};

const ll = (ring: LonLat[]) => ring.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat));
const llAt = (ring: LonLat[], h: number) => ring.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, h));
const closed = <T>(ring: T[]) => [...ring, ring[0]!];

/** What the site layer draws besides the plot and the building state. */
export interface SiteRenderOptions {
  /** GHG layer: facade and roof colours by embodied carbon. */
  ghg?: { facades: string[]; roof: string };
  /** An imported mesh shows the finished building, so the massing stops once the building is complete. */
  modelComplete?: boolean;
  /** Depth of the dig (m): the basements, or the foundations when there are none. */
  pitDepthM: number;
  /** Green netting on scaffolding is in the plan: drawn around the frame while it is open. */
  netting?: boolean;
  /** Faint outline of the finished building while it is built (when no imported mesh does this). */
  ghost?: boolean;
}

/** Column grid along the footprint edges (m); visual only. */
const COLUMN_SPACING_M = 6;
const COLUMN_SIZE_M = 0.45;
const SLAB_M = 0.25;

/**
 * Rebuilds the plot, excavation and building entities for a construction month (D-034): the pit
 * deepens through excavation; through structure the RCC frame (columns, slabs, formwork on the
 * floor being cast) rises floor by floor; through finishing walls and glazing close it from the
 * ground up. A faint outline shows the finished building throughout. Heights are absolute
 * (ellipsoidal), measured from the sampled ground height.
 */
export function renderSite(
  ds: Cesium.CustomDataSource,
  geo: SiteGeometry,
  groundM: number,
  state: BuildingState,
  opts: SiteRenderOptions,
) {
  // Entities get auto ids: re-adding fixed ids inside suspendEvents left stale geometry (B-005).
  ds.entities.suspendEvents();
  ds.entities.removeAll();
  const { spec } = geo;
  const f = spec.floorToFloorM;
  const excavating = state.phase === 'excavation';
  const pitDepth = opts.pitDepthM * state.excavationProgress;
  const complete = state.phase === 'finishing' && state.envelopeProgress >= 1;
  const fullTop = groundM + spec.floors * f;
  const footEN = geo.footprintLL.map((p) => toLocalEN(p, geo.origin));
  const ring = (d: number) => bufferConvex(footEN, d).map((p) => fromLocalEN(p, geo.origin));

  // The 3D tiles are cut out only under the building (D-033), so the plot keeps its real ground and
  // meets its neighbours on one surface. Soil fills the narrow clip margin (and the footprint, with a
  // hole over the pit while excavating); the plot boundary is a dashed line draped on the ground.
  ds.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(
        ll(geo.clipLL),
        excavating ? [new Cesium.PolygonHierarchy(ll(geo.footprintLL))] : [],
      ),
      height: groundM + 0.03,
      material: COLOURS.soil,
      shadows: Cesium.ShadowMode.RECEIVE_ONLY,
    },
  });
  ds.entities.add({
    polyline: {
      positions: ll(closed(geo.plotLL)),
      clampToGround: true,
      classificationType: Cesium.ClassificationType.BOTH,
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({
        color: COLOURS.boundary,
        gapColor: COLOURS.boundaryGap,
        dashLength: 16,
      }),
    },
  });

  if (excavating && pitDepth > 0) {
    ds.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(ll(geo.footprintLL)),
        height: groundM - pitDepth,
        material: COLOURS.pit,
      },
    });
    ds.entities.add({
      wall: {
        positions: llAt(closed(geo.footprintLL), groundM),
        minimumHeights: closed(geo.footprintLL).map(() => groundM - pitDepth),
        maximumHeights: closed(geo.footprintLL).map(() => groundM + 0.05),
        material: COLOURS.pit,
      },
    });
  }

  if (complete && opts.modelComplete) {
    ds.entities.resumeEvents();
    return;
  }

  // The finished building, faint, so it is clear from month 1 what is being built.
  if (opts.ghost && !complete) {
    ds.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(ll(geo.footprintLL)),
        height: groundM,
        extrudedHeight: fullTop,
        material: COLOURS.ghost,
        outline: true,
        outlineColor: COLOURS.ghostEdge,
        shadows: Cesium.ShadowMode.DISABLED,
      },
    });
  }

  const frameTop = groundM + state.frameFloors * f;
  const doneFloors = Math.floor(state.frameFloors + 1e-9);
  const cladTop = groundM + state.envelopeProgress * spec.floors * f;

  if (state.frameFloors > 0) {
    // Columns along the footprint edges, up to the frame top (part-way on the floor being cast).
    const h = frameTop - groundM;
    for (const c of densify(footEN, COLUMN_SPACING_M)) {
      const p = fromLocalEN(c, geo.origin);
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, groundM + h / 2),
        box: {
          dimensions: new Cesium.Cartesian3(COLUMN_SIZE_M, COLUMN_SIZE_M, h),
          material: COLOURS.concrete,
          shadows: Cesium.ShadowMode.CAST_ONLY,
        },
      });
    }
    // Slabs of the floors cast so far.
    for (let i = 1; i <= doneFloors; i++) {
      ds.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(ll(geo.footprintLL)),
          height: groundM + i * f - SLAB_M,
          extrudedHeight: groundM + i * f,
          material: COLOURS.concrete,
          shadows: Cesium.ShadowMode.ENABLED,
        },
      });
    }
    // Formwork (shuttering) on the floor being cast.
    if (state.phase === 'structure' && state.frameFloors - doneFloors > 1e-6) {
      ds.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(ll(geo.footprintLL)),
          height: groundM + doneFloors * f,
          extrudedHeight: groundM + (doneFloors + 1) * f,
          material: COLOURS.formwork,
          outline: true,
          outlineColor: COLOURS.formworkEdge,
        },
      });
    }
  }

  // Walls and glazing, closed from the ground up through finishing.
  if (state.phase === 'finishing' && cladTop > groundM) {
    ds.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(ll(geo.footprintLL)),
        height: groundM,
        extrudedHeight: cladTop,
        material: COLOURS.glass,
        shadows: Cesium.ShadowMode.CAST_ONLY,
      },
    });
  }

  // Green netting on the scaffolding around the open frame (mitigation measure).
  if (opts.netting && state.frameFloors > 0 && !complete) {
    const net = ring(0.8);
    const top = Math.min(fullTop, frameTop + 1);
    ds.entities.add({
      wall: {
        positions: llAt(closed(net), groundM),
        minimumHeights: closed(net).map(() => groundM),
        maximumHeights: closed(net).map(() => top),
        material: COLOURS.netting,
      },
    });
  }

  // GHG layer: each facade and the roof coloured by embodied kgCO2e/m², drawn 0.15 m proud of the frame.
  const ghg = opts.ghg;
  if (ghg && state.frameFloors > 0) {
    const outer = ring(0.15);
    outer.forEach((p, i) => {
      const q = outer[(i + 1) % outer.length]!;
      ds.entities.add({
        wall: {
          positions: llAt([p, q], groundM),
          minimumHeights: [groundM, groundM],
          maximumHeights: [frameTop, frameTop],
          material: Cesium.Color.fromCssColorString(ghg.facades[i] ?? '#999999'),
        },
      });
    });
    ds.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(ll(outer)),
        height: frameTop + 0.1,
        material: Cesium.Color.fromCssColorString(ghg.roof),
      },
    });
  }

  // Slab edges make each storey readable.
  for (let i = 1; i <= doneFloors; i++) {
    ds.entities.add({
      polyline: {
        positions: llAt(closed(geo.footprintLL), groundM + i * f + 0.02),
        width: 1.5,
        arcType: Cesium.ArcType.NONE,
        material: COLOURS.slabEdge,
      },
    });
  }
  ds.entities.resumeEvents();
}

/** Cuts the existing mesh out of the 3D tiles under the building only (footprint + margin, D-033). */
export function siteClipping(geo: SiteGeometry): Cesium.ClippingPolygonCollection {
  return new Cesium.ClippingPolygonCollection({
    polygons: [new Cesium.ClippingPolygon({ positions: ll(geo.clipLL) })],
  });
}
