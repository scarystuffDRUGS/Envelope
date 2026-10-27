# Envelope

Construction-phase environmental impact analysis on a 3D map: dust (PM10/PM2.5), heat (surface temperature and
worker heat stress) and greenhouse gases (A1–A5), with mitigation scenarios and an exportable assessment report.
Screening-level (Tier 1–2) models; see `docs/MODELS.md`.

## Setup (Windows, macOS or Linux)

1. Install **Node.js 20+** (https://nodejs.org).
2. Install pnpm 9:
   ```
   npm i -g pnpm@9
   ```
   Open a **new** terminal afterwards so `pnpm` is on the PATH.
3. In this folder, install dependencies and the Chromium used for PDF export:
   ```
   pnpm i
   pnpm exec playwright install chromium
   ```
4. Create `.env` from the template and fill in the keys (ask the team lead; never commit `.env`):
   ```
   cp .env.example .env
   ```
   - `CESIUM_ION_TOKEN`: Google Photorealistic 3D Tiles via Cesium ion. Without it the app shows an OpenStreetMap basemap.
   - `GEMINI_API_KEY`, `GROQ_API_KEY`: report narrative. Without them the report uses a built-in template writer.

## Run

```
pnpm dev
```

Open http://localhost:5173 (API on port 8787). Weather, air-quality and OSM data for the demo site are committed in
`fixtures/demo/`, so the app works offline.

## Demo flow

1. The building appears on its plot in Gurugram; the hour and construction month (Analysis tab) move the sun and the building.
2. Layers (left): D dust, H surface temperature, U worker heat stress, G GHG on the envelope.
3. Mitigation (left panel or the Mitigation tab presets): the KPI table on the right compares baseline and mitigated.
4. Analysis → Worst dust day / Hottest day jumps to the critical day.
5. Report → Export report produces a PDF (A4) with tables, maps and a validated narrative.

## Commands

```
pnpm test        # unit tests (models, report validator)
pnpm test:e2e    # Playwright end-to-end (needs pnpm dev running or starts it)
pnpm lint && pnpm typecheck
pnpm snapshot:demo   # refresh fixtures/demo from the live APIs
pnpm rag:build       # rebuild corpus/index.json from corpus/raw PDFs (report citations, D-036)
pnpm rag:eval        # cited-narrative evaluation → docs/RAG_EVAL.md (uses the LLM keys)
cd ml && uv run fetch_obs.py && uv run fetch_features.py && uv run train.py && uv run card.py   # retrain the background PM correction (needs uv)
pnpm build:vercel    # production build into .vercel/output (what Vercel runs)
```

## Import your building

Project → **Import model** opens the import dialog. An IFC file (.ifc, IFC2x3 or IFC4) gives the floors, floor
height, basements, footprint, window-to-wall ratios, concrete volume and, if the file has them, the site
coordinates; check them, then place the building by address search or latitude/longitude (India only) and line it up
with the rotation slider. .glb, .gltf and .obj files import as a mesh (you type the floors and floor height). Revit,
Archicad, SketchUp and AutoCAD files show how to export IFC. The file is read in your browser and never uploaded.
"Use demo building" in the same dialog switches back. Details: `docs/MODELS.md` A.6.

## Deploy to Vercel

One Vercel project serves the web app as static files and the API (`/api/*`) as one Node function, built with the
Build Output API by `scripts/build-vercel.mjs` (D-026). PDF export uses `@sparticuz/chromium` 153, the
Lambda-sized build of the Chromium that Playwright 1.63 drives.

1. **Import the repo** at https://vercel.com/new (GitHub `Lakshya-0601/Envelope`). Leave the framework preset as
   *Other* and the root directory as the repo root: `vercel.json` sets the install and build commands.
2. **Environment variables** (Project → Settings → Environment Variables, Production and Preview):

   | Name | Needed for | Notes |
   |---|---|---|
   | `CESIUM_ION_TOKEN` | Google 3D tiles | On ion, add the Vercel domain(s) to the token's allowed URLs, or the map falls back to OpenStreetMap |
   | `GEMINI_API_KEY` | Report narrative (first choice) | Server-side only |
   | `GEMINI_MODEL` | Optional | Default `gemini-3.5-flash`, with built-in fallbacks |
   | `GROQ_API_KEY` | Report narrative (fallback) | Server-side only |
   | `GROQ_MODEL` | Optional | Default `openai/gpt-oss-120b` |
   | `REPORT_RATE_LIMIT`, `REPORT_RATE_WINDOW_MIN` | Optional | Reports per visitor per window; default 5 per 10 min |
   | `SITE_DATA_RATE_LIMIT` | Optional | Site-data requests per visitor per window; default 60 |

   Without the LLM keys the report still exports, written by the deterministic template.
3. **Deploy.** Check `https://<your-domain>/api/health`: every key you set should show `true` (values are never
   returned). Then export a report once; the first export after an idle period takes 5–10 s longer while Chromium
   unpacks.

Limits to know: report requests are capped at 4 MB (map snapshots are downscaled to 1,600 px for this), the function
may run up to 120 s (LLM narrative budget 80 s, then the template takes over), and rate limits (Vercel only; off in local runs) are per function
instance, so they are a guard against quota abuse rather than an exact global limit. Live API responses are cached in
the function's temp directory; the committed `fixtures/demo` snapshot is the fallback when live data fails.

Decisions and known issues: `docs/DECISIONS.md`, `docs/BUGS.md`.
