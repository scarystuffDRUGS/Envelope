"""Model card for the shipped background correction: packages/models/src/data/background-card.json.

    uv run card.py      (after train.py)

Training period, stations (with coordinates, for the trained-area check), held-out test metrics.
"""

from __future__ import annotations

import json
from datetime import date

from common import END, GURUGRAM_TEST, MODEL_DIR, OBS_DIR, OUT_DIR, START, stations

# A site counts as inside the trained area within this distance of a station that has data: about
# half a CAMS global grid cell (~0.4°, ~45 km), the scale on which CAMS errors were learned.
TRAINED_AREA_KM = 25


def pick(e: dict) -> dict:
    h, d, x = e["hourly"], e["daily"], e["exceedanceDays"]
    r = lambda v: None if v is None else round(v, 2)  # noqa: E731
    return {
        "stations": e["stations"],
        "hours": h["corrected"]["n"],
        "hourlyRmse": {"cams": r(h["cams"]["rmse"]), "corrected": r(h["corrected"]["rmse"])},
        "hourlyBias": {"cams": r(h["cams"]["bias"]), "corrected": r(h["corrected"]["bias"])},
        "dailyR2": {"cams": r(d["cams"]["r2"]), "corrected": r(d["corrected"]["r2"])},
        "exceedance": {
            "limit": x["limit"],
            "obsDays": x["cams"]["obsDays"],
            "cams": {"days": x["cams"]["predDays"], "pod": r(x["cams"]["pod"]), "far": r(x["cams"]["far"])},
            "corrected": {"days": x["corrected"]["predDays"], "pod": r(x["corrected"]["pod"]), "far": r(x["corrected"]["far"])},
        },
    }


m = json.loads((OUT_DIR / "metrics.json").read_text())
with_data = {int(p.stem) for p in OBS_DIR.glob("*.parquet")}
sts = [s for s in stations("ncr") if s["id"] in with_data]
card = {
    "id": f"cams-correction-ncr-{date.today().isoformat()}",
    "region": "Delhi NCR",
    "period": {"from": START, "to": END},
    "method": "LightGBM gradient-boosted trees on log1p(station PM), Duan smearing back-transform",
    "inputs": "CAMS global (Open-Meteo air quality) PM10, PM2.5, dust, AOD; ERA5 (Open-Meteo archive); hour, day of year, weekend",
    "target": "CPCB continuous ambient monitoring stations via the OpenAQ archive, hourly means",
    "trainedAreaKm": TRAINED_AREA_KM,
    "stations": [
        {"id": s["id"], "name": s["name"], "lat": round(s["lat"], 4), "lon": round(s["lon"], 4), "heldOut": s["id"] in GURUGRAM_TEST}
        for s in sts
    ],
    "heldOutStations": [s["name"] for s in sts if s["id"] in GURUGRAM_TEST],
    "metrics": {pol: {"spatialTest": pick(m[pol]["spatialTest"]), "timeTest": pick(m[pol]["timeTest"])} for pol in ("pm10", "pm25")},
    "timeSplit": m["timeSplit"],
    "limitations": [
        "Trained on about 20 months (Feb 2025 to Oct 2026): OpenAQ has no CPCB data for NCR from Nov 2022 to Jan 2025.",
        "Valid only near the training stations; elsewhere the app uses raw CAMS.",
        "The strongest inputs are humidity, rainfall and season, so the model partly learns the NCR seasonal cycle.",
        "Corrected PM2.5 undercounts days above the 24-hour limit at the held-out stations.",
    ],
}
(MODEL_DIR / "background-card.json").write_text(json.dumps(card, indent=1))
print(f"{len(sts)} stations; PM10 spatial test RMSE {card['metrics']['pm10']['spatialTest']['hourlyRmse']}")
