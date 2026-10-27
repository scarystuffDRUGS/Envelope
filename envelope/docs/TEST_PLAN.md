# TEST_PLAN.md — Envelope

Gate at the end of every checkpoint: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`, then the dev server
and the user's manual checklist. Bugs go to `docs/BUGS.md` and are fixed before the next checkpoint.

## Unit (Vitest): hand-checked reference values

| Area | Case | Expected | Checkpoint | Status |
|---|---|---|---|---|
| Hash | FNV-1a 32 test vectors "", "a", "foobar" | 811c9dc5, e40c292c, bf9cf968 | 0 | done |
| Server cache | Round trip, freshness, key hash ("abc" → SHA-1 a9993e36…) | as stated | 0 | done |
| Units | en-IN grouping, units always attached, true minus sign | as stated | 0 | done |
| Schedule | Month → phase at boundaries 3/4, 15/16, 24 | as stated | 0 | done |
| Gaussian plume | Briggs urban D, Q = 1 g/s, u = 1 m/s, x = 100 m, ground source and receptor on centreline | σy ≈ 15.69 m, σz ≈ 13.79 m, C ≈ 1,471 µg/m³ | 2 | |
| AP-42 13.2.4 | U = 3 m/s, M = 2% | E_PM10 = 0.35 × 0.0016 × (3/2.2)^1.3 ≈ 8.38 × 10⁻⁴ kg/Mg | 2 | |
| AP-42 13.2.5 Example 2 | flat area, fastest mile 14.6 m/s, u*t 0.54 m/s, 670 m² | u* 0.77 m/s, P 8.82 g/m², 3.0 kg PM10 | 4 | done |
| AP-42 13.2.5 Example 1 | u*t 1.12 m/s, u* 1.23 / 1.27 / 1.31 m/s | P 3.45 / 5.06 / 6.84 g/m² | 4 | done |
| Erosion event (demo defaults) | u⁺10 11.52 m/s, u*t 1.02 m/s, 300 m² pile | flat 0; pile 0.9 regime 7.855 g PM10 | 4 | done |
| AP-42 13.2.2 | s = 8.5%, W = 20 t (hand-calculated in the test file) | PM10 lb/VMT | 2 | |
| Stability class | Table cases (day strong < 2 m/s → A; night ≤ 3/8, 2–3 m/s → F) | as table | 2 | |
| UTCI | Ta 25 °C, Tmrt 25 °C, v 1.0 m/s, RH 50% | ≈ 24.6 °C | 3 | |
| Solar position | Site, 21 June 12:00 IST vs NOAA calculator | within 0.5° | 1 | |
| Azimuth conversion | compass 0° (north facade) → Open-Meteo 180; 90° → −90; 180° → 0 | as stated | 2 | |
| Embodied carbon | Hand-calculated quantity × factor for one material | as calculated | 3 | |
| Import helpers | DMS 28° 24′ 21.6″ → 28.406°; hull, simplify, nearest edge, WWR 60 m² ÷ (20 m × 10 m) = 0.3 | as stated | 4 | done |
| IFC import | fixtures/import/synthetic-block.ifc: 3 floors × 3.5 m (mm units), 1 basement 3 m, 20 × 10 m, windows 3.6 + 1.8 m², 160 m³ concrete, true north 30° | as stated | 4 | done |
| Report validator | Rejects a sentence containing a number absent from the payload | rejected | 4 | done |
| Background tree evaluator | Two-split tree: thresholds, NaN default side, None missing type, smearing | hand-computed expm1 values | B | done |
| Background parity | TypeScript features vs pandas on the demo snapshot; predictions vs LightGBM on 200 rows per pollutant | equal (features 1e-6, predictions 0.01 µg/m³) | B | done |
| Background on the server | Demo site corrected (mean below CAMS); Chennai outside the trained area | as stated | B | done |
| Payload with correction | Raw / corrected means side by side; model card status and held-out rows; template passes the validator | as stated | B | done |
| BM25 | Two documents, query "dust", k1 1.2, b 0.75 | ln 2 · 2.2 / 2.38 = 0.6407 | RAG | done |
| Chunking | Running header, page numbers, Hindi line, hyphenation; window pages | removed / rejoined; window 2 starts on page 2 | RAG | done |
| Citations | Unknown [S7] dropped; uncited NAAQS sentence flagged, dropped in strict mode; weak support counted; [S3] never read as a figure | as stated | RAG | done |
| Citation renumbering | [S3] then [S1, S3] | [S1] then [S2, S1]; References S1 = old S3 | RAG | done |
| Payload queries | Compliance row, EIA check, exceedance, background > 60 µg/m³, top dust source, dust vs GHG measures, receptors, first sentence of a limitation; none when dynamic is off | as stated | RAG | done |
| LLM payload view | Assumptions rows and duplicate compliance list left out; table positions and unverified count kept; full payload unchanged | as stated | RAG | done |
| Prompt excerpt | Best-matching sentence plus its better neighbour within the word limit | as stated | RAG | done |
| Corpus index | Every query has a vector; NAAQS retrieved for dust and compliance; template citations all valid | as stated | RAG | done |

## E2E (Playwright, Chromium)

- `shell.spec.ts`: all shell regions visible, zero console errors, arrow-key hour stepping, project name persistence,
  help dialog, visual snapshot.
- `click-everything.spec.ts`: discovers every `[data-testid^="ctl-"]` reachable from each ribbon tab, operates each one
  from a fresh load (click, slider arrow key, or text entry), and asserts that both the store and the visible screen
  change. Zero console errors.
- Later: export flow (checkpoint 4), offline mode with the network blocked (checkpoint 2).

## Evaluation

`pnpm rag:eval`: five mitigation scenarios × (LLM with retrieval, LLM without, template with retrieval); citation
validity, weak support, cited share of regulatory sentences, dropped sentences, retries and time. Results in
`docs/RAG_EVAL.md`. `pnpm rag:eval --template` runs without LLM calls.

## Manual

The per-checkpoint checklists, run by the user.
