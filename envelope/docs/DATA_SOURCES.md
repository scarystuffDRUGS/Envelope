# DATA_SOURCES.md — Envelope

Every number in the UI traces back to a source listed here, with a fetch timestamp. All upstream responses go through
the server's file cache (`.cache/`); the committed snapshot in `fixtures/demo/` lets the full flow run offline.
Freshness per source is shown in the status bar: Live, Cached (with date), Unavailable.

## In scope (built in checkpoints 1–2)

| Source | Use | Endpoint | Key | Limits / terms | Attribution |
|---|---|---|---|---|---|
| Open-Meteo Historical Weather (ERA5) | Hourly weather for the last complete calendar year | `https://archive-api.open-meteo.com/v1/archive` | No | Free for non-commercial use, fair use (~10,000 calls/day) | "Weather data by Open-Meteo.com" (CC BY 4.0) |
| Open-Meteo Forecast | Live mode, next 5 days | `https://api.open-meteo.com/v1/forecast` | No | As above | As above |
| Open-Meteo Air Quality (CAMS global, ~45 km) | Background PM10, PM2.5, dust, AOD | `https://air-quality-api.open-meteo.com/v1/air-quality` | No | As above | Open-Meteo.com; CAMS / Copernicus Atmosphere Monitoring Service |
| Open-Meteo Elevation | Site elevation | `https://api.open-meteo.com/v1/elevation` | No | As above | Open-Meteo.com (Copernicus DEM GLO-90) |
| OSM Overpass API | Neighbour buildings, land use, roads, water, green (heavy query); schools, colleges, universities, kindergartens, hospitals, clinics, nursing homes (separate light query, D-029) | `https://overpass-api.de/api/interpreter`, mirrors kumi.systems and private.coffee | No | Fair use: cache everything; time budget 15 s (receptors) or 20 s (buildings) across mirrors; after all fail, that query kind is skipped for 5 minutes. Often overloaded: the dialog lets users add receptors by hand | © OpenStreetMap contributors (ODbL) |
| Cesium ion: Google Photorealistic 3D Tiles (asset 2275207) | 3D basemap | via `Cesium.createGooglePhotorealistic3DTileset()` | Ion token | Ion free tier; Google root-tile sessions (3 h each); avoid reload loops | Google logo and data attributions shown through Cesium credits |
| Cesium ion: World Terrain + OSM Buildings | Fallback basemap | Cesium ion | Ion token | Ion free tier | Cesium; © OpenStreetMap contributors |
| Cesium ion: Google geocoding | Address search in the import dialog while Google 3D tiles show (Google's tile terms require Google geocoding with them) | `Cesium.IonGeocoderService` with `IonGeocodeProviderType.GOOGLE` | Ion token | Ion free tier; searches run on Enter only | "Search by Google" under the results |
| OpenStreetMap Nominatim | Address search on the OpenStreetMap basemap (server route `/api/geocode`); schools, colleges and hospitals when every Overpass instance fails (D-031): one bounded `amenity=` search per kind within 700 m, then `/lookup` with `polygon_geojson` for campus outlines | `https://nominatim.openstreetmap.org/search`, `/lookup` | No | Usage policy: at most 1 request/s (shared by both uses), identifying User-Agent, cached, no search-as-you-type; limited to India; at most 40 results per amenity | © OpenStreetMap contributors (Nominatim) |
| OpenAQ v3 API and open data archive (CPCB continuous stations) | Training targets for the background PM correction (D-038); not called by the app | `api.openaq.org/v3` (station list), `openaq-data-archive.s3.amazonaws.com` (daily CSV) | API: free key (`OPENAQ_API_KEY`); archive: none | No licence listed for this CPCB data; raw data kept out of git | OpenAQ; Central Pollution Control Board and state boards |
| CEA CO2 Baseline Database v21.0 | Grid emission factor 0.710 tCO2/MWh (FY 2024-25) | Constant | — | — | Central Electricity Authority, Government of India |

### Request parameters (Open-Meteo)

- Common: `latitude`, `longitude`, `timezone=GMT` (stored in UTC; converted to Asia/Kolkata for display),
  `wind_speed_unit=ms`.
- Archive `hourly`: temperature_2m, relative_humidity_2m, dew_point_2m, surface_pressure, wind_speed_10m,
  wind_direction_10m, wind_gusts_10m, cloud_cover, precipitation, shortwave_radiation, direct_radiation,
  diffuse_radiation, direct_normal_irradiance, soil_moisture_0_to_7cm, boundary_layer_height; `start_date`/`end_date` = last complete
  calendar year.
- Forecast `hourly`: the same list with soil_moisture_0_to_1cm and boundary_layer_height; `forecast_days=5`.
- Air quality `hourly`: pm10, pm2_5, dust, aerosol_optical_depth.
- Tilted irradiance azimuth convention: 0 = south, −90 = east, 90 = west, ±180 = north (see MODELS.md A.1).

## Report reference corpus (D-036)

Documents the report narrative may cite. `corpus/manifest.json` holds the same list with URLs; PDFs go in
`corpus/raw/<file>` (gitignored, licences vary), `pnpm rag:build` indexes those present into the committed
`corpus/index.json`, and only short passages (≤ 220 words, 25-word excerpt under References) leave it. Several
government sites (cpcb.nic.in, caqm.nic.in, cea.nic.in, greentribunal.gov.in, egazette) did not answer scripted
downloads on 2026-10-26; those files have to be saved from a browser.

| Id | Document | Copy used | Licence / terms | Indexed |
|---|---|---|---|---|
| ap42-13.2.2 / 13.2.4 / 13.2.5 | US EPA AP-42 §13.2.2 Unpaved Roads, §13.2.4 Aggregate Handling, §13.2.5 Industrial Wind Erosion (2006) | epa.gov | US Government work, public domain | Yes |
| naaqs-2009 | NAAQS notification, CPCB, 18 Nov 2009 | Third-party copy (scclmines.com); replace with a CPCB copy | Gazette matter, Copyright Act 1957 s. 52(1)(q) | Yes |
| eia-2006 | EIA Notification 2006 (S.O. 1533(E)) with amendments to March 2025 | TNPCB compilation (Gazette text prevails) | Gazette matter, s. 52(1)(q) | Yes |
| cpcb-cd-2017 | CPCB Guidelines on Environmental Management of C&D Waste (draft, Feb 2017) | mpcb.gov.in | CPCB, no licence stated; short passages with attribution | Yes |
| gsr-94e-2018 | Environment (Protection) Amendment Rules 2018, G.S.R. 94(E): dust mitigation, Schedule I items 106–107 | egazette.gov.in (to download) | Gazette matter, s. 52(1)(q) | No |
| cpcb-dust-2017 | CPCB Guidelines on Dust Mitigation Measures in Handling Construction Material and C&D Wastes (Nov 2017) | cpcb.nic.in (to download) | CPCB, no licence stated | No |
| caqm-97-2026 | CAQM Statutory Direction No. 97 (20 Feb 2026), C&D dust in NCR | caqm.nic.in (to download) | Statutory direction, attribution | No |
| cea-v21 | CEA CO2 Baseline Database User Guide v21.0 (Nov 2025) | cea.nic.in (to download) | CEA, no licence stated | No |
| cd-rules-2025 | Environment (C&D) Waste Management Rules 2025 (in force 1 Apr 2026) | India Environment Portal (to download) | Gazette matter, s. 52(1)(q) | No |
| era5-2020 | Hersbach et al. (2020), The ERA5 global reanalysis, QJRMS | doi.org/10.1002/qj.3803 (to download) | Open access CC BY (to confirm) | No |

Left out: ECSBC 2024 (BEE copyright notice forbids reproduction without written consent), EN 15978 (paid CEN
standard), ICE v3 (registration, no redistribution), WHO AQG 2021 (CC BY-NC-SA 3.0 IGO, non-commercial),
PARIVESH EIA/EMP documents (copyright of proponents and consultants).

## Deferred (1-day deadline, D-008)

| Source | Would provide | Replacement used now |
|---|---|---|
| ISRIC SoilGrids v2 | Clay/sand/silt %, bulk density | Not needed since D-025: AP-42 13.2.5 wind erosion uses a threshold friction velocity (overburden 1.02 m/s, or a site sieve test) instead of soil texture |
| NASA POWER | Solar climatology cross-check | None |
| ESA WorldCover | Land-cover gap filling | "Urban mixed paved" default class |
