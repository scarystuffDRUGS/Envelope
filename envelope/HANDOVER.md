# HANDOVER.md — Build brief

> **How to use this file:** start from the kickoff brief in §1. The builder asks the questions in §2,
> then builds phase by phase, stopping after each phase for testing.
> App name chosen: **Envelope** (docs/DECISIONS.md D-001).

---

## 1. Kickoff brief

```
Read HANDOVER.md fully before doing anything.

We are building Envelope: a 3D environmental impact analysis web app for a hackathon demo. A company
sees its building as a 3D model on Google Photorealistic 3D Tiles at its real location, analyses Dust,
Heat and Greenhouse-gas impact as toggleable heat-map layers driven by free live data APIs, toggles
mitigation measures and sees results change live, then exports a regulator-ready Environmental
Sustainability Assessment Report (LLM-written narrative, deterministic numbers).

Step 1: Ask me the questions in HANDOVER.md §2, a few at a time. Do not guess the answers. Where I say
"you decide", choose the default listed and record it in docs/DECISIONS.md.
Step 2: Propose the Phase 0 plan. Wait for my approval.
Step 3: Build the phases in §4 in order. At the end of every phase: run lint, typecheck, unit tests and
e2e; start the dev server; then give me a short manual test checklist and stop until I confirm or
report bugs. Log bugs in docs/BUGS.md and fix them before the next phase.

Rules: follow the non-negotiables and UI rules strictly. Every control must work and
carry a data-testid. Every model formula must match docs/MODELS.md and have a unit test with a
hand-checked reference value. Ask me for API keys when you need them and tell me exactly which
console page and settings to use; never print or commit keys.
```

---

## 2. Questions to answer before building

| # | Question | Default if "you decide" |
|---|---|---|
| 1 | Demo site: address or lat/lng, and city? | A plot in Gurugram, Haryana (high dust, high heat, NCR regulations) |
| 2 | The building: do you have a model (glTF, IFC, SketchUp) or should we generate a parametric one? Use type, floors, footprint size, construction stage? | Parametric office, 12 floors × 3.6 m, 45 m × 30 m footprint, 40% WWR, RCC frame, pre-construction stage |
| 3 | Assessment scope: construction-phase dust, operational phase, or both? | Dust = construction phase + site susceptibility; Heat and GHG = operational phase; embodied carbon included |
| 4 | Basemap access: Google Maps Platform key with Map Tiles API enabled, or Cesium ion token? | Cesium ion token (simplest), Google key as backup |
| 5 | LLM keys available: Gemini (Google AI Studio), Groq, both? | Both; Gemini primary |
| 6 | Report: PDF only or also Word? Company name, logo, colours for the cover? | PDF + DOCX; neutral template with a placeholder logo |
| 7 | Which regulator or rating is the report aimed at (SPCB, SEIAA/EIA, GRIHA, IGBC, BRSR)? | Generic Indian submission with an indicative compliance matrix covering NAAQS, MoEFCC/CPCB dust measures, EIA 2006 item 8, ECSBC 2024 |
| 8 | Where does the demo run: your laptop only, or hosted (Vercel/Render)? Expected Wi-Fi at the venue? | Laptop, with offline snapshot mode |
| 9 | Team size, deadline, and who tests? | Assume 2–4 people, ~10 days, user tests after every phase |
| 10 | Preferred name (from the shortlist) | Chosen: **Envelope** |

---

## 3. Product spec

### 3.1 User flow (the demo script)

1. **Open app** → no login, no splash. Loads the demo project. Camera flies from a city view to the site in
   about 2 s. The building stands on Google 3D tiles; the original mesh under its footprint is clipped away.
   Shadows on, current local time.
2. **Explore** → orbit, pan, zoom, compass reset, "Fit to site". Hover anywhere: the probe shows the value of
   every active layer at that point.
3. **Analysis ribbon** → time mode selector: *Design hot day* (P99 hottest day of last year), *Worst dust day*,
   *Annual statistics*, *Live (next 5 days)*. Hour scrubber 0–23 h with play button.
