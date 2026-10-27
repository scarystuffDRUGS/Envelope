import type { Assumptions } from '@envelope/models';
import {
  PARAMS,
  buildingStateForMonth,
  calendarMonthFor,
  fromLocalEN,
  isSensitive,
  toSchedule,
} from '@envelope/models';
import { makeStyles } from '@fluentui/react-components';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { BasemapResult } from './basemap';
import { basemapRequestFromUrl, fetchIonToken, setupBasemap, setupIonFallback } from './basemap';
import { renderSite, siteClipping } from './buildingEntities';
import { geocodeViaServer, viewerCommands } from './controller';
import { activeLayer, renderImpact, sampleField } from './impactLayer';
import type { SiteGeometry } from './site';
import { siteGeometry } from './site';

const useStyles = makeStyles({
  root: { position: 'absolute', inset: 0 },
  probe: {
    position: 'absolute',
    pointerEvents: 'none',
    zIndex: 3,
    minWidth: '168px',
    backgroundColor: 'var(--surface-container-lowest)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 12px',
    fontSize: '12px',
    lineHeight: '16px',
    color: 'var(--on-surface)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    boxShadow: 'var(--elevation-2)',
  },
  probeLabel: { color: 'var(--on-surface-variant)', fontWeight: 500 },
  probeValue: {
    fontFamily: 'var(--font-brand)',
    fontSize: '22px',
    lineHeight: '28px',
    margin: '2px 0 6px',
  },
  probeUnit: {
    fontFamily: 'var(--font-plain)',
    fontSize: '12px',
    color: 'var(--on-surface-variant)',
    marginLeft: '4px',
  },
  probeCoords: { display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--on-surface-variant)' },
});

const DEG = Cesium.Math.toRadians(1);
/** Default oblique view used for the fly-in and Fit to site. */
const FIT_HEADING_DEG = 30;
const FIT_PITCH_DEG = -28;
const FIT_RANGE_FACTOR = 3.2;
const GROUND_SAMPLE_TIMEOUT_MS = 20_000;
/** Minimum time between hover-probe depth picks (~12 per second). */
const PROBE_INTERVAL_MS = 80;

/**
 * Share of ground probes below the chosen ground height. High, so the building stands on the
 * surface beside it instead of sinking into it; low enough to skip the odd tree or wall (D-039).
 */
const GROUND_PERCENTILE = 0.7;

function groundPercentile(hs: number[]): number | null {
  if (!hs.length) return null;
  const s = [...hs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(GROUND_PERCENTILE * s.length))]!;
}

/**
 * Ground height (ellipsoidal m) at the building, from the unclipped basemap: a high percentile of
 * probes just outside the clip edge, so the building sits on the surface right beside it rather
 * than below it (D-039).
 */
async function sampleGround(
  viewer: Cesium.Viewer,
  basemap: BasemapResult,
  geo: SiteGeometry,
): Promise<number | null> {
  const cartos = geo.groundProbeLL.map((p) => Cesium.Cartographic.fromDegrees(p.lon, p.lat));
  const sample = async (): Promise<number | null> => {
    if (basemap.kind === 'google') {
      const out = await viewer.scene.sampleHeightMostDetailed(cartos);
      return groundPercentile(out.map((c) => c?.height).filter((h): h is number => Number.isFinite(h)));
    }
    if (basemap.kind === 'ion-fallback') {
      const out = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartos);
      return groundPercentile(out.map((c) => c.height).filter((h) => Number.isFinite(h))) ?? 0;
    }
    return 0;
  };
  const timeout = new Promise<null>((resolve) =>
    window.setTimeout(() => resolve(null), GROUND_SAMPLE_TIMEOUT_MS),
  );
  try {
    return await Promise.race([sample(), timeout]);
  } catch {
    return null;
  }
}

type ModelMode = 'hidden' | 'ghost' | 'solid';

/** Imported mesh: hidden, a faint outline of the building to come, or the finished building. */
function applyModelMode(m: Cesium.Model, mode: ModelMode): void {
  m.show = mode !== 'hidden';
  m.color = mode === 'ghost' ? Cesium.Color.WHITE.withAlpha(0.28) : Cesium.Color.WHITE;
  m.shadows = mode === 'solid' ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.DISABLED;
}

/** Foundation depth drawn when the building has no basement (m); visual only. */
const FOUNDATION_DEPTH_M = 1.5;

