/** Data sources shown in the status bar freshness indicator. Details: docs/DATA_SOURCES.md. */
export type DataSourceId =
  'open-meteo-archive' | 'open-meteo-forecast' | 'open-meteo-air-quality' | 'overpass';

export interface DataSourceInfo {
  id: DataSourceId;
  label: string;
  attribution: string;
}

export const DATA_SOURCES: readonly DataSourceInfo[] = [
  { id: 'open-meteo-archive', label: 'Weather', attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)' },
  {
    id: 'open-meteo-air-quality',
    label: 'Air quality',
    attribution: 'Open-Meteo.com; CAMS global atmospheric composition forecasts (Copernicus)',
  },
  { id: 'overpass', label: 'OSM', attribution: '© OpenStreetMap contributors (ODbL)' },
];

export type FreshnessState = 'not-loaded' | 'loading' | 'live' | 'cached' | 'error';

export interface SourceFreshness {
  state: FreshnessState;
  fetchedAt?: string; // ISO 8601 UTC
}