4. **Layers panel** → toggle and set opacity for: Dust concentration (PM10 or PM2.5 switch; metric: selected
   hour / 24 h mean / annual mean / P98 of 24 h), Surface temperature, Pedestrian heat stress (UTCI),
   GHG on envelope (kgCO2e/m²·yr), Shadows, Wind rose, Sensitive receptors, Neighbour buildings.
5. **Mitigation panel** → checkboxes with parameter fields (Appendix C). Each toggle re-runs the models and
   animates the layer change; KPI table shows Baseline | Mitigated | Δ | Δ%.
6. **Inspector** → KPIs, charts (monthly emissions, hourly UTCI, dust exceedance days), editable assumptions
   (spreadsheet cells; changed cells highlighted; "Reset to default").
7. **Report ribbon → Export** → dialog: report title, company, prepared by, sections to include, scenario
   (baseline, mitigated, or both), format (PDF/DOCX). Progress steps: *Building payload → Capturing maps →
   Writing narrative → Validating figures → Rendering PDF*. Preview in-app, then download.

### 3.2 Screens and components

- **Title bar:** app name, project name (editable), save state, Help.
- **Ribbon** (Fluent `TabList` + grouped buttons with labels under icons, Excel style):
  - Project: New from template, Open, Save, Import building JSON/glTF, Project settings.
  - Site: Search location, Set site, Edit footprint, Refresh data, Data sources.
  - Analysis: Time mode, Hour, Run annual, Grid resolution, Domain size, Units.
  - Mitigation: Presets (*None*, *CPCB minimum*, *Best practice*, *Net-zero ready*), Compare scenarios.
  - Report: Export report, Preview, Export data (CSV/XLSX), Snapshot image.
- **Left panel:** Layers tree; Mitigation checklist.
- **Viewport overlays:** legend (top-right), compass + zoom (right), scale bar and Google attribution
  (bottom), hover probe, "Cached data" notice if live data failed.
- **Right Inspector:** KPI table, charts, assumptions.
- **Bottom status bar + Data sheet** with tabs Climate | Dust | Heat | GHG | Assumptions (AG Grid; copy to clipboard).
- **Keyboard:** D/H/G toggle layers, M toggles mitigated view, ←/→ hour, F fit to site, Ctrl+E export.

### 3.3 Performance budgets

First render of building + tiles < 4 s on a mid laptop with warm cache · single-hour layer update < 300 ms ·
annual run < 5 s (worker, progress bar) · export < 60 s · no frame drops below 30 fps while orbiting.

---

## 4. Build phases (each ends with tests + a manual checklist + a stop)

**Phase 0 — Foundations.** Monorepo, lint/format, Vitest, Playwright, Fluent UI theme tokens, `.env.example`,
server skeleton with health route and cache, `docs/` files. Move Appendix A of this file into
`docs/MODELS.md`, and the data-source details into `docs/DATA_SOURCES.md`.
*Checklist:* app shell loads with ribbon, panels and status bar; no console errors.

**Phase 1 — 3D site.** Cesium viewer with Google Photorealistic 3D Tiles (fallback basemap), parametric
building from `building.json`, clipping polygon, camera fly-in, shadows tied to the hour scrubber, probe,
compass, fit-to-site, location search.
*Checklist:* building sits on the ground at the right place; moving the hour moves the shadows.

**Phase 2 — Data layer.** API clients and normalisers for Open-Meteo (archive, forecast, air quality, elevation),
OSM Overpass (buildings, land use, receptors), SoilGrids, OpenAQ, NASA POWER; caching (server file cache +
IndexedDB); `pnpm snapshot:demo`; Data sheet shows climate tables; status bar shows freshness per source.
*Checklist:* kill the network → app still runs from snapshot and says so.

**Phase 3 — Dust module.** Emissions, dispersion, background, susceptibility index, PV soiling (Appendix A.2);
dust layer draped on tiles; legend; receptor table vs NAAQS/WHO; dust mitigations.
*Checklist:* toggling "Cover stockpiles" lowers the plume near stockpiles; numbers match a hand calculation
shown in the test log.

