# MODELS.md — Envelope model specification

Moved from HANDOVER.md Appendix A in Phase 0 and adapted to the **construction-phase-only scope**
(DECISIONS.md D-003). This file is the source of truth for every formula in `packages/models`. When a formula
changes, update this file and its unit test in the same commit.

All models are **screening-level (Tier 1–2)**. They are not regulatory dispersion models (e.g. AERMOD), and results
are indicative. Every default parameter has a source. Anything marked **[verify]** is a reasonable default whose
source must be confirmed or replaced before the demo; its uncertainty is shown in the Assumptions panel.

Status column in the parameter registers: `cited` = checked against the source; `[verify]` = default from the build
brief, still to be checked; `to source` = value not set yet, to be chosen from the named source when the module is built.

---

## A.0 Assessment scope (construction phase)

- **Period:** the construction programme only, derived from the building (A.5.2) unless the user overrides it. For the
  demo building (12 floors + 1 basement) it is 21 months: excavation 1, structure 11, finishing 9. The finished
  building's operation is out of scope. (HANDOVER A.2.1 suggested a fixed 3 + 12 + 9; D-020 replaced it.)
- **Weather year:** hourly ERA5 data for the last complete calendar year is the typical-year proxy. Construction
  month *m* maps to calendar month ((start month + m − 2) mod 12) + 1 of that year. Default start month: January.
- **Building state by month:** excavation, then floors rising linearly through the structure phase
  (floors built = ceil(n_floors × month-in-structure / structure months); the 3D view draws the unrounded frame
  height n_floors × month-in-structure / structure months, with formwork on the floor being cast), then the full height
  through finishing, with the envelope closing linearly from the ground up. The models use floors built; the frame
  height is visual only (D-034).
- **Working hours:** 08:00–20:00 local (HANDOVER A.2.1 default, editable). Emissions from site activity occur only in
  working hours; wind erosion of exposed surfaces occurs at any hour.
- **Time modes:** *Worst dust day* (the day with the highest 24 h site increment at the worst receptor), *Hottest day*
  (P99 of daily max temperature), *Live* (next 5 days, Open-Meteo forecast), *Whole construction period* (statistics
  over the programme).
- **Mitigated vs baseline:** baseline = no mitigation measures; mitigated = the enabled set. Both are always computed.

## A.1 Shared inputs and geometry

- **Site:** lat, lon, elevation, timezone (Asia/Kolkata). **Domain:** square, default 1,200 m, centred on the
  building. **Grids:** 10 m for single-hour layers; 20 m for period statistics. Local ENU tangent plane.
- **Weather (hourly):** Open-Meteo Archive (ERA5) and Forecast. Variables: temperature_2m, relative_humidity_2m,
  dew_point_2m, surface_pressure, wind_speed_10m (m/s), wind_direction_10m, wind_gusts_10m, cloud_cover,
  precipitation, shortwave_radiation, direct_radiation, diffuse_radiation, direct_normal_irradiance,
  soil_moisture_0_to_7cm (archive) / soil_moisture_0_to_1cm (forecast), boundary_layer_height when available
  (else estimated from stability class).
- **Air quality (hourly):** Open-Meteo Air Quality (CAMS global): pm10, pm2_5, dust, aerosol_optical_depth.
- **Sun position:** NOAA algorithm (SunCalc acceptable if within 0.5° of NOAA).
- **Open-Meteo tilted-irradiance azimuth:** 0 = south, −90 = east, 90 = west, ±180 = north.
  Conversion from compass azimuth A (0 = north, clockwise): `om = ((A − 180 + 540) mod 360) − 180`.
  Test: compass 0° (north) → 180 (or −180); compass 90° (east) → −90; compass 180° → 0.
- **Building geometry** from `fixtures/demo/building.json`: footprint polygon → local ENU; per edge: length,
  outward normal azimuth (compass), facade area = length × height, window area = facade area × WWR(orientation).
  Roof area = footprint area. GFA = footprint area × floors. Volume = footprint area × total height.
- **Neighbours:** OSM buildings within the domain; height = `height` tag, else `building:levels` × 3.2 m, else 9 m
  **[verify per city]**. Used for shadows, sky view factor and roughness.
- **Land cover raster:** rasterise OSM polygons (building, landuse, natural, leisure=park, water, amenity=parking)
  and buffered roads (lanes × 3.5 m). Unknown cells = "urban mixed paved". The project plot is "bare soil /
  construction site" during the programme; its **pre-development** class comes from OSM or, if absent, "grass".

Surface classes (defaults **[verify]** against Oke et al. 2017, *Urban Climates*):

