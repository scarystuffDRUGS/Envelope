"""Trains the CAMS background PM correction (D-038, MODELS.md A.8) and evaluates it.

    uv run train.py

Target: log1p(station PM) per pollutant, back-transformed with Duan's smearing factor. Splits:
  spatial test   the Gurugram and Manesar stations (common.GURUGRAM_TEST), never trained on
  time test      the other stations from TIME_SPLIT on
  train          the other stations before TIME_SPLIT; GroupKFold by station picks the rounds
The shipped model is then refit on all stations and hours with the same settings.
Writes ml/out/metrics.json and, into packages/models/src/data, background-<pollutant>.json and the parity fixtures.
"""

from __future__ import annotations

import json

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold

from common import FEAT_DIR, GURUGRAM_TEST, MODEL_DIR, OBS_DIR, OUT_DIR, ROOT, SITE, km, stations

TIME_SPLIT = pd.Timestamp("2026-02-01", tz="UTC")
POLLUTANTS = {"pm10": "cams_pm10", "pm25": "cams_pm2_5"}
# NAAQS 2009 24-hour limits (packages/models/src/compliance/rules.ts).
LIMIT_24H = {"pm10": 100, "pm25": 60}
# A daily mean needs 18 of 24 hours (75%, as for the hourly means in fetch_obs.py).
MIN_DAY_HOURS = 18

PARAMS = {
    "objective": "regression",
    "learning_rate": 0.08,
    "num_leaves": 31,
    "min_data_in_leaf": 200,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "lambda_l2": 1.0,
    "verbosity": -1,
    "seed": 7,
}