**Phase 4 — Heat module.** Land-cover raster, sky view factor, shadows, surface energy balance, Tmrt, UTCI,
anthropogenic heat (Appendix A.3); two layers; heat mitigations.
*Checklist:* cool roof turns the roof cooler on the map and lowers cooling energy in the GHG KPI.

**Phase 5 — GHG module.** Geometry takeoff, 5R1C hourly energy model, PV, embodied carbon, Scope 1/2/3,
envelope colouring (Appendix A.4); GHG mitigations; monthly chart.
*Checklist:* EPI is within the sanity range for the building type; PV toggle changes net emissions and colours
the roof.

**Phase 6 — Scenario engine and UI polish.** Presets, compare view (split or swipe), assumptions editing,
keyboard shortcuts, empty/loading/error states, the click-everything e2e test.
*Checklist:* every button, toggle and field does something visible; the e2e test passes.

**Phase 7 — Report export.** Payload builder, compliance rule engine, map snapshot capture, LLM narrative
with schema + number validator + fallback writer, HTML template, PDF (and DOCX), preview (Appendix B).
*Checklist:* export with Wi-Fi off still produces a full report (fallback writer); every figure in the text
matches the tables.

**Phase 8 — Demo hardening.** Demo script mode (fixed camera path and hour), performance pass, error boundaries,
README with setup steps, final visual review against the UI rules.

---

## 5. Test plan (summary; full version in docs/TEST_PLAN.md)

- **Unit (Vitest), with hand-checked references:**
  - Gaussian plume, Briggs urban class D, Q = 1 g/s, u = 1 m/s, x = 100 m, ground source and receptor on the
    centreline: σy ≈ 15.69 m, σz ≈ 13.79 m, C = Q/(π u σy σz) ≈ 1,471 µg/m³.
  - AP-42 13.2.4 drop equation, U = 3 m/s, M = 2%: E_PM10 = 0.35 × 0.0016 × (3/2.2)^1.3 / (2/2)^1.4 ≈ 8.38 × 10⁻⁴ kg/Mg.
  - Fécan moisture threshold, clay 20%: w′ = 0.0014·20² + 0.17·20 = 3.96%.
  - UTCI(Ta 25 °C, Tmrt 25 °C, v 1.0 m/s, RH 50%) ≈ 24.6 °C (pythermalcomfort documentation example).
  - Solar position vs the NOAA calculator for the site on 21 June at 12:00 local.
  - Open-Meteo azimuth conversion: a north-facing facade (compass 0°) maps to Open-Meteo azimuth 180.
  - PV annual yield within 1,350–1,700 kWh/kWp for north/central Indian sites.
  - Report validator rejects a sentence containing a number absent from the payload.
- **E2E (Playwright):** click-everything (enumerate all `[data-testid^="ctl-"]`, operate each, assert store
  change and a visible change); full export flow; offline mode; visual snapshots of the shell.
- **Manual:** the per-phase checklists above, run by the user.

---

## 6. Name shortlist (chosen: Envelope)

Halo · Envelop · Airshed · Vayu · Ambit · Siteglass · Plume · Prithvi
(Check domain and trademark availability before you commit. "Plume" overlaps with Plume Labs, an air-quality brand.)

---

# Appendix A — Model specification (move to docs/MODELS.md in Phase 0)

All models are screening-level. Every default below must be checked against its cited source
when implementing; anything marked **[verify]** is a reasonable default whose source must be confirmed or
replaced before the demo, and its uncertainty shown in the Assumptions panel.

## A.1 Shared inputs and geometry

- **Site:** lat, lon, elevation, timezone. **Domain:** square, default 1,200 m, centred on the building.
  **Grids:** 10 m for single-hour layers; 20 m for annual statistics.
- **Weather (hourly):** Open-Meteo Archive (ERA5) for the last complete calendar year (typical-year proxy);
  Forecast API for Live mode. Variables: temperature_2m, relative_humidity_2m, dew_point_2m, surface_pressure,
  wind_speed_10m, wind_direction_10m, wind_gusts_10m, cloud_cover, precipitation, shortwave_radiation,
  direct_radiation, diffuse_radiation, direct_normal_irradiance, global_tilted_irradiance (per facade/PV
  orientation), soil_moisture_0_to_1cm (or 0_to_7cm in archive), boundary_layer_height (when the model provides
  it; else estimate from stability). Request wind in m/s.
