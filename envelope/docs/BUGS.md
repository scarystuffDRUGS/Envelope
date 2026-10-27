# BUGS.md — Envelope

Bugs found during checkpoint testing. Fix before moving to the next checkpoint.

| ID | Checkpoint | Found by | Steps to reproduce | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| B-001 | 0 | Team | Run `pnpm dev` from the desktop preview tool | API on 8787, web on 5173 | API server bound 5173 because the tool sets `PORT` | Fixed (D-014) |
| B-002 | 0 | Team | Load the app in dev | No console errors | "Keyborg instance … disposed incorrectly" from StrictMode double mount | Fixed (D-013) |
| B-003 | 1 | Team | Load the site with Google tiles and shadows on | Clean ground and roof | Moiré shadow acne on tiles and roof | Fixed (D-018) |
| B-004 | 1 | Team | Load the app after adding Cesium | Workers and assets load from /cesium | vite-plugin-static-copy v4 kept full source paths, so /cesium/* returned index.html | Fixed (`rename: { stripBase: 4 }`) |
| B-005 | 2 | User | Change month after results load | Building matches the month | Floor rings floated above a stale frame volume (reused Cesium entity ids) | Fixed (auto ids) |
| B-006 | 2 | User | Open the UTCI layer at 14:00 in July | Informative map | Whole domain one category (red) | Fixed: UTCI shown on site + 50 m, continuous ramp |
| B-007 | 2 | Team | Export report with Gemini/Groq keys | LLM narrative | gemini-2.5-flash 404 (closed to new keys), Groq llama-3.3 404 | Fixed: gemini-3.5-flash → 3-flash-preview → flash-latest; Groq openai/gpt-oss-120b |
| B-008 | 4 | External review | Export the report; read section 4 | GHG method sentence present | Validator read "EN 15978" as a figure not in the payload and dropped the sentence | Fixed: validator skips standard and module identifiers |
| B-009 | 4 | External review | Export the report; follow table references | Tables numbered in reading order | Table 6 cited in section 4 before Tables 4–5 appeared (numbered by array order) | Fixed: `TABLE_ORDER` + `tableRef` |
| B-010 | 4 | External review | Read Table 1 Scope 1/2 and heat-stress hours | Figures explained | DG power in Scope 1 (so Scope 2 = 0), selected hour and the working-hour denominator were not stated | Fixed: diesel split rows, table notes |
| B-011 | 4 | Import review | Load a building at another site with live data | Demo snapshot untouched | Every live fetch overwrote fixtures/demo/*.json with that site's data | Fixed: snapshot written only within 1 km of the demo plot |
| B-012 | 4 | Import review | Load a building elsewhere with live data and cache failing | "Unavailable" for that site | The Gurugram snapshot was returned for any location | Fixed: snapshot fallback only within 1 km of the demo plot |
| B-013 | 4 | Team | Export a report with Gemini configured | Gemini narrative | Gemini 3.5 Flash thinking took 154 s, past the timeout, so Groq always wrote it | Fixed: thinkingLevel low for Gemini 3 (27 s) |
| B-014 | 4 | Receptor review | Site next to a large campus | Campus listed | Receptor at the campus centre; a campus whose centre was over 500 m away was dropped even with its fence next to the site | Fixed: nearest outline point, distance from the plot boundary |
| B-015 | 4 | Receptor review | Read the "nearest school or hospital" KPI | Schools and hospitals only | Maximum taken over residential areas too; bare "–" when none | Fixed: education and health receptors only, report explains coverage |
| B-016 | 4 | Receptor review | One Overpass failure, then load another site | Lookup retried | All OSM lookups blocked for 10 minutes; receptors silently empty | Fixed: separate receptor query, all mirrors within 15 s, 5-minute per-query back-off |
| B-017 | 4 | Report checker (Coffee Shop · Delhi) | Import stone_atelier…glb (walls 10 × 8 m, 7.3 m tall, paving and foundation below y = 0), 2 floors | Footprint ≈ 81–88 m², height ≈ 7.3 m, on the ground | Hull included the 13.4 × 11.4 m paving slab and plant pots (159 m²); ground at the foundation bottom lifted the model 1.3 m; height came only from the typed floor height (12 m) | Fixed (D-030) |
| B-018 | 4 | Report checker | Import any mesh with no basement | No basement | Demo default of 1 basement storey applied: 717 m³ excavation and extra concrete | Fixed: mesh imports set basements to 0 |
| B-019 | 4 | Report checker | Export a report for a Delhi site | Exceedances stated against limits; CAQM anti-smog gun requirement stated | Max temperature, background PM10, P98, exceedance days and A1–A5 intensity reported without their limits; no anti-smog gun line | Fixed (D-030) |
| B-020 | 4 | User | Place any building on Google 3D tiles in a built-up area | Clean edge where the plot meets its neighbours | Deep carved pit: neighbouring meshes cut at the plot line showed black hollow walls above the hoarding; with the cut closed (D-031) the plot still sat below its surroundings | Fixed (D-033): only the footprint is clipped, plot keeps its ground |
| B-021 | 4 | User | Place a building in central Delhi; read the school/hospital indicators | Nearby schools and hospitals assessed | "–" and "no change": overpass-api.de refused connections and mirrors timed out, so receptors were never looked up | Fixed (D-031): Nominatim fallback; Inspector explains empty values |