def features(f: pd.DataFrame) -> pd.DataFrame:
    """Model inputs from one station's hourly CAMS + ERA5 series. Mirrored in TypeScript (packages/models)."""
    x = pd.DataFrame(index=f.index)
    for k in ("cams_pm10", "cams_pm2_5", "cams_dust", "cams_aerosol_optical_depth"):
        x[k] = f[k]
    for k in ("cams_pm10", "cams_pm2_5", "cams_dust"):
        x[f"{k}_mean3h"] = f[k].rolling(3, min_periods=1).mean()
        x[f"{k}_mean24h"] = f[k].rolling(24, min_periods=1).mean()
    x["dust_share"] = f["cams_dust"] / f["cams_pm10"].clip(lower=1)
    x["fine_share"] = f["cams_pm2_5"] / f["cams_pm10"].clip(lower=1)
    for k in (
        "temperature_2m",
        "relative_humidity_2m",
        "dew_point_2m",
        "surface_pressure",
        "wind_speed_10m",
        "wind_gusts_10m",
        "cloud_cover",
        "precipitation",
        "shortwave_radiation",
        "soil_moisture_0_to_7cm",
        "boundary_layer_height",
    ):
        x[k] = f[k]
    rad = np.deg2rad(f["wind_direction_10m"])
    x["wind_dir_sin"] = np.sin(rad)
    x["wind_dir_cos"] = np.cos(rad)
    x["precip_24h"] = f["precipitation"].rolling(24, min_periods=1).sum()
    x["blh_mean24h"] = f["boundary_layer_height"].rolling(24, min_periods=1).mean()
    local = f.index.tz_convert("Asia/Kolkata")
    hour = local.hour + local.minute / 60
    doy = local.day_of_year
    x["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    x["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    x["doy_sin"] = np.sin(2 * np.pi * doy / 365.25)
    x["doy_cos"] = np.cos(2 * np.pi * doy / 365.25)
    x["weekend"] = (local.day_of_week >= 5).astype(float)
    return x


def load() -> pd.DataFrame:
    rows = []
    for st in stations("ncr"):
        o, fp = OBS_DIR / f"{st['id']}.parquet", FEAT_DIR / f"{st['id']}.parquet"
        if not (o.exists() and fp.exists()):
            continue
        f = pd.read_parquet(fp)
        x = features(f)
        obs = pd.read_parquet(o).reindex(x.index)
        d = x.join(obs)
        d["station"] = st["id"]
        d["station_km"] = km(SITE, (st["lat"], st["lon"]))
        rows.append(d)
    return pd.concat(rows)


def daily(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    local = df.index.tz_convert("Asia/Kolkata").normalize()
    g = df.assign(day=local).groupby(["station", "day"])
    n = g[cols[0]].count()
    m = g[cols].mean()
    return m[n >= MIN_DAY_HOURS]


def scores(obs: np.ndarray, pred: np.ndarray) -> dict:
    e = pred - obs
    ss = ((obs - obs.mean()) ** 2).sum()
    return {
        "n": int(len(obs)),
        "rmse": float(np.sqrt((e**2).mean())),
        "mae": float(np.abs(e).mean()),
        "bias": float(e.mean()),
        "r2": float(1 - (e**2).sum() / ss) if ss else None,
        "obsMean": float(obs.mean()),
        "predMean": float(pred.mean()),
    }


def exceedance(obs: np.ndarray, pred: np.ndarray, limit: float) -> dict:
    o, p = obs > limit, pred > limit
    hits, misses, false = int((o & p).sum()), int((o & ~p).sum()), int((~o & p).sum())
    return {
        "obsDays": int(o.sum()),
        "predDays": int(p.sum()),
        "hits": hits,
        "pod": hits / (hits + misses) if hits + misses else None,
        "far": false / (hits + false) if hits + false else None,
    }


def evaluate(df: pd.DataFrame, pol: str, pred: np.ndarray) -> dict:
    cams = df[POLLUTANTS[pol]].to_numpy()
    obs = df[pol].to_numpy()
    d = daily(df.assign(pred=pred), [pol, POLLUTANTS[pol], "pred"])
    return {
        "hourly": {"cams": scores(obs, cams), "corrected": scores(obs, pred)},
        "daily": {"cams": scores(d[pol].to_numpy(), d[POLLUTANTS[pol]].to_numpy()), "corrected": scores(d[pol].to_numpy(), d["pred"].to_numpy())},
        "exceedanceDays": {
            "limit": LIMIT_24H[pol],
            "cams": exceedance(d[pol].to_numpy(), d[POLLUTANTS[pol]].to_numpy(), LIMIT_24H[pol]),
            "corrected": exceedance(d[pol].to_numpy(), d["pred"].to_numpy(), LIMIT_24H[pol]),
        },
        "stations": int(df["station"].nunique()),
    }


def predict(booster: lgb.Booster, x: pd.DataFrame, smear: float) -> np.ndarray:
    return np.expm1(booster.predict(x)) * smear + (smear - 1)


def export(booster: lgb.Booster, cols: list[str], smear: float, pol: str) -> dict:
    """Flat arrays per tree for the TypeScript evaluator: internal nodes 0..n-1, leaves as ~index."""
    trees = []
    for t in booster.dump_model()["tree_info"]:
        f, thr, left, right, dleft, nan, leaves = [], [], [], [], [], [], []

        def walk(node: dict) -> int:
            if "leaf_value" in node:
                leaves.append(round(node["leaf_value"], 7))
                return ~(len(leaves) - 1)
            i = len(f)
            f.append(node["split_feature"])
            thr.append(float(node["threshold"]))
            dleft.append(1 if node["default_left"] else 0)
            # LightGBM missing types: None (NaN compared as 0), Zero (0 and NaN take the default side), NaN.
            nan.append({"None": 0, "Zero": 1, "NaN": 2}[node["missing_type"]])
            left.append(0)
            right.append(0)
            left[i] = walk(node["left_child"])
            right[i] = walk(node["right_child"])
            return i

        root = walk(t["tree_structure"])
        trees.append({"root": root, "f": f, "t": thr, "l": left, "r": right, "d": dleft, "m": nan, "v": leaves})
    return {"pollutant": pol, "transform": "log1p", "smear": smear, "features": cols, "trees": trees}


def demo_site() -> pd.DataFrame:
    """The committed 2025 demo snapshot (fixtures/demo) in the shape fetch_features.py writes."""
    fx = ROOT / "fixtures" / "demo"
    w = json.loads((fx / "weather.json").read_text())["data"]["series"]
    a = json.loads((fx / "airQuality.json").read_text())["data"]
    df = pd.DataFrame({**w["values"], **{f"cams_{k}": v for k, v in a["values"].items()}})
    df.index = pd.to_datetime(w["time"], utc=True)
    return df


def main() -> None:
    site = demo_site()
    site_x = features(site)
    # Feature parity for the TypeScript port: the first 30 hours (rolling windows filling) and a sample.
    pick = list(range(30)) + list(range(30, len(site_x), 97))
    (MODEL_DIR / "parity-features.json").write_text(
        json.dumps({"index": pick, "rows": site_x.iloc[pick].replace({np.nan: None}).to_dict("records")})
    )
    df = load()
    df = df[df.index >= pd.Timestamp("2025-02-01", tz="UTC")]
    cols = [c for c in df.columns if c not in ("pm10", "pm25", "station", "station_km")]
    metrics: dict = {"features": cols, "params": PARAMS, "timeSplit": str(TIME_SPLIT.date()), "spatialTest": sorted(GURUGRAM_TEST)}
    for pol in POLLUTANTS:
        d = df[df[pol].notna()]
        space = d[d["station"].isin(GURUGRAM_TEST)]
        rest = d[~d["station"].isin(GURUGRAM_TEST)]
        train, time = rest[rest.index < TIME_SPLIT], rest[rest.index >= TIME_SPLIT]
        y = np.log1p(train[pol])
        folds = list(GroupKFold(5).split(train[cols], y, groups=train["station"]))
        cv = lgb.cv(
            PARAMS,
            lgb.Dataset(train[cols], y),
            num_boost_round=2000,
            folds=folds,
            callbacks=[lgb.early_stopping(50, verbose=False)],
        )
        rounds = len(cv["valid l2-mean"])
        booster = lgb.train(PARAMS, lgb.Dataset(train[cols], y), num_boost_round=rounds)
        resid = y - booster.predict(train[cols])
        smear = float(np.mean(np.exp(resid)))
        both = space[space.index >= TIME_SPLIT]
        metrics[pol] = {
            "rounds": rounds,
            "cvRmseLog": float(np.sqrt(cv["valid l2-mean"][-1])),
            "trainStations": int(train["station"].nunique()),
            "trainHours": int(len(train)),
            "smear": smear,
            "spatialTest": evaluate(space, pol, predict(booster, space[cols], smear)),
            "timeTest": evaluate(time, pol, predict(booster, time[cols], smear)),
            "spatialAndTimeTest": evaluate(both, pol, predict(booster, both[cols], smear)) if len(both) else None,
            "importance": dict(
                sorted(
                    zip(cols, map(float, booster.feature_importance("gain"))), key=lambda kv: -kv[1]
                )[:10]
            ),
        }
        # Shipped model: all stations and hours, same settings.
        y_all = np.log1p(d[pol])
        final = lgb.train(PARAMS, lgb.Dataset(d[cols], y_all), num_boost_round=rounds)
        smear_all = float(np.mean(np.exp(y_all - final.predict(d[cols]))))
        model = export(final, cols, smear_all, pol)
        # Demo site, 2025: CAMS vs corrected vs Sector-51 (2.6 km away, a spatial-test station).
        # The held-out model never saw a Gurugram station, so only it gives an honest comparison.
        held = pd.Series(predict(booster, site_x[cols], smear), index=site_x.index)
        shipped = pd.Series(predict(final, site_x[cols], smear_all), index=site_x.index)
        s51 = pd.read_parquet(OBS_DIR / "10825.parquet")[pol].reindex(site_x.index)
        ok = s51.notna()
        metrics[pol]["demoSite2025"] = {
            "camsMean": float(site[POLLUTANTS[pol]].mean()),
            "shippedMean": float(shipped.mean()),
            "sector51HoursCompared": int(ok.sum()),
            "sector51Mean": float(s51[ok].mean()),
            "camsMeanSameHours": float(site[POLLUTANTS[pol]][ok].mean()),
            "heldOutMeanSameHours": float(held[ok].mean()),
            "heldOutHourlyVsSector51": scores(s51[ok].to_numpy(), held[ok].to_numpy()),
            "camsHourlyVsSector51": scores(s51[ok].to_numpy(), site[POLLUTANTS[pol]][ok].to_numpy()),
        }
        (MODEL_DIR / f"background-{pol}.json").write_text(json.dumps(model, separators=(",", ":")))
        sample = d.sample(200, random_state=1)
        (MODEL_DIR / f"parity-{pol}.json").write_text(
            json.dumps(
                {
                    "rows": sample[cols].replace({np.nan: None}).to_dict("records"),
                    "pred": predict(final, sample[cols], smear_all).round(4).tolist(),
                }
            )
        )
        m = metrics[pol]
        for name in ("spatialTest", "timeTest", "spatialAndTimeTest"):
            e = m[name]
            if not e:
                continue
            h, dd, x = e["hourly"], e["daily"], e["exceedanceDays"]
            print(
                f"{pol} {name:19} stations {e['stations']:2}  hourly RMSE {h['cams']['rmse']:6.1f} -> {h['corrected']['rmse']:6.1f}"
                f"  bias {h['cams']['bias']:+7.1f} -> {h['corrected']['bias']:+6.1f}  daily R² {dd['cams']['r2']:.2f} -> {dd['corrected']['r2']:.2f}"
                f"  exceed days obs {x['cams']['obsDays']} cams {x['cams']['predDays']} corr {x['corrected']['predDays']}",
                flush=True,
            )
    (OUT_DIR / "metrics.json").write_text(json.dumps(metrics, indent=1))


if __name__ == "__main__":
    main()