| Class | Albedo α | Emissivity ε | Evaporative fraction EF | Storage coeff. c_G | Roughness z0 (m) | Erodible |
|---|---|---|---|---|---|---|
| Asphalt / road | 0.10 | 0.95 | 0.00 | 0.40 | 0.05 | No |
| Concrete paving | 0.25 | 0.92 | 0.00 | 0.35 | 0.05 | No |
| Roof, conventional | 0.20 | 0.90 | 0.00 | 0.20 | — | No |
| Bare soil / construction site | 0.25 | 0.93 | 0.10 (fixed; soil-moisture dependence not implemented yet) | 0.30 | 0.01 | Yes |
| Grass | 0.23 | 0.96 | 0.50 | 0.15 | 0.03 | No |
| Trees | 0.15 | 0.97 | 0.60 | 0.10 | 1.0 | No |
| Water | 0.08 | 0.97 | 0.90 | 0.50 | 0.001 | No |
| Urban mixed paved | 0.15 | 0.94 | 0.05 | 0.35 | 0.5 | No |

(The urban mixed paved row is an Envelope default **[verify]**, not from the build brief.)

## A.2 Dust module

Outputs: (1) **site emissions and their dispersion**, (2) **background exposure** from regional dust (CAMS),
(3) **dust susceptibility index** of the site.

### A.2.1 Emission sources (hourly, PM10 and PM2.5)

Each construction phase sets active area, exposed area, material throughput, haul trips per day and working hours.

1. **General construction activity** (WRAP Fugitive Dust Handbook, 2006): PM10 = 0.11 short tons/acre/month for
   general construction, 0.42 for active large-scale earthmoving **[verify]**. Conversion: 1 short ton/acre/month
   = 2.2417 Mg/ha/month. Spread evenly over working hours. PM2.5 = 0.10 × PM10 **[verify]**.
2. **Wind erosion of exposed soil and stockpiles** (AP-42 Section 13.2.5, Industrial Wind Erosion, 11/06; D-025):
   - Emission per disturbance period: E = k·P·A (AP-42 eq. 2) with k_PM10 = 0.5, k_PM2.5 = 0.075 (cited).
   - Erosion potential of a dry, exposed surface: P = 58·(u* − u*t)² + 25·(u* − u*t) g/m², P = 0 for u* ≤ u*t (eq. 3, cited).
   - Flat exposed soil: u* = 0.053·u⁺10, u⁺10 = fastest mile at 10 m (eq. 4, z0 = 0.5 cm, cited).
   - Stockpiles (conical): subareas by surface/approach wind ratio us/ur of 0.2, 0.6 and 0.9 covering 40%, 48% and 12%
     of the pile surface (Table 13.2.5-3, pile A); u* = 0.10·(us/ur)·u⁺10 (eqs. 6–7, cited).
   - Threshold u*t = 1.02 m/s, overburden (Table 13.2.5-2, cited), the closest listed disturbed soil. Replace it with a
     sieve test of the site soil (Table 13.2.5-1: 1.00, 0.76, 0.58, 0.43 m/s for aggregate modes of 3, 1.5, 0.75 and
     0.375 mm). AP-42 values are for dry surfaces; there is no separate moisture correction.
   - Disturbance: the active site is disturbed daily (N = 365), so each calendar day is one period. The fastest mile
     of the day is estimated as the day's highest dry-hour (precipitation ≤ 0.25 mm) mean U10 × 1.2 (Durst gust factor
     for ~2 min averaging, the fastest-mile duration AP-42 gives) **[verify]**. ERA5 has no fastest mile; its 3 s gusts
     would overstate it (AP-42: "peak winds can significantly exceed the daily fastest mile").
   - The event's mass is released in that windiest dry hour. AP-42 warns its events are intermittent and not steady
     rates for dispersion models; one-hour release is the screening simplification.
   - Exposed area: whole plot in excavation, plot minus footprint afterwards; stockpile area editable. Wind barriers
     (−50%) act on both; covers (−90%) on stockpiles.
3. **Material handling** (AP-42 13.2.4, eq. 1): E (kg/Mg) = k × 0.0016 × (U/2.2)^1.3 / (M/2)^1.4;
   k_PM10 = 0.35, k_PM2.5 = 0.053; U = wind speed (m/s); M = material moisture (%, default 2).
   Throughput from concrete and aggregate quantities (A.4.1) over the structure phase.
4. **Haul traffic on unpaved roads** (AP-42 13.2.2, eq. 1a, industrial roads): E (lb/VMT) = k·(s/12)^a·(W/3)^b;
   PM10: k = 1.5, a = 0.9, b = 0.45; PM2.5: k = 0.15, a = 0.9, b = 0.45. s = silt % (default 8.5 **[verify]**),
   W = mean vehicle weight (tons). 1 lb/VMT = 281.9 g/VKT. Zero in hours with rain > 0.25 mm.

### A.2.2 Dispersion (steady-state Gaussian plume)

