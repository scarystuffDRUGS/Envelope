import * as Cesium from 'cesium';
import type { BasemapKind } from '../store/appStore';

/**
 * Basemap selection (DECISIONS D-005, D-016):
 * Google Photorealistic 3D Tiles via Cesium ion → Cesium World Terrain + OSM Buildings → OpenStreetMap raster.
 * `?basemap=osm` or `?basemap=none` forces a mode; the e2e tests use `none` so they never spend
 * Google root-tile sessions.
 */
export type BasemapRequest = 'auto' | 'osm' | 'none';

export function basemapRequestFromUrl(): BasemapRequest {
  const v = new URLSearchParams(window.location.search).get('basemap');
  return v === 'osm' || v === 'none' ? v : 'auto';
}

export async function fetchIonToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return null;
    const body = (await res.json()) as { cesiumIonToken?: string | null };
    return body.cesiumIonToken ?? null;
  } catch {
    return null;
  }
}

export interface BasemapResult {
  kind: BasemapKind;
  /** 3D tilesets that make up the basemap; clipped at the plot and toggled by the Basemap layer. */
  tilesets: Cesium.Cesium3DTileset[];
  /** Imagery layer of the basemap, if any (toggled by the Basemap layer). */
  imagery: Cesium.ImageryLayer | null;
  notice: string | null;
}

function addOsmRaster(viewer: Cesium.Viewer): Cesium.ImageryLayer {
  return viewer.imageryLayers.addImageryProvider(
    new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }),
  );
}

export async function setupIonFallback(viewer: Cesium.Viewer, notice: string): Promise<BasemapResult> {
  viewer.scene.globe.show = true;
  const imagery = Cesium.ImageryLayer.fromWorldImagery({});
  viewer.imageryLayers.add(imagery);
  try {
    viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
  } catch {
    // Ellipsoid terrain is an acceptable last resort for a flat site.
  }
  try {
    const buildings = await Cesium.createOsmBuildingsAsync();
    viewer.scene.primitives.add(buildings);
    return { kind: 'ion-fallback', tilesets: [buildings], imagery, notice };
  } catch {
    return { kind: 'ion-fallback', tilesets: [], imagery, notice };
  }
}

export async function setupBasemap(
  viewer: Cesium.Viewer,
  request: BasemapRequest,
  token: string | null,
): Promise<BasemapResult> {
  if (request === 'none') return { kind: 'none', tilesets: [], imagery: null, notice: null };
  if (request === 'osm') return { kind: 'osm', tilesets: [], imagery: addOsmRaster(viewer), notice: null };
  if (!token) {
    return {
      kind: 'osm',
      tilesets: [],
      imagery: addOsmRaster(viewer),
      notice: 'No Cesium ion token is configured, so the map shows OpenStreetMap without 3D buildings.',
    };
  }
  Cesium.Ion.defaultAccessToken = token;
  try {
    // With Google tiles, address search uses Google geocoding through ion (viewer geocode), as Google requires.
    const tileset = await Cesium.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
    viewer.scene.primitives.add(tileset);
    viewer.scene.globe.show = false;
    return { kind: 'google', tilesets: [tileset], imagery: null, notice: null };
  } catch {
    return setupIonFallback(
      viewer,
      'Google 3D tiles are unavailable, so the map shows Cesium World Terrain with OSM Buildings.',
    );
  }
}