- **Air quality (hourly):** Open-Meteo Air Quality (CAMS): pm10, pm2_5, dust, aerosol_optical_depth, carbon_dioxide.
- **Sun position:** NREL SPA or the NOAA algorithm (SunCalc acceptable if it matches NOAA within 0.5°).
- **Building geometry** from `building.json`: footprint polygon → local ENU; per edge: length, outward normal
  azimuth (compass), facade area = length × height, window area = facade area × WWR(orientation). Roof area =
  footprint area. GFA = footprint × floors. Volume = footprint × total height.
- **Neighbours:** OSM buildings within the domain; height = `height` tag, else `building:levels` × 3.2 m,
  else 9 m **[verify per city]**. Used for shadows, sky view factor and roughness.
- **Land cover raster:** rasterise OSM polygons (building, landuse, natural, leisure=park, water, amenity
  parking) and buffered roads (lanes × 3.5 m). Unknown cells = "urban mixed paved". Optional: ESA WorldCover
  10 m from the Microsoft Planetary Computer STAC to fill gaps.

Surface classes (defaults, **[verify]** against Oke et al. 2017, *Urban Climates*):

| Class | Albedo α | Emissivity ε | Evaporative fraction EF | Storage coeff. c_G | Roughness z0 (m) | Erodible |
|---|---|---|---|---|---|---|
| Asphalt / road | 0.10 | 0.95 | 0.00 | 0.40 | 0.05 | No |
| Concrete paving | 0.25 | 0.92 | 0.00 | 0.35 | 0.05 | No |
| Roof, conventional | 0.20 | 0.90 | 0.00 | 0.20 | — | No |
| Bare soil / construction site | 0.25 | 0.93 | 0.10 (varies with soil moisture) | 0.30 | 0.01 | Yes |
| Grass | 0.23 | 0.96 | 0.50 | 0.15 | 0.03 | No |
| Trees | 0.15 | 0.97 | 0.60 | 0.10 | 1.0 | No |
| Water | 0.08 | 0.97 | 0.90 | 0.50 | 0.001 | No |

## A.2 Dust module

Three outputs: (1) **site emissions and their dispersion** (construction phase), (2) **background exposure**
from regional dust, (3) **dust susceptibility** of the site and building, including PV soiling.

### A.2.1 Emission sources (hourly, PM10 and PM2.5)

Construction schedule (default, editable): 24 months — excavation 3, structure 12, finishing 9. Each phase sets
active area, exposed area, material throughput, haul trips/day, working hours (default 08:00–20:00).

1. **General construction activity** (WRAP Fugitive Dust Handbook, 2006): PM10 = 0.11 short tons/acre/month
   for general construction, 0.42 for active large-scale earthmoving **[verify]**. Convert: 1 short ton/acre/month
   = 2.2417 Mg/ha/month. Spread over working hours. PM2.5 = 0.10 × PM10 **[verify]**.
2. **Wind erosion of exposed soil and stockpiles** (physically based):
   - Friction velocity (neutral log law): u* = κ·U10 / ln(10/z0), κ = 0.4, z0 from land cover.
   - Dry threshold u*t0 by soil texture or material (AP-42 13.2.5 Table 13.2.5-2 values; default 0.30 m/s for
     disturbed soil **[verify]**).
   - Moisture correction (Fécan et al., 1999): w′ = 0.0014·clay² + 0.17·clay (clay in %, w′ in % gravimetric);
     w = 100·θv·ρw/ρb (θv from soil moisture, ρb from SoilGrids or 1.5 g/cm³);
     if w > w′: u*t = u*t0·[1 + 1.21·(w − w′)^0.68]^0.5, else u*t = u*t0.
   - Horizontal saltation flux (White, 1979): Q = C·(ρa/g)·u*³·(1 + u*t/u*)·(1 − (u*t/u*)²) for u* > u*t, else 0;
     C = 2.61, ρa from pressure and temperature.
   - Vertical dust flux (Marticorena & Bergametti, 1995): F = α·Q, α (cm⁻¹) = 10^(0.134·clay% − 6); convert α to m⁻¹ (×100).
   - PM10 = f_PM10 × F, default f_PM10 = 0.5 **[verify]**; PM2.5 = 0.15 × PM10 **[verify]**.
   - Emission = F × exposed area × (1 − control efficiency). Zero when precipitation in the hour > 0.25 mm.