- Area sources split into sub-squares ≤ 10 m, treated as virtual point sources with initial σy0 = side/4.3,
  σz0 = release height/2.15. Release height default 1–3 m by source.
- C(x, y, z) = Q / (2π·u·σy·σz) · exp(−y²/2σy²) · [exp(−(z−H)²/2σz²) + exp(−(z+H)²/2σz²)]; receptor z = 1.5 m;
  only x > 0 (downwind) contributes.
- **Stability class** (Pasquill–Turner): day by incoming solar radiation (strong > 600 W/m², moderate 300–600,
  slight < 300); night by cloud cover (≥ 4/8 → E/D, ≤ 3/8 → F/E); overcast → D.

| U10 (m/s) | Strong | Moderate | Slight | Night ≥ 4/8 cloud | Night ≤ 3/8 |
|---|---|---|---|---|---|
| < 2 | A | A–B | B | E | F |
| 2–3 | A–B | B | C | E | F |
| 3–5 | B | B–C | C | D | E |
| 5–6 | C | C–D | D | D | D |
| > 6 | C | D | D | D | D |

- **Dispersion coefficients** (Briggs urban, x in m):
  A–B: σy = 0.32x(1 + 0.0004x)^−0.5, σz = 0.24x(1 + 0.001x)^0.5 ·
  C: σy = 0.22x(1 + 0.0004x)^−0.5, σz = 0.20x ·
  D: σy = 0.16x(1 + 0.0004x)^−0.5, σz = 0.14x(1 + 0.0003x)^−0.5 ·
  E–F: σy = 0.11x(1 + 0.0004x)^−0.5, σz = 0.08x(1 + 0.0015x)^−0.5.
  Initial σ added in quadrature.
- **Wind at release height:** power law with urban exponents (A/B 0.15, C 0.20, D 0.25, E/F 0.30); floor 1.0 m/s.
  Calm hours (U10 < 0.5 m/s) are flagged and use u = 0.5 m/s; their count is reported.
- **Mixing height:** if σz > 1.6·h_mix, use C = Q/(√(2π)·u·σy·h_mix)·exp(−y²/2σy²).
- **Period statistics:** bin hours by (16 directions × 6 speeds × 6 stabilities); compute a unit-emission field per
  occupied bin once; each hour = emission(h) × field(bin(h)). Accumulate daily means per cell, then period mean,
  max 24 h and P98 of 24 h means.
- **Total concentration** = CAMS background (pm10/pm2_5 at the site hour) + site increment.
- **Thresholds:** NAAQS 2009: PM10 100 µg/m³ (24 h), 60 (annual); PM2.5 60 (24 h), 40 (annual). WHO 2021: PM10
  45 / 15; PM2.5 15 / 5. Both are reported; comparison is indicative, never "compliant".
- **Sensitive receptors (D-029):** schools, colleges, universities, kindergartens, hospitals, clinics and nursing homes
  from a separate OpenStreetMap query (amenity tags, 700 m around the site), then residential areas. Each is placed
  at the point of its mapped outline nearest the plot (outlines sampled every ≤ 10 m; points as mapped), and its
  distance is measured from the plot boundary. Kept within 500 m of the boundary; schools and hospitals first by
  distance, then residential; duplicates (a school mapped as a point and as an outline) collapse to the nearer;
  at most 32. A campus whose outline contains the plot is named instead (the site-boundary values apply to it).
  Users can add receptors by hand (name search or coordinates), kept up to 1 km from the boundary. Each receptor
  gets the hourly plume increment, its 24 h means, maximum, P98 and site-caused NAAQS exceedance days. The KPIs
  cover education and health receptors only; the report states whether the lookup found receptors, found none, or
  could not reach OpenStreetMap.

**Reference test (hand-checked):** Briggs urban class D, Q = 1 g/s, u = 1 m/s, x = 100 m, ground-level source and
receptor on the centreline: σy = 0.16·100·(1.04)^−0.5 = 15.69 m, σz = 0.14·100·(1.03)^−0.5 = 13.79 m,
C = Q/(π·u·σy·σz) = 1/(π·15.69·13.79) g/m³ = 1,471 µg/m³.

### A.2.3 Dust susceptibility index (DSI, 0–100, transparent heuristic)

DSI = 35% × min(1, period-mean background PM10 / 60) + 25% × min(1, dust-event hours / 500) + 20% × share of days
with a wind-erosion event (A.2.1 item 2, per unit area) + 20% × share of dry days (precip < 1 mm). Weights editable; labelled
"heuristic" in the UI and report. Dust-event hour: CAMS `dust` > 100 µg/m³ **[verify threshold]**.

### A.2.4 PV soiling

Dropped: there is no PV during construction (D-003).

## A.3 Heat module (construction site)

