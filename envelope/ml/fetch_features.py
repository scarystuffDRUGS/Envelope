"""CAMS and ERA5 hourly features at each station, fetched exactly as the app fetches them.

    uv run fetch_features.py --region ncr

Same endpoints, variables and parameters as packages/data/src/clients.ts (archiveUrl, airQualityUrl),
so the model sees at inference what it saw in training. One parquet per station.
"""

from __future__ import annotations

import argparse
import time

import pandas as pd
import requests

from common import END, FEAT_DIR, START, stations

# Must match WEATHER_VARS and AIR_VARS in packages/data/src/clients.ts.
WEATHER = [
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "surface_pressure",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "cloud_cover",
    "precipitation",
    "shortwave_radiation",
    "soil_moisture_0_to_7cm",
    "boundary_layer_height",
]
AIR = ["pm10", "pm2_5", "dust", "aerosol_optical_depth"]


def get(url: str, params: dict) -> dict:
    for attempt in range(5):
        r = requests.get(url, params=params, timeout=120)
        if r.status_code == 429:
            time.sleep(30 * (attempt + 1))
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"rate limited: {url}")


def fetch(st: dict) -> str:
    path = FEAT_DIR / f"{st['id']}.parquet"
    if path.exists():
        return f"{st['id']} cached"
    common = {
        "latitude": f"{st['lat']:.4f}",
        "longitude": f"{st['lon']:.4f}",
        "start_date": START,
        "end_date": END,
        "timezone": "GMT",
    }
    w = get(
        "https://archive-api.open-meteo.com/v1/archive",
        {**common, "wind_speed_unit": "ms", "hourly": ",".join(WEATHER)},
    )["hourly"]
    a = get("https://air-quality-api.open-meteo.com/v1/air-quality", {**common, "hourly": ",".join(AIR)})["hourly"]
    df = pd.DataFrame({**{k: w[k] for k in WEATHER}, **{f"cams_{k}": a[k] for k in AIR}})
    df.index = pd.to_datetime(w["time"], utc=True)
    df.to_parquet(path)
    time.sleep(1)  # Open-Meteo fair use
    return f"{st['id']} {st['name'][:40]}: {len(df)} h"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="ncr")
    args = ap.parse_args()
    for st in stations(args.region):
        print(fetch(st), flush=True)