3. **Material handling** (AP-42 13.2.4): E (kg/Mg) = k × 0.0016 × (U/2.2)^1.3 / (M/2)^1.4; k_PM10 = 0.35,
   k_PM2.5 = 0.053; U = wind speed (m/s), M = material moisture (%, default 2). Throughput from concrete and
   aggregate quantities (A.4.4) over the structure phase.
4. **Haul traffic on unpaved roads** (AP-42 13.2.2, industrial roads): E (lb/VMT) = k·(s/12)^a·(W/3)^b;
   PM10: k = 1.5, a = 0.9, b = 0.45; PM2.5: k = 0.15, a = 0.9, b = 0.45. s = silt % (default 8.5 for construction
   sites **[verify]**), W = mean vehicle weight (tons). 1 lb/VMT = 281.9 g/VKT. Zero in hours with rain > 0.25 mm.

### A.2.2 Dispersion (steady-state Gaussian plume)

- Area sources split into sub-squares ≤ 10 m treated as virtual point sources with initial σy0 = side/4.3,
  σz0 = release height/2.15. Release height default 1–3 m by source.
- C(x, y, z) = Q / (2π·u·σy·σz) · exp(−y²/2σy²) · [exp(−(z−H)²/2σz²) + exp(−(z+H)²/2σz²)], receptor z = 1.5 m,
  only x > 0 (downwind) contributes.
- **Stability class** (Pasquill–Turner): day by incoming solar radiation (strong > 600 W/m², moderate 300–600,
  slight < 300); night by cloud cover (≥ 4/8 → E/D, ≤ 3/8 → F/E); overcast day or night → D.

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
  Add initial σ in quadrature.
- **Wind at release height:** power law with urban exponents (A/B 0.15, C 0.20, D 0.25, E/F 0.30); floor 1.0 m/s.
  Calm hours (U10 < 0.5 m/s) are flagged and handled with u = 0.5 m/s; their count is reported.
- **Mixing height:** if σz > 1.6·h_mix, switch to the uniformly mixed form C = Q/(√(2π)·u·σy·h_mix)·exp(−y²/2σy²).
- **Annual statistics efficiently:** bin hours by (16 directions × 6 speeds × 6 stabilities); compute a unit-emission
  field per occupied bin once; each hour = emission(h) × field(bin(h)). Accumulate daily means per cell, then
  annual mean, max 24 h and P98 of 24 h means (the NAAQS statistic).
- **Total concentration** = CAMS background (pm10/pm2_5 at the site hour) + site increment.
- **Thresholds:** NAAQS 2009 — PM10 100 µg/m³ (24 h), 60 (annual); PM2.5 60 (24 h), 40 (annual). WHO 2021 —
  PM10 45 / 15; PM2.5 15 / 5. Report both; never claim compliance, only indicative comparison.
- **Sensitive receptors:** OSM schools, hospitals, clinics, kindergartens and residential areas within 500 m;
  table of increment and total at each.
- **Validation:** compare CAMS background with the nearest OpenAQ station (bias, correlation) and show it in the
  Methodology section.

### A.2.3 Dust susceptibility index (DSI, 0–100, transparent heuristic)

DSI = 35% × min(1, annual background PM10 / 60) + 25% × min(1, dust-event hours / 500) + 20% × share of
hours with u* > u*t on upwind erodible land + 20% × share of dry days (precip < 1 mm). Weights editable;
label it "heuristic" in UI and report. Dust-event hour: CAMS `dust` > 100 µg/m³ **[verify threshold]**.

### A.2.4 PV soiling (links dust to GHG)