Outputs: surface temperature Ts (°C) across the domain, ΔTs of the cleared site vs its pre-development land cover,
**worker heat stress** as UTCI (°C and stress category) at 1.1 m on and around the site, and **working hours at
heat-stress risk** (working hours with UTCI > 32 °C, i.e. strong heat stress or worse) over the programme.

1. **Shadows:** for each cell centre, ray toward the sun against building prisms (our building at its height for the
   selected construction month + OSM neighbours, 2.5D). Shaded cells receive no direct beam.
2. **Sky view factor:** 36 azimuth rays, max obstruction elevation β_i within 200 m; SVF = 1 − (1/36)·Σ sin²β_i.
3. **Downwelling longwave:** e_a (hPa) from dew point; ε_clear = 1.24·(e_a/Ta)^(1/7) (Brutsaert, Ta in K);
   ε_sky = min(1, ε_clear·(1 + 0.22·c²)), c = cloud fraction; L↓ = SVF·ε_sky·σTa⁴ + (1 − SVF)·σ(Ta + 2)⁴
   **[verify wall term]**.
4. **Surface energy balance per cell** (steady state, Newton–Raphson):
   K* = (1 − α)·(I_dir·cos θ·(1 − shade) + I_dif·SVF + α_env·K↓·(1 − SVF));
   R_n = K* + ε·L↓ − εσTs⁴; G = c_G·R_n; λE = EF·max(0, R_n − G); H = h_c·(Ts − Ta), h_c = 5.7 + 3.8·u_local
   (u_local = 0.5·U10 near ground **[verify]**); solve R_n − G − λE − H = 0 for Ts.
5. **Mean radiant temperature at 1.1 m** (SOLWEIG-style simplification): absorbed shortwave from direct
   (projected-area factor for a standing person, f_p ≈ 0.308·cos(h·(1 − h²/48402)), sun altitude h in degrees),
   diffuse (·SVF) and ground-reflected (α_ground·K↓); longwave from sky (L↓), ground (εσTs⁴) and walls;
   a_k = 0.70, ε_p = 0.97; Tmrt = [S_str/(ε_p·σ)]^0.25 − 273.15.
6. **UTCI:** `utci(tdb, tr, v, rh)` from jsthermalcomfort (CBE port of pythermalcomfort); wind v10 = ERA5 U10 as is
   (no reduction for site sheltering yet), clamped to 0.5–17 m/s; validity ranges enforced, out-of-range cells flagged.
   Categories: > 46 extreme, 38–46 very strong, 32–38 strong, 26–32 moderate heat stress, 9–26 no thermal stress.
   **Reference test:** UTCI(Ta 25 °C, Tmrt 25 °C, v 1.0 m/s, RH 50%) ≈ 24.6 °C (pythermalcomfort documentation).
7. **Working hours at risk:** count of working hours (A.0) over the programme with UTCI > 32 °C at the site
   worker zone (cells inside the site boundary, excluding the building footprint).
8. **Dropped from the brief:** anthropogenic heat from building cooling and the operational energy link (D-003).

**Heat mitigations** act through parameters: shade nets over worker zones (direct-beam transmittance τ_net,
default 0.5 for "50% shade net" **[verify]**), sprinkling of exposed soil (EF of bare soil raised in sprinkled hours
**[verify]**), retaining existing trees (cells keep the tree class), and rescheduling heavy work out of 12:00–15:00
(changes exposure hours, not UTCI).

## A.4 Greenhouse-gas module (construction stage, EN 15978 modules A1–A5)

Boundary: emissions caused by constructing the building, reported in tCO2e for the whole programme and per month.

- **Scope mapping (for BRSR-style reporting by the developer):** Scope 1 = diesel burnt on site (DG sets,
  equipment); Scope 2 = grid electricity used on site; Scope 3 = materials (A1–A3), transport (A4) and waste.

1. **Material quantities (A1–A3 basis)** per m² GFA by structure type (RCC frame defaults from HANDOVER A.4
   **[verify]**): concrete 0.45 m³/m², rebar 45 kg/m², masonry by opaque wall area, glass = window area × 10 mm ×
   2,500 kg/m³, aluminium frames **to source**.
2. **A1–A3 embodied carbon:** Σ quantity × emission factor. Factors **to source** from ICE v3 (Hammond & Jones,
   University of Bath) or India-specific sources (e.g. IFC EDGE India data), preferring India data for cement and
   steel. No factor ships without a citation.
3. **A4 transport:** Σ mass × distance × road-freight factor (kgCO2e/t·km) **to source**; default distances per
   material **[verify]**.
4. **A5 construction-site energy:** diesel litres per month by phase × 2.68 kgCO2/L **[verify]**; site grid
   electricity kWh per month by phase × 0.710 tCO2/MWh (CEA CO2 Baseline Database v21.0, FY 2024-25, editable).
