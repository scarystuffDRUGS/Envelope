"""Shared paths, station lists and the training window for the CAMS background PM correction (D-038)."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "biascorr"
OBS_DIR = CACHE / "obs"
FEAT_DIR = CACHE / "features"
OUT_DIR = ROOT / "ml" / "out"
# Shipped with the app: trained trees and the parity fixtures for the TypeScript evaluator.
MODEL_DIR = ROOT / "packages" / "models" / "src" / "data"
for d in (OBS_DIR, FEAT_DIR, OUT_DIR, MODEL_DIR):
    d.mkdir(parents=True, exist_ok=True)

load_dotenv(ROOT / ".env")

# OpenAQ has no CPCB data for NCR between Nov 2022 and Jan 2025, and CAMS via Open-Meteo starts in
# 2023, so the overlap starts with the new CPCB sensors (Feb 2025). ERA5 lags about 5 days.
START = "2025-02-01"
END = "2026-10-15"

SITE = (28.406, 77.085)  # demo site, fixtures/demo/building.json

# Gurugram and Manesar stations: held out entirely as the spatial test (closest to the demo site).
GURUGRAM_TEST = {10825, 10900, 10921, 301, 5570, 6953}

REGIONS = {
    # Four 25 km circles cover Delhi NCR (OpenAQ's maximum radius is 25 km).
    "ncr": [(28.406, 77.085), (28.61, 77.21), (28.72, 77.12), (28.41, 77.31)],
}


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    c = math.sin(la1) * math.sin(la2) + math.cos(la1) * math.cos(la2) * math.cos(lo2 - lo1)
    return 6371 * math.acos(min(1.0, c))


def stations(region: str) -> list[dict]:
    """CPCB reference monitors in the region (OpenAQ v3 locations), cached in .cache/biascorr."""
    path = CACHE / f"stations-{region}.json"
    if path.exists():
        return json.loads(path.read_text())
    key = os.environ["OPENAQ_API_KEY"].strip()
    seen: dict[int, dict] = {}
    for lat, lon in REGIONS[region]:
        r = requests.get(
            "https://api.openaq.org/v3/locations",
            params={"coordinates": f"{lat},{lon}", "radius": 25000, "limit": 200, "iso": "IN"},
            headers={"X-API-Key": key},
            timeout=60,
        )
        r.raise_for_status()
        for loc in r.json()["results"]:
            if loc.get("isMonitor") and (loc.get("provider") or {}).get("name") == "CPCB":
                seen[loc["id"]] = {
                    "id": loc["id"],
                    "name": loc["name"],
                    "lat": loc["coordinates"]["latitude"],
                    "lon": loc["coordinates"]["longitude"],
                }
    out = sorted(seen.values(), key=lambda s: km(SITE, (s["lat"], s["lon"])))
    path.write_text(json.dumps(out, indent=1))
    return out
