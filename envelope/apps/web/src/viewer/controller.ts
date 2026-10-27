/** Imperative camera commands from ribbon buttons, overlays and shortcuts to the mounted viewer. */
export interface ViewerCommands {
  fitToSite: () => void;
  resetNorth: () => void;
  zoom: (direction: 1 | -1) => void;
  /** JPEG data URL of the current 3D view, for report figures. */
  capture: () => string | null;
  /**
   * Address search for the import dialog: Google via Cesium ion while Google 3D tiles show (their
   * terms require Google geocoding), else OpenStreetMap Nominatim through the server.
   */
  geocode: (query: string) => Promise<GeocodeResults>;
}

export interface GeocodeResults {
  results: { label: string; lat: number; lon: number }[];
  /** Credit shown under the results. */
  attribution: string;
}

/** Nominatim through the server, for the OpenStreetMap basemap or when no viewer is mounted. */
export async function geocodeViaServer(query: string): Promise<GeocodeResults> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
  if (!res.ok)
    throw new Error(
      res.status === 429 ? 'Too many searches; wait a minute.' : 'Address search is unavailable.',
    );
  return (await res.json()) as GeocodeResults;
}

let active: ViewerCommands | null = null;

export const viewerCommands: ViewerCommands & { attach: (c: ViewerCommands | null) => void } = {
  attach: (c) => {
    active = c;
  },
  fitToSite: () => active?.fitToSite(),
  resetNorth: () => active?.resetNorth(),
  zoom: (direction) => active?.zoom(direction),
  capture: () => active?.capture() ?? null,
  geocode: (query) => (active ? active.geocode(query) : geocodeViaServer(query)),
};