5. **A5 waste:** wastage rate per material × its A1–A3 factor (wasted material must be produced too) **to source**.
6. **Envelope colouring:** each facade and roof surface coloured by its embodied kgCO2e per m² of surface
   (structure share by area + glazing + frames + masonry).
7. **GHG mitigations:** low-carbon concrete (GGBS / fly-ash replacement %, concrete factor −20% to −40%
   **[verify]**), recycled-content rebar, grid connection instead of DG, solar-hybrid DG, local sourcing (shorter A4
   distances), waste reduction (lower wastage rates).
8. **Dropped from the brief (D-003):** ISO 13790 5R1C hourly energy model, operational electricity and EPI, rooftop PV,
   refrigerant leakage, operational Scope 1/2.

---

## Parameter register

Every default in `packages/models` has a row here and a `// src:` comment in code. Rows are added as modules are
built (checkpoint 2 dust, checkpoint 3 heat and GHG).

| Parameter | Default | Unit | Source | Status |
|---|---|---|---|---|
| Construction programme | derived (A.5.2); 1 + 11 + 9 for the demo building | months | A.5.2 | [verify] (editable) |
| Working hours | 08:00–20:00 | local time | HANDOVER A.2.1 | [verify] (editable) |
| CEA grid emission factor | 0.710 | tCO2/MWh | CEA CO2 Baseline Database v21.0, FY 2024-25 | [verify] |
| NAAQS 2009 PM10 / PM2.5 limits | 100, 60 / 60, 40 | µg/m³ | CPCB NAAQS 2009 | [verify] |
| WHO 2021 PM10 / PM2.5 guidelines | 45, 15 / 15, 5 | µg/m³ | WHO AQG 2021 | [verify] |
| NAAQS 24 h exceedance allowance | 2% of days (× months × 365/12 over the programme) | days | NAAQS 2009 note 2 (met 98% of the time, never two consecutive days) | [verify] |
| Heat-wave threshold, plains | 40 | °C (daily max, IST) | IMD heat-wave criteria; NDMA heat-wave guidelines 2019 | [verify] |
| Upfront carbon targets A1–A5 | office/retail/mixed 600 (2020), 350 (2030); residential 500, 300 | kgCO2e/m² | LETI Climate Emergency Design Guide 2020 (office values for retail and mixed) | [verify] |
| CAQM C&D dust portal registration | ≥ 500 | m² site area | CAQM directions for NCR | [verify] |
| CAQM anti-smog guns | 1 from 5,000; 2 from 10,000; 3 from 15,000; 4 from 20,000 | m² site area | CAQM / DPCC directions for NCR | [verify] |

## A.5 Quantities, programme and vehicle movement (D-020)

1. **Quantities from geometry:** GFA = footprint × floors; concrete = 0.45 m³/m² × GFA (HANDOVER A.4 **[verify]**);
   rebar = 45 kg/m² × GFA (HANDOVER A.4 **[verify]**); masonry = opaque facade area × wall thickness; glass = window
   area × 10 mm × 2,500 kg/m³ (HANDOVER A.4 **[verify]**); excavation (bank) = footprint × basements × basement
   storey depth; loose spoil = bank × bulking factor.
2. **Auto programme:** excavation months = ceil(bank volume ÷ daily excavation rate ÷ working days per month);
   structure months = ceil((floors + basements) × floor cycle days ÷ working days per month); finishing months =
   ceil(structure months × finishing share). **User override:** total or per phase; if only the total changes,
   phases scale proportionally (rounded, with the remainder added to structure). Values ≤ 0 are rejected; values
   below 50% of auto raise a warning.
3. **Vehicle movement:** loaded loads = quantity ÷ vehicle capacity (rounded up); one-way trips = 2 × loads (empty
   return); trips/day = trips ÷ (phase months × working days per month); on-site VKT/day = trips/day × haul route
   length (site gate to footprint centroid, from geometry); off-site t·km = mass × transport distance (A4).
   Spoil → excavation phase; concrete and rebar → structure phase; masonry and glass → finishing phase.

| Parameter | Default | Unit | Source | Status |
|---|---|---|---|---|
| Basements | 1 | storeys | Envelope demo default | [verify] (editable) |
| Basement storey depth | 3.6 | m | Equal to floor-to-floor (D-004) | [verify] |
| Bulking factor, excavated soil | to source | – | Earthworks swell factor tables | to source |
| Transit mixer capacity | to source | m³ | Indian RMC practice | to source |
| Tipper capacity (spoil) | to source | m³ loose | Indian practice | to source |
| Materials truck payload | to source | t | Indian practice | to source |
| Daily excavation rate | to source | m³/day | Contractor practice | to source |
| RCC floor cycle time | to source | days/floor | Contractor practice | to source |
| Finishing share of structure | 0.75 | – | HANDOVER A.2.1 ratio (9 ÷ 12 months) | [verify] |
| Working days per month | to source | days | 6-day week practice | to source |
| Transport distances (concrete, steel, aggregate, masonry, glass) | to source | km | Site-specific | to source |