Port the HSU soiling model (Coello & Boyle, 2019; implemented in pvlib `soiling.hsu`): accumulation from PM2.5
and PM10 with settling velocities, cleaning when rain over a rolling window exceeds a threshold (default 1 mm/day).
Output: daily soiling ratio and annual PV energy loss %, fed into A.4 PV yield. Mitigation: cleaning interval.

## A.3 Heat module

Outputs: surface temperature Ts (°C), pedestrian UTCI (°C and stress category), heat-stress hours per year,
anthropogenic heat from building cooling (W), ΔTs vs pre-development land cover.

1. **Shadows:** for each cell centre, ray toward the sun against building prisms (our building + OSM neighbours,
   2.5D). Shaded cells receive no direct beam.
2. **Sky view factor:** 36 azimuth rays, max obstruction elevation β_i within 200 m; SVF = 1 − (1/36)·Σ sin²β_i.
3. **Downwelling longwave:** e_a (hPa) from dew point; ε_clear = 1.24·(e_a/Ta)^(1/7) (Brutsaert, Ta in K);
   ε_sky = min(1, ε_clear·(1 + 0.22·c²)) with c = cloud fraction; L↓ = SVF·ε_sky·σTa⁴ + (1 − SVF)·σ(Ta + 2)⁴
   **[verify wall term]**.
4. **Surface energy balance per cell (steady state, solved with Newton–Raphson):**
   K* = (1 − α)·(I_dir·cos θ·(1 − shade) + I_dif·SVF + α_env·K↓·(1 − SVF));
   R_n = K* + ε·L↓ − εσTs⁴; G = c_G·R_n; λE = EF·max(0, R_n − G); H = h_c·(Ts − Ta), h_c = 5.7 + 3.8·u_local
   (u_local = 0.5·U10 near ground **[verify]**); solve R_n − G − λE − H = 0 for Ts.
   For roofs, use the roof class and the roof height wind.
5. **Mean radiant temperature at 1.1 m** (SOLWEIG-style simplification): absorbed shortwave from direct
   (projected-area factor for a standing person, f_p ≈ 0.308·cos(h·(1 − h²/48402)) with sun altitude h in degrees),
   diffuse (·SVF) and ground-reflected (α_ground·K↓); longwave from sky (L↓), ground (εσTs⁴) and walls;
   a_k = 0.70, ε_p = 0.97; Tmrt = [S_str/(ε_p·σ)]^0.25 − 273.15.
6. **UTCI:** `utci(tdb, tr, v, rh)` from **jsthermalcomfort** (CBE port of pythermalcomfort); pedestrian wind
   v10 = U10 scaled for urban roughness, clamped to 0.5–17 m/s; enforce validity ranges and flag cells out of range.
   Categories: > 46 extreme, 38–46 very strong, 32–38 strong, 26–32 moderate heat stress, 9–26 no thermal stress.
7. **Anthropogenic heat:** Q_AH = Q_cool·(1 + 1/COP) from A.4, released at the roof; shown as an annotation and
   as a small box-model air-temperature increment downwind **[clearly labelled as indicative]**.
8. **Heat-stress hours:** annual count of hours with UTCI > 32 °C at a site-boundary pedestrian ring.

Mitigation effects flow through parameters: albedo, EF, shading geometry, roof U-value, facade surface properties.

## A.4 Greenhouse-gas module

Boundary: building operation (Scopes 1 and 2) and materials and construction (Scope 3, A1–A5), 50-year reference
period, reported per year and total, in tCO2e.

1. **Hourly energy model:** ISO 13790 simple hourly method (5R1C, Annex C). Reference implementation to port and
   test against: RC_BuildingSimulator (ETH Zurich, open source). One thermal zone per building (optionally one per
   orientation bucket). Inputs: U-values (wall, roof, window), SHGC, infiltration ACH, ventilation per person and per m²
   (NBC 2016 / ASHRAE 62.1), internal gains (people, LPD, EPD) with schedules by use type (ECSBC default schedules
   **[verify]**), cooling setpoint 25 °C, heating 20 °C (if any).
   Solar gains per facade = Σ window area × SHGC × global_tilted_irradiance(tilt 90°, facade azimuth) ×
   (1 − neighbour shading fraction).
   Latent load from ventilation: ρ·V̇·h_fg·max(0, W_out − W_in).
