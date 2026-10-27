"""Station PM10/PM2.5 from the OpenAQ open data archive (public S3, daily CSV per location).

    uv run fetch_obs.py --region ncr

15-minute CPCB values → hourly means (≥ 3 of 4 quarter-hours) → quality control → one parquet per
station in .cache/biascorr/obs. Hours are labelled by their end, like Open-Meteo's hourly values.
"""

from __future__ import annotations

import argparse
import gzip
import io
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import requests

from common import END, OBS_DIR, START, stations

S3 = "https://openaq-data-archive.s3.amazonaws.com"
# QC thresholds (Envelope defaults, MODELS.md A.8 [verify]).
MIN_QUARTERS = 3  # of 4 per hour, the usual 75% completeness rule
FLATLINE_HOURS = 6  # identical consecutive hourly values: stuck instrument
PM25_OVER_PM10 = 1.10  # PM2.5 above PM10 by more than 10%: at least one is wrong
# CPCB feeds carry fault codes (9999.9, 99999) and corrupt values (up to 2.8e13 µg/m³ seen). Fault
# codes go first; the caps keep hourly urban background plausible while dust-storm hours in the low
# thousands of µg/m³ survive (they removed 0.1% of PM10 hours, 2025-26 NCR).
FAULT_CODE = 9999
MAX_15MIN = {"pm10": 2000, "pm25": 1000}

_local = threading.local()


def get(url: str, **kw) -> requests.Response:
    """GET with retries (S3 drops some connections under parallel load) on a per-thread session,
    so connections are reused: the bucket is in us-east-1 and each new TLS handshake costs ~1 s."""
    if not hasattr(_local, "s"):
        _local.s = requests.Session()
    for attempt in range(6):
        try:
            return _local.s.get(url, timeout=60, **kw)
        except requests.RequestException:
            time.sleep(2**attempt)
    raise RuntimeError(f"failed after retries: {url}")


def keys(loc: int) -> list[str]:
    def month(m: pd.Period) -> list[str]:
        prefix = f"records/csv.gz/locationid={loc}/year={m.year}/month={m.month:02d}/"
        return re.findall(r"<Key>([^<]+)</Key>", get(S3, params={"list-type": "2", "prefix": prefix}).text)

    with ThreadPoolExecutor(8) as pool:
        return [k for ks in pool.map(month, pd.period_range(START, END, freq="M")) for k in ks]


def day(key: str) -> pd.DataFrame:
    r = get(f"{S3}/{key}")
    if r.status_code != 200:
        return pd.DataFrame()
    df = pd.read_csv(io.BytesIO(gzip.decompress(r.content)), usecols=["datetime", "parameter", "value"])
    return df[df["parameter"].isin(["pm10", "pm25"])]


def flatline(s: pd.Series) -> pd.Series:
    """True for values in a run of FLATLINE_HOURS or more identical consecutive values."""
    run = (s != s.shift()).cumsum()
    size = s.groupby(run).transform("size")
    return (size >= FLATLINE_HOURS) & s.notna()


def hourly(raw: pd.DataFrame) -> pd.DataFrame:
    raw = raw.copy()
    t = pd.to_datetime(raw["datetime"], utc=True)
    # A 15-minute value stamped 01:00 covers 00:45–01:00 and belongs to the hour ending 01:00.
    raw["hour_end"] = (t - pd.Timedelta(seconds=1)).dt.floor("h") + pd.Timedelta(hours=1)
    raw = raw[(raw["value"] > 0) & (raw["value"] < FAULT_CODE)]
    raw = raw[raw["value"] <= raw["parameter"].map(MAX_15MIN)]
    g = raw.groupby(["hour_end", "parameter"])["value"].agg(["mean", "count"]).reset_index()
    g = g[g["count"] >= MIN_QUARTERS]
    h = g.pivot(index="hour_end", columns="parameter", values="mean").sort_index()
    h = h.reindex(columns=["pm10", "pm25"])
    for p in ("pm10", "pm25"):
        h.loc[flatline(h[p].round(1)), p] = None
    bad = h["pm25"] > PM25_OVER_PM10 * h["pm10"]
    h.loc[bad, ["pm10", "pm25"]] = None
    return h.dropna(how="all")


def fetch(st: dict) -> str:
    path = OBS_DIR / f"{st['id']}.parquet"
    if path.exists():
        return f"{st['id']} cached"
    ks = keys(st["id"])
    with ThreadPoolExecutor(16) as pool:
        parts = [d for d in pool.map(day, ks) if not d.empty]
    if not parts:
        return f"{st['id']} {st['name']}: no data"
    h = hourly(pd.concat(parts))
    h.to_parquet(path)
    return f"{st['id']} {st['name'][:40]}: {len(ks)} days, {h['pm10'].notna().sum()} PM10 h, {h['pm25'].notna().sum()} PM2.5 h"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="ncr")
    args = ap.parse_args()
    sts = stations(args.region)
    print(f"{len(sts)} stations, {START} to {END}", flush=True)
    with ThreadPoolExecutor(3) as pool:
        for line in pool.map(fetch, sts):
            print(line, flush=True)