## A.6 Building import (D-027)

An uploaded model becomes the same `BuildingSpec` as `fixtures/demo/building.json`; every model, the map and the
report run from it unchanged. Parsing happens in the browser (web-ifc in a Web Worker); nothing is uploaded.

| Spec field | From an IFC file | Rule |
|---|---|---|
| floors | `IfcBuildingStorey` with elevation ≥ 0 | Storeys named like roof levels (roof, terrace, parapet, mumty, OHT, machine room) and storeys without elements are not counted; both are listed as warnings |
| floorToFloorM | Storey `Elevation` × length unit | Median gap between counted storeys and the next level above |
| Basements assumption | Storeys with elevation < 0 | Count and mean depth per storey set the Basements and Basement depth assumptions (they drive excavation volume, spoil trucks and the programme) |
| footprint | Meshes of the ground storey's elements (plan = x, −z of the Y-up mesh) | Convex hull, simplified to ≤ 12 vertices; warning when it exceeds the ground slab's top area by more than 15% (L/U shapes) |
| wwr | `IfcWindow` OverallWidth × OverallHeight (else the window mesh box) | Each window goes to the nearest footprint edge; WWR = window area ÷ (edge length × height) per orientation, capped at 0.9; no windows → 0.4 with a warning |
| quantities.concreteM3 | `Qto_*BaseQuantities` NetVolume (else GrossVolume) × volume unit | Slabs, beams, columns, footings and piles unless their material is steel or timber; walls only if their material names concrete, RCC or an M/C grade. Used only within 0.15–1.2 m³ per m² of floor area |
| site.lat/lon | `IfcSite` RefLatitude/RefLongitude (degrees, minutes, seconds, millionths) | Shown for confirmation, never applied silently; otherwise address search or typed coordinates |
| rotation | `TrueNorth` of the model context: bearing of model +Y = −atan2(tx, ty) | Plus the dialog's rotation slider; the footprint is rotated before conversion to lon/lat |
| name, use | `IfcBuilding.Name`, `Pset_BuildingCommon.OccupancyType` | Editable in the dialog |

Mesh-only files (.glb, .gltf, .obj): ground level is y = 0 when the mesh dips below it by at most a quarter of its
height (foundations and paving modelled below ground), otherwise the lowest point. The footprint is the convex hull of
vertices at least min(2.5 m, 0.3 × height) above ground, so paving, kerbs and plant pots do not widen it (overhangs
still do). The model's height above ground is shown and, once floors are typed, fills floor-to-floor = height ÷ floors;
a typed height more than 15% off the model's is flagged. Basements are set to 0 (mesh files carry none). WWR
defaults to 0.4, and OBJ files take a unit (m, cm, mm, ft). Closed formats (.rvt, .pln, .skp, .dwg) show how to export
IFC from the authoring tool. Placement is limited to India (lat 6–37, lon 68–98): the engine works in IST and the rules
are Indian. `validateSpec` (building.ts) rejects non-convex or clockwise footprints, floors outside 1–100, floor heights
of 0 m or less (no upper or lower range otherwise; any footprint size) and WWR outside 0–0.9. The imported mesh replaces the parametric massing on the map in the finishing
phase (except under the GHG layer); the maths always uses the spec.

Site data: a live fetch refreshes the committed demo snapshot only within 1 km of the demo plot, and the snapshot stands
in for failed live data only there; an imported building elsewhere shows "unavailable" instead of Gurugram's data.

## A.7 Report narrative grounding: retrieval and citations (D-036)

Not a physics model: it decides which source passages the narrative may cite. No number in the report comes from it;
the number validator is unchanged and passage text never joins the set of allowed numbers.

1. **Corpus and chunks.** PDFs listed in `corpus/manifest.json` → text lines per page (pdf.js) → cleaning: running
   headers and footers (lines on ≥ 40% of pages, given ≥ 3 pages), page numbers, superscript reference numbers,
   lines that are ≥ 30% Devanagari (bilingual Gazette pages), hyphenation → word windows of 220 words every
   180 words (40-word overlap), each tagged with the nearest heading above it and its start page. Bibliographies
   (windows under a "References" heading, or with six or more citation-style years such as "May 1984. ") and tables
   (over 35% numeric tokens) are not indexed. Plain year counts are not used: consolidated notifications cite many
   amendment dates (that rule had removed the EIA item 8(a) threshold).