2. **Electricity:** cooling (sensible + latent)/COP_system (baseline 2.8 **[verify]**) + fans/pumps (10% of cooling)
   + lighting LPD·A·schedule + equipment EPD·A·schedule + lifts (by floors). Report EPI (kWh/m²·yr) with a
   sanity band per use type (office ~ 100–200) **[verify against BEE star-rating benchmarks]**.
3. **Operational emissions:** Scope 2 = grid kWh × 0.710 tCO2/MWh (CEA v21.0, FY 2024-25; editable).
   Scope 1 = DG backup (outage hours × load share × 0.30 L/kWh × 2.68 kgCO2/L **[verify]**) + refrigerant leakage
   (charge 0.3 kg/kW cooling × 5%/yr × GWP: R-410A 2,088, R-32 675, AR4 values **[verify AR basis]**).
4. **Embodied carbon (A1–A3):** quantities per m² GFA by structure type (RCC frame defaults: concrete 0.45 m³/m²,
   rebar 45 kg/m², masonry by wall area, glass = window area × 10 mm × 2,500 kg/m³, aluminium frames
   **[verify]**) × emission factors from ICE v3 or India-specific sources such as IFC EDGE **[verify; prefer India
   data for cement and steel]**. A4–A5: transport distance and construction diesel defaults.
5. **Rooftop PV:** kWp = usable roof area × coverage × 0.18 kWp/m²; hourly AC = kWp × GTI(tilt = latitude,
   azimuth south)/1000 × PR 0.80 × [1 − 0.004·(T_cell − 25)] × soiling ratio (A.2.4);
   T_cell = Ta + (NOCT − 20)/800 × GTI, NOCT 45 °C.
6. **Envelope colouring:** each facade/roof surface coloured by its share of annual cooling-driven emissions per m²
   (conduction + solar gains). With PV on, the roof shows kWh/m²·yr generation instead.
7. **Uncertainty (Phase 6, optional):** 200-sample Monte Carlo over key uncertain inputs (COP, U-values, emission
   factors, schedules); show P10–P90 ranges in the report.

---

# Appendix B — Report specification

**Rule:** narrative from the LLM; every number, table, chart and map from the payload. A4, print CSS, page
numbers, running header with project name and version, figure and table numbering.

**Sections:**
Cover · Document control · Contents ·
1 Executive summary (KPI table baseline vs mitigated; top recommended measures) ·
2 Project description (geometry table, use, schedule, site map) ·
3 Site and baseline environment (climate summary, wind rose, background air quality, land cover, receptors) ·
4 Methodology and data sources (models, sources with fetch timestamps and resolution, assumptions register, validation) ·
5 Dust impact assessment ·
6 Heat impact assessment ·
7 Greenhouse-gas assessment ·
8 Mitigation measures and Environmental Management Plan (measure, phase, responsibility, monitoring frequency, KPI) ·
9 Indicative compliance matrix (regulation, requirement, project status, evidence reference) ·
10 Monitoring plan ·
11 Limitations and uncertainty (screening-level models; not a substitute for an EIA by a NABET-accredited
consultant or AERMOD-based assessment) ·
12 References · Annexures (calculation tables, assumptions, hourly data summary).

**Compliance rule engine** (deterministic, in `rules.ts`, each item with citation and `verifiedOn`):
NAAQS 2009 comparison at receptors · MoEFCC/CPCB dust mitigation measures by site-area band (< 5,000 m²;
5,000–20,000 m²; > 20,000 m²) as a checklist matched to enabled mitigations **[verify current notification]** ·
EIA Notification 2006 item 8(a)/(b) applicability by built-up area **[verify thresholds and amendments]** ·
ECSBC 2024 applicability by connected load / contract demand and EPI comparison **[verify]** ·
optional GRIHA/IGBC indicative points · BRSR Scope 1/2 disclosure fields.