/** How deep the excavation goes: the basements, else shallow foundations. */
function digDepthM(a: Partial<Assumptions>): number {
  const def = (id: keyof Assumptions) => PARAMS.find((p) => p.id === id)!.value;
  const n = a.basements ?? def('basements');
  return n > 0 ? n * (a.basementDepthM ?? def('basementDepthM')) : FOUNDATION_DEPTH_M;
}

function distanceM(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  return Cesium.Cartesian3.distance(
    Cesium.Cartesian3.fromDegrees(a.lon, a.lat),
    Cesium.Cartesian3.fromDegrees(b.lon, b.lat),
  );
}

function sunTime(year: number, constructionMonth: number, hour: number): Cesium.JulianDate {
  const mm = String(calendarMonthFor(constructionMonth)).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  // Site local time is IST (UTC+05:30, no DST); mid-month day stands in for the month.
  return Cesium.JulianDate.fromIso8601(`${year}-${mm}-15T${hh}:00:00+05:30`);
}

export function SiteViewer() {
  const s = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const dsRef = useRef<Cesium.CustomDataSource | null>(null);
  const impactRef = useRef<Cesium.CustomDataSource | null>(null);
  const basemapRef = useRef<BasemapResult | null>(null);
  const sphereRef = useRef<Cesium.BoundingSphere | null>(null);
  const building = useAppStore((st) => st.building);
  const geo = useMemo(() => siteGeometry(building), [building]);
  // The viewer is created once; placement reads the current geometry through refs, so a new
  // building (import or reset) re-places without restarting the basemap session.
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const placeRef = useRef<((basemap: BasemapResult) => Promise<void>) | null>(null);
  const placedGeoRef = useRef<SiteGeometry | null>(null);
  const [ground, setGround] = useState<number | null>(null);
  const [probe, setProbe] = useState<{ x: number; y: number; lat: number; lon: number } | null>(null);
  const probeRef = useRef<{ lat: number; lon: number } | null>(null);

  const scenario = useAppStore((st) => st.scenario);
  const layers = useAppStore((st) => st.layers);
  const results = useAppStore((st) => st.results);
  const impactLayer = useAppStore((st) => st.impactLayer);
  const dustMetric = useAppStore((st) => st.dustMetric);
  const opacity = useAppStore((st) => st.layerOpacity);
  const showScenario = useAppStore((st) => st.showScenario);
  const modelUrl = useAppStore((st) => st.modelUrl);
  const modelHeadingDeg = useAppStore((st) => st.buildingSource.modelHeadingDeg ?? 0);
  const modelScale = useAppStore((st) => st.buildingSource.modelScale ?? 1);
  const modelRef = useRef<Cesium.Model | null>(null);
  const shown = results ? results[showScenario] : null;
  const layer = useMemo(() => activeLayer(shown, impactLayer, dustMetric), [shown, impactLayer, dustMetric]);

  // Create the viewer once.
  useEffect(() => {
    const store = useAppStore.getState();
    const viewer = new Cesium.Viewer(containerRef.current!, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      baseLayer: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: true,
      contextOptions: { webgl: { preserveDrawingBuffer: true } },
      // Render on demand (D-028): frames are drawn when the camera, tiles, entities or an explicit
      // requestRender() change something, not 60 times a second while idle.
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });
    viewerRef.current = viewer;
    // Dev builds only: the viewer and Cesium for performance checks from the console.
    if (import.meta.env.DEV) Object.assign(window, { __viewer: viewer, __Cesium: Cesium });
    viewer.clock.shouldAnimate = false;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#DADDE0');
    viewer.scene.postProcessStages.fxaa.enabled = true;
    viewer.shadowMap.softShadows = true;
    viewer.shadowMap.darkness = 0.4;
    viewer.shadowMap.maximumDistance = 2000;

    const ds = new Cesium.CustomDataSource('site');
    void viewer.dataSources.add(ds);
    dsRef.current = ds;
    const impact = new Cesium.CustomDataSource('impact');
    void viewer.dataSources.add(impact);
    impactRef.current = impact;

    // Start over the city; the fly-in to the plot follows once the ground height is known.
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        geoRef.current.origin.lon - 0.035,
        geoRef.current.origin.lat - 0.06,
        9000,
      ),
      orientation: { heading: FIT_HEADING_DEG * DEG, pitch: -45 * DEG, roll: 0 },
    });

    let disposed = false;

    const flyToSite = (
      duration: number,
      headingDeg = FIT_HEADING_DEG,
      pitchDeg = FIT_PITCH_DEG,
      range?: number,
    ) => {
      const sphere = sphereRef.current;
      if (!sphere) return;
      viewer.camera.flyToBoundingSphere(sphere, {
        offset: new Cesium.HeadingPitchRange(
          headingDeg * DEG,
          pitchDeg * DEG,
          range ?? sphere.radius * FIT_RANGE_FACTOR,
        ),
        duration,
      });
    };

    const placeAt = (
      geo: SiteGeometry,
      groundM: number,
      source: 'snapshot' | 'sampled' | 'ellipsoid',
      fly: boolean,
    ) => {
      const h = geo.takeoff.heightM;
      sphereRef.current = new Cesium.BoundingSphere(
        Cesium.Cartesian3.fromDegrees(geo.origin.lon, geo.origin.lat, groundM + h / 2),
        Math.hypot(geo.plotRadiusM, h / 2),
      );
      setGround(groundM);
      const st = useAppStore.getState();
      st.setGround({ heightM: groundM, source });
      st.setBuildingPlaced(true);
      if (fly) flyToSite(2);
    };

    const placeBuilding = async (basemap: BasemapResult) => {
      const geo = geoRef.current;
      const previous = placedGeoRef.current;
      placedGeoRef.current = geo;
      // A building at a new site: head there now; the fit follows once the ground is sampled.
      if (previous && distanceM(previous.origin, geo.origin) > 1000) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(geo.origin.lon - 0.012, geo.origin.lat - 0.02, 2500),
          orientation: { heading: FIT_HEADING_DEG * DEG, pitch: -40 * DEG, roll: 0 },
          duration: 2,
        });
      }
      for (const t of basemap.tilesets) {
        t.clippingPolygons = siteClipping(geo);
        viewer.scene.requestRender();
        // Photogrammetry has no usable normals, so self-shadowing shows heavy acne (BUGS B-003).
        // Tiles receive the building's shadow but do not cast.
        t.shadows = Cesium.ShadowMode.RECEIVE_ONLY;
      }
      if (basemap.kind === 'osm' || basemap.kind === 'none') {
        placeAt(geo, 0, 'ellipsoid', true);
        return;
      }
      // Google surface heights are committed with the demo snapshot: place and fly at once, refine below.
      const snapshot = basemap.kind === 'google' ? geo.spec.site.groundEllipsoidalM : undefined;
      if (snapshot !== undefined) placeAt(geo, snapshot, 'snapshot', true);
      const g = await sampleGround(viewer, basemap, geo);
      // Stop if the viewer closed or another building was placed while sampling.
      if (disposed || placedGeoRef.current !== geo) return;
      if (g === null) {
        if (snapshot !== undefined) return;
        placeAt(geo, 0, 'ellipsoid', true);
        store.setBasemap({
          state: 'ready',
          kind: basemap.kind,
          notice:
            'Ground height could not be measured from the basemap, so the building may not sit on the ground.',
        });
        return;
      }
      // Re-place only when the live sample differs noticeably from the snapshot.
      if (snapshot === undefined || Math.abs(snapshot - g) > 0.3)
        placeAt(geo, g, 'sampled', snapshot === undefined);
      else useAppStore.getState().setGround({ heightM: snapshot, source: 'sampled' });
    };

    placeRef.current = placeBuilding;

    void (async () => {
      const request = basemapRequestFromUrl();
      const token = request === 'auto' ? await fetchIonToken() : null;
      if (disposed) return;
      let basemap = await setupBasemap(viewer, request, token);
      if (disposed) return;
      basemapRef.current = basemap;
      store.setBasemap({ state: 'ready', kind: basemap.kind, notice: basemap.notice });
      viewer.scene.requestRender();

      // If Google tiles start failing (quota, key), switch to the ion fallback once.
      if (basemap.kind === 'google') {
        let failures = 0;
        const google = basemap.tilesets[0]!;
        google.tileFailed.addEventListener(() => {
          failures += 1;
          if (failures !== 5 || disposed) return;
          viewer.scene.primitives.remove(google);
          void setupIonFallback(
            viewer,
            'Google 3D tiles stopped loading, so the map shows Cesium World Terrain with OSM Buildings.',
          ).then((fallback) => {
            if (disposed) return;
            basemap = fallback;
            basemapRef.current = fallback;
            store.setBasemap({ state: 'ready', kind: fallback.kind, notice: fallback.notice });
            void placeBuilding(fallback);
          });
        });
      }
      await placeBuilding(basemap);
    })();

    // Camera state → store (heading, pitch, range, scale) for the compass, scale bar and status bar.
    viewer.camera.percentageChanged = 0.005;
    // Coalesced to one store update per animation frame while the camera moves.
    let viewRaf = 0;
    const publishView = () => {
      if (viewRaf) return;
      viewRaf = window.requestAnimationFrame(() => {
        viewRaf = 0;
        publishViewNow();
      });
    };
    const publishViewNow = () => {
      const sphere = sphereRef.current;
      if (!sphere) return;
      const cam = viewer.camera;
      const range = Cesium.Cartesian3.distance(cam.positionWC, sphere.center);
      const fovy = (cam.frustum as Cesium.PerspectiveFrustum).fovy ?? 60 * DEG;
      const px = viewer.canvas.clientHeight || 1;
      useAppStore.getState().setView({
        headingDeg: Math.round(Cesium.Math.toDegrees(cam.heading)) % 360,
        pitchDeg: Math.round(Cesium.Math.toDegrees(cam.pitch)),
        rangeM: Math.round(range),
        metresPerPixel: (2 * range * Math.tan(fovy / 2)) / px,
      });
    };
    const removeChanged = viewer.camera.changed.addEventListener(publishView);
    const removeMoveEnd = viewer.camera.moveEnd.addEventListener(publishViewNow);

    // Hover probe. Each pickPosition is a synchronous depth read (7–11 ms on an integrated GPU,
    // D-028), so it is skipped while a button is held (the camera is being dragged) and runs at
    // most every PROBE_INTERVAL_MS.
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    let pending: Cesium.Cartesian2 | null = null;
    let raf = 0;
    let lastPick = 0;
    let dragging = false;
    const canvas = viewer.scene.canvas;
    const onDown = () => {
      dragging = true;
    };
    const onUp = () => {
      dragging = false;
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    handler.setInputAction((m: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      pending = Cesium.Cartesian2.clone(m.endPosition);
      if (raf || dragging) return;
      raf = window.setTimeout(
        () => {
          raf = 0;
          lastPick = performance.now();
          if (!pending || dragging || !viewer.scene.pickPositionSupported) return;
          const pos = viewer.scene.pickPosition(pending);
          if (!pos) {
            setProbe(null);
            useAppStore.getState().setCursor(null);
            return;
          }
          const c = Cesium.Cartographic.fromCartesian(pos);
          const lat = Cesium.Math.toDegrees(c.latitude);
          const lon = Cesium.Math.toDegrees(c.longitude);
          setProbe({ x: pending.x, y: pending.y, lat, lon });
          probeRef.current = { lat, lon };
          useAppStore.getState().setCursor({ lat, lon });
        },
        Math.max(0, PROBE_INTERVAL_MS - (performance.now() - lastPick)),
      );
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    viewerCommands.attach({
      capture: () => {
        viewer.render();
        // At most 1,600 px wide (report figures print at ~17 cm): four snapshots must stay well
        // inside the report request limit (4 MB) on high-DPI screens. Copied in the same task as
        // render(), while the WebGL drawing buffer is still valid.
        const src = viewer.scene.canvas;
        const scale = Math.min(1, 1600 / src.width);
        if (scale === 1) return src.toDataURL('image/jpeg', 0.82);
        const out = document.createElement('canvas');
        out.width = Math.round(src.width * scale);
        out.height = Math.round(src.height * scale);
        out.getContext('2d')?.drawImage(src, 0, 0, out.width, out.height);
        return out.toDataURL('image/jpeg', 0.82);
      },
      fitToSite: () => flyToSite(1.2),
      resetNorth: () => {
        const sphere = sphereRef.current;
        if (!sphere) return;
        const range = Cesium.Cartesian3.distance(viewer.camera.positionWC, sphere.center);
        const pitch = Math.min(-10, Cesium.Math.toDegrees(viewer.camera.pitch));
        flyToSite(0.8, 0, pitch, range);
      },
      geocode: async (query) => {
        if (basemapRef.current?.kind !== 'google') return geocodeViaServer(query);
        const service = new Cesium.IonGeocoderService({
          scene: viewer.scene,
          geocodeProviderType: Cesium.IonGeocodeProviderType.GOOGLE,
        });
        const found = await service.geocode(query);
        return {
          attribution: 'Search by Google',
          results: found.slice(0, 5).map((r) => {
            const c =
              r.destination instanceof Cesium.Rectangle
                ? Cesium.Rectangle.center(r.destination)
                : Cesium.Cartographic.fromCartesian(r.destination);
            return {
              label: r.displayName,
              lat: Cesium.Math.toDegrees(c.latitude),
              lon: Cesium.Math.toDegrees(c.longitude),
            };
          }),
        };
      },
      zoom: (direction) => {
        const sphere = sphereRef.current;
        const range = sphere ? Cesium.Cartesian3.distance(viewer.camera.positionWC, sphere.center) : 500;
        if (direction > 0) viewer.camera.zoomIn(range > 60 ? range * 0.3 : 0);
        else viewer.camera.zoomOut(range * 0.4);
      },
    });

    return () => {
      disposed = true;
      viewerCommands.attach(null);
      if (raf) window.clearTimeout(raf);
      if (viewRaf) window.cancelAnimationFrame(viewRaf);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      removeChanged();
      removeMoveEnd();
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      placeRef.current = null;
    };
  }, []);

  // A new building (import or reset): re-clip the tiles, re-sample the ground and fly there.
  useEffect(() => {
    const basemap = basemapRef.current;
    if (!basemap || !placeRef.current || placedGeoRef.current === geo) return;
    void placeRef.current(basemap);
  }, [geo]);

  // The imported mesh is the finished building: solid once construction is complete, a faint
  // outline over the rising frame before that (D-034). The GHG layer colours the parametric
  // envelope, so the mesh is hidden under it.
  const schedule = shown ? toSchedule(shown.programme.effective) : undefined;
  const state = buildingStateForMonth(scenario.constructionMonth, geo.spec.floors, schedule);
  const complete = state.phase === 'finishing' && state.envelopeProgress >= 1;
  const modelMode: ModelMode =
    !modelUrl || !layers.model || impactLayer === 'ghg' ? 'hidden' : complete ? 'solid' : 'ghost';
  const modelModeRef = useRef(modelMode);
  modelModeRef.current = modelMode;
  const assumptions = useAppStore((st) => st.assumptions);
  const netting = useAppStore((st) => st.mitigations.greenNetting) && showScenario === 'mitigated';
  const pitDepthM = digDepthM(assumptions);

  // Building and plot follow the construction month.
  useEffect(() => {
    const ds = dsRef.current;
    if (!ds || ground === null) return;
    renderSite(
      ds,
      geo,
      ground,
      buildingStateForMonth(scenario.constructionMonth, geo.spec.floors, schedule),
      {
        ghg: layer?.ghg,
        modelComplete: modelMode === 'solid',
        ghost: modelMode !== 'ghost',
        pitDepthM,
        netting,
      },
    );
    viewerRef.current?.scene.requestRender();
  }, [geo, ground, scenario.constructionMonth, shown, layer, modelMode, pitDepthM, netting]); // eslint-disable-line react-hooks/exhaustive-deps

  // Schools, colleges and hospitals (D-029): a labelled pin each, with the selected day's
  // site PM10 increment, so the receptors the report lists can be seen on the map.
  const receptorsRef = useRef<Cesium.CustomDataSource | null>(null);
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || ground === null) return;
    if (!receptorsRef.current) {
      receptorsRef.current = new Cesium.CustomDataSource('receptors');
      void viewer.dataSources.add(receptorsRef.current);
    }
    const ds = receptorsRef.current;
    ds.entities.suspendEvents();
    ds.entities.removeAll();
    for (const r of shown?.dust.receptors ?? []) {
      if (!isSensitive(r.kind)) continue;
      const ll = fromLocalEN({ e: r.e, n: r.n }, geo.origin);
      const health = /hospital|clinic|nursing/.test(r.kind);
      ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat, ground + 2),
        point: {
          pixelSize: 11,
          color: Cesium.Color.fromCssColorString(health ? '#C62828' : '#1565C0'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${r.name}
${r.day.pm10Inc.toFixed(1)} µg/m³ · ${Math.round(r.distanceM)} m`,
          font: '500 12px Roboto, sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#1F1F1F'),
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#FFFFFF').withAlpha(0.88),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          pixelOffset: new Cesium.Cartesian2(0, -16),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(300, 1, 3000, 0.6),
        },
      });
    }
    ds.entities.resumeEvents();
    ds.show = layers.receptors;
    viewer.scene.requestRender();
  }, [shown, geo, ground, layers.receptors]);

  // Imported mesh (.glb): centred on the footprint centroid (the site origin), rotated by the
  // model's bearing. glTF is Y-up; forwardAxis X keeps Cesium from adding its glTF forward turn.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !modelUrl || ground === null) return;
    let cancelled = false;
    let model: Cesium.Model | null = null;
    const position = Cesium.Cartesian3.fromDegrees(geo.origin.lon, geo.origin.lat, ground);
    void Cesium.Model.fromGltfAsync({
      url: modelUrl,
      modelMatrix: Cesium.Matrix4.multiplyByUniformScale(
        Cesium.Transforms.headingPitchRollToFixedFrame(
          position,
          new Cesium.HeadingPitchRoll(modelHeadingDeg * DEG, 0, 0),
        ),
        modelScale,
        new Cesium.Matrix4(),
      ),
      upAxis: Cesium.Axis.Y,
      forwardAxis: Cesium.Axis.X,
      shadows: Cesium.ShadowMode.ENABLED,
    })
      .then((m) => {
        if (cancelled || viewer.isDestroyed()) {
          m.destroy();
          return;
        }
        applyModelMode(m, modelModeRef.current);
        model = viewer.scene.primitives.add(m) as Cesium.Model;
        modelRef.current = model;
      })
      .catch((err: Error) => console.warn('[viewer] imported model failed to load:', err.message));
    return () => {
      cancelled = true;
      if (model && !viewer.isDestroyed()) viewer.scene.primitives.remove(model);
      modelRef.current = null;
    };
  }, [modelUrl, modelHeadingDeg, modelScale, geo, ground]);

  useEffect(() => {
    if (modelRef.current) applyModelMode(modelRef.current, modelMode);
    viewerRef.current?.scene.requestRender();
  }, [modelMode]);

  // Impact layer draped over the tiles and the plot.
  useEffect(() => {
    const ds = impactRef.current;
    if (!ds || ground === null || !shown) return;
    renderImpact(ds, shown, layer, geo, opacity);
    // Texture and material changes do not trigger a frame in render-on-demand mode.
    viewerRef.current?.scene.requestRender();
  }, [geo, ground, shown, layer, opacity]);

  // Sun position (and so shadows) follows the hour and month.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.clock.currentTime = sunTime(scenario.weatherYear, scenario.constructionMonth, scenario.hour);
    viewer.scene.requestRender();
  }, [scenario.weatherYear, scenario.constructionMonth, scenario.hour]);

  // Layer visibility.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.shadows = layers.shadows;
    if (dsRef.current) dsRef.current.show = layers.building;
    const basemap = basemapRef.current;
    if (basemap) {
      for (const t of basemap.tilesets) t.show = layers.basemap;
      if (basemap.imagery) basemap.imagery.show = layers.basemap;
    }
    viewer.scene.requestRender();
  }, [layers, ground]);

  return (
    <>
      <div
        ref={containerRef}
        className={s.root}
        data-testid="cesium-container"
        onMouseLeave={() => {
          setProbe(null);
          useAppStore.getState().setCursor(null);
        }}
      />
      {probe && (
        <div className={s.probe} style={{ left: probe.x + 14, top: probe.y + 14 }} data-testid="probe">
          {shown &&
            layer?.field &&
            (() => {
              const v = sampleField(shown, layer.field, probe.lon, probe.lat, geo.origin);
              return v === null ? null : (
                <div data-testid="probe-value">
                  <div className={s.probeLabel}>{layer.scale.title}</div>
                  <div className={s.probeValue}>
                    {v.toFixed(1)}
                    <span className={s.probeUnit}>{layer.scale.unit}</span>
                  </div>
                </div>
              );
            })()}
          <div className={s.probeCoords}>
            <span className="env-icon env-icon--18" aria-hidden>
              location_on
            </span>
            {probe.lat.toFixed(5)}° N, {probe.lon.toFixed(5)}° E
          </div>
        </div>
      )}
    </>
  );
}