2. **Embeddings and queries.** BAAI bge-small-en-v1.5 (384 dimensions, MIT licence), int8 ONNX, CLS pooling, unit
   length; queries carry the model's retrieval instruction prefix. Vectors are stored int8 (× 127) in
   `corpus/index.json`. Two kinds of query (`packages/report/src/rag/queries.ts`):
   - *Fixed*: per report section, plus one per enabled dust measure. Their vectors are computed at build time, so the
     server loads no model; they also set each section's relevance floor (item 4).
   - *Payload*: built from each report: compliance rows, the EIA built-up-area check, site-caused exceedance days,
     background PM10 above the NAAQS annual limit (G.S.R. 94(E) applies where ambient PM exceeds the NAAQS), the two
     largest dust sources, enabled measures (dust ones to the dust section, GHG ones to the GHG section), receptor
     types and the first sentence of each limitation. Scored by BM25 only. A payload query that names a corpus
     document through one of its aliases (`aliases` in the manifest, e.g. "EIA Notification") searches that
     document; any other must share at least 3 distinct terms with a chunk that clears the section's floor.
3. **Scores.** Dense: cosine of query and chunk vectors. Sparse: Okapi BM25,
   w = Σ_t IDF(t) · f(t)·(k1 + 1) / (f(t) + k1·(1 − b + b·|d|/avgdl)), IDF(t) = ln(1 + (N − n_t + 0.5)/(n_t + 0.5)).
   Fusion per query: reciprocal rank fusion, RRF(d) = Σ_lists 1/(k + rank(d)), over the top 50 of each list.
4. **Selection.** Per section, round robin over its queries' rankings, payload queries first and interleaved with
   the fixed ones (adjacent overlapping windows of the same document skipped). Two passes: every section first takes
   up to 3 passages, then sections with more distinct queries take up to 5, within at most 24 per report, numbered
   S1… in order of selection. A chunk whose cosine to every fixed query of the section is below 0.72 is not eligible,
   so a section whose source is not in the corpus receives no passages instead of unrelated ones.
5. **Prompt.** Each passage is sent as an excerpt of at most 90 words: the sentence with the most query-term overlap,
   grown toward its better-scoring neighbour. Gemini receives up to 24 passages; Groq the first 3,
   because its free tier allows 8,000 tokens per minute and 8 excerpts came to 8,040–8,452 (413, eval of 2026-10-26). Citations are
   validated against the passages that provider was sent. The LLM receives `llmView(payload)`: the assumptions
   register rows (rendered as Annex A, not narrated) and the `compliance` list (a copy of the compliance table) are
   left out, about 30% fewer characters; numbers are still validated against the full payload. Measured on Groq
   (2026-10-27): 4,541 prompt tokens without passages, 4,881 with 3; 7,673 tokens with the completion, under the
   8,000 tokens-per-minute free tier.
6. **Citation checks** (`packages/report/src/validator.ts`). Markers [S1] or [S1, S4]. A marker that names no
   retrieved passage drops its sentence. A sentence that mentions a law, standard or regulator (pattern
   `REGULATORY_RE` in `rag/citations.ts`) without a marker is flagged; in LLM text it is sent back in the retry and
   dropped by the final strict pass. Template text is flagged only. Weak support (fewer than two shared content
   words between the sentence and every cited passage) is counted, not dropped. Cited passages are renumbered in
   reading order and listed under References with document, issuer, year, heading, page, URL, access date and a
   25-word excerpt.

| Parameter | Default | Unit | Source | Status |
|---|---|---|---|---|
| BM25 k1, b | 1.2, 0.75 | – | Manning, Raghavan & Schütze (2008), *Introduction to Information Retrieval*, §11.4.3; Robertson & Zaragoza (2009) | cited |
| RRF constant k | 60 | – | Cormack, Clarke & Büttcher (2009), SIGIR, "Reciprocal rank fusion outperforms Condorcet and individual rank learning methods" | cited |
| Embedding model | bge-small-en-v1.5, CLS pooling, query prefix | – | BAAI model card (Hugging Face) | cited |
| Chunk length / overlap | 220 / 40 | words | Envelope default | [verify] (evaluation, docs/RAG_EVAL.md) |
| Relevance floor | 0.72 | cosine | Envelope default, set between the best unrelated match (0.69–0.71) and relevant matches (≥ 0.73) on this corpus | [verify] (recalibrate when the corpus changes) |
| Passages per section (base / max) / per report | 3 / 5 / 24 | – | Envelope default (prompt size, Vercel 80 s narrative budget) | [verify] |
| Payload query term overlap (no named document) | ≥ 3 distinct terms | – | Envelope default | [verify] |
| Excerpt sent to the LLM | 90 | words | Envelope default (prompt size) | [verify] |
| Passages sent per provider | Gemini 24, Groq 3 | – | Groq free tier: 8,000 tokens per minute; 8 excerpts requested 8,040–8,452 (413, measured 2026-10-26) | [verify] |
| Background PM10 trigger for the non-attainment query | > 60 | µg/m³ | NAAQS 2009 annual PM10 limit (compliance/rules.ts) | cited |
| Header/footer repeat share | 40% of pages | – | Envelope default | [verify] |
| Reference/table filter | "References" heading, ≥ 6 citation-style years, or > 35% numeric tokens | – | Envelope default | [verify] |
| Weak-support overlap | < 2 content words | – | Envelope default (review signal only) | [verify] |