**LLM pipeline:**
1. Build `ReportPayload` JSON (project, geometry, climate summary, results per scenario, compliance results,
   assumptions, provenance).
2. One call with JSON schema output: `{ sections: [{ id, title, paragraphs: string[] }] }`. Temperature 0.2–0.3.
   System prompt: senior Indian environmental consultant writing for a regulator; formal, third person, concise;
   use only numbers present in the payload with their units; refer to tables and figures by number; say
   "indicative" for compliance; no marketing language; no mention of AI.
3. Validator: extract every number from the text; each must match a payload value at displayed precision
   (±0.5%). Banned phrases: "compliant", "guaranteed", "AI-generated". Failure → one retry with the error list →
   else drop the offending sentence and log it.
4. Fallback writer: deterministic templates per section when no LLM is reachable.
5. Render HTML → Playwright PDF; DOCX via the `docx` npm package from the same section model.
6. Map snapshots: for each layer, baseline and mitigated, capture the Cesium canvas
   (`preserveDrawingBuffer`, render then `toDataURL`) from a fixed oblique camera.

**LLM choice:** Gemini Flash on the Google AI Studio free tier (large context, native JSON schema output, strong
formal writing) as primary; Groq (`gpt-oss-120b` or `llama-3.3-70b-versatile`) as fast fallback. Free tiers have
low per-minute limits and may use inputs for training, so use a paid key for real client data. Read model IDs
from env and check the provider's model list at server start.

---

# Appendix C — Mitigation catalogue (defaults are [verify] unless cited during implementation)

| Measure | Module | What changes | Default effect |
|---|---|---|---|
| Water sprinkling of haul roads (2×/day) | Dust | Unpaved-road emissions | −55% |
| Paved or WMM haul roads | Dust | Unpaved → paved factors | −90% |
| Wind barriers / site barricades | Dust | Wind-erosion and handling emissions | −50% |
| Cover stockpiles and materials | Dust | Stockpile wind erosion | −90% |
| Green netting on scaffolding | Dust | Building-level handling emissions | −30% |
| Anti-smog gun / fog cannon | Dust | Near-site increment | −30% (low evidence; flag) |
| Wheel washing at exit | Dust | Trackout share of road emissions | −80% of trackout |
| High-wind work stoppage (slider, m/s) | Dust | Emissions zero above threshold | Rule-based |
| Cool roof (SRI ≥ 78) | Heat, GHG | Roof α 0.20 → 0.70, ε 0.90 | Via model |
| Green roof (extensive) | Heat, GHG | Roof α 0.25, EF 0.5, roof U −30% | Via model |
| Shade trees (count, canopy radius) | Heat, GHG | Shaded cells, EF, facade shading | Via model |
| Cool / permeable paving | Heat | Paving α 0.10 → 0.35 | Via model |
| Vertical greening / external shading | Heat, GHG | Facade surface temp, effective SHGC −40% | Via model |
| High-performance glazing | GHG | U 5.7 → 1.8 W/m²K, SHGC 0.60 → 0.25 | Via model |
| Envelope to ECSBC / ECSBC+ / Super | GHG | Wall/roof U per code tables | Via model |
| Efficient HVAC | GHG | System COP 2.8 → 5.0 | Via model |
| LED + daylight controls | GHG | LPD 10 → 5 W/m² | Via model |
| BMS / controls | GHG | HVAC −10%, lighting −15% | Assumption |
| Rooftop PV (coverage %) | GHG | Generation, net grid kWh | Via model |
| Panel cleaning interval | Dust, GHG | Soiling ratio | Via model |
| Low-carbon concrete (GGBS/fly ash %) | GHG | Concrete emission factor | −20% to −40% |
| Low-GWP refrigerant (R-32) | GHG | Leakage emissions | Via GWP |
| Green power purchase (%) | GHG | Scope 2 grid share | Linear |

Presets: **CPCB minimum** (dust measures required for the site-area band), **Best practice** (all dust measures,
cool roof, trees, glazing, efficient HVAC, LED, PV 50%), **Net-zero ready** (Best practice + Super envelope +
PV max + green power 100% + low-carbon concrete).