## A.8 Background PM: station correction of CAMS (D-038)

CAMS global (via Open-Meteo, ~45 km) overestimates background PM10 in Delhi NCR: at the 6 held-out Gurugram and
Manesar stations its hourly mean bias is +245 µg/m³. A gradient-boosted model maps CAMS + ERA5
at a site to station-like hourly PM10 and PM2.5. Training code: `ml/` (Python, dev-only); shipped trees and model
card: `packages/models/src/data/`; evaluator and features: `packages/models/src/background.ts`.

1. **Target.** CPCB continuous monitoring stations from the OpenAQ open data archive (S3, 15-minute values) →
   hourly means labelled by hour end (≥ 3 of 4 quarter-hours) → QC: values ≤ 0 and fault codes ≥ 9,999 dropped;
   15-minute values above 2,000 µg/m³ (PM10) or 1,000 µg/m³ (PM2.5) dropped; runs of ≥ 6 identical hourly values
   dropped; hours with PM2.5 > 1.1 × PM10 dropped. Model target log1p(PM); back-transform
   ŷ = expm1(f)·S + S − 1 with Duan's smearing factor S = mean(exp(residual)) on the training data.
2. **Inputs**, fetched exactly as the app fetches them (`packages/data/src/clients.ts`): CAMS pm10, pm2_5, dust,
   AOD; 3 h and 24 h trailing means of pm10, pm2_5 and dust; dust/PM10 and PM2.5/PM10 ratios; ERA5 temperature,
   RH, dew point, pressure, wind speed, gusts, wind direction (sin, cos), cloud, precipitation and its 24 h sum,
   shortwave, soil moisture, boundary-layer height and its 24 h mean; IST hour and day of year (sin, cos), weekend.
   No station identity or coordinates, so the model has to generalise to the site.
3. **Data window.** 2025-02-01 to 2026-10-15: OpenAQ has no CPCB data for NCR from Nov 2022 to Jan 2025, and CAMS
   on Open-Meteo starts in 2023. 58 stations with data within ~46 km of the demo site.
4. **Validation.** Spatial test: the 6 Gurugram/Manesar stations, never trained on. Time test: the other stations
   from 2026-02-01. Boosting rounds chosen by 5-fold GroupKFold by station on the training set (PM10 1292,
   PM2.5 1494). Shipped model: refit on all stations and hours with the same settings.
   Spatial test, CAMS → corrected: PM10 hourly RMSE 592 → 103 µg/m³,
   bias +245 → +2 µg/m³, daily R² -30.01 →
   0.47; PM2.5 hourly RMSE 87 → 67 µg/m³,
   daily R² -0.35 → 0.33; PM2.5 exceedance-day hit rate
   0.90 → 0.68 (the correction undercounts PM2.5
   exceedance days). Full metrics: `ml/out/metrics.json`; model card: `packages/models/src/data/background-card.json`.
5. **Application.** The server corrects a site's year of CAMS once (about 1 s, then cached) when the site is within
   25 km of a training station; the engine then uses the corrected PM10/PM2.5 as the dust background (CAMS dust and
   AOD unchanged). Elsewhere it keeps raw CAMS, and the status line, Data sheet and report say so. Raw CAMS is always
   shown beside the corrected values. A parity test checks the TypeScript features against pandas and the
   predictions against LightGBM.

| Parameter | Default | Unit | Source | Status |
|---|---|---|---|---|
| LightGBM settings | learning rate 0.08, 31 leaves, ≥ 200 rows per leaf, 0.8 feature and bagging fractions, L2 1.0 | – | Envelope default; rounds by grouped CV | [verify] |
| Hourly / daily completeness | ≥ 3 of 4 quarter-hours; ≥ 18 of 24 h | – | The usual 75% completeness rule | [verify] |
| QC caps (15 min) | PM10 2,000, PM2.5 1,000; fault codes ≥ 9,999 | µg/m³ | Envelope default; removed 0.1% of PM10 hours (NCR 2025-26) | [verify] |
| Flatline run | ≥ 6 identical hourly values | h | Envelope default | [verify] |
| PM2.5/PM10 consistency | PM2.5 ≤ 1.1 × PM10 | – | Envelope default | [verify] |
| Trained area | within 25 km of a training station | km | About half a CAMS global grid cell (~45 km) | [verify] |
| Smearing back-transform | mean of exp(residuals) | – | Duan, N. (1983), J. Am. Stat. Assoc. 78(383), 605–610 | cited |
