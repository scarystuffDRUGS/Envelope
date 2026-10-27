import type { AirVar, BackgroundCorrection, HourlySeries, WeatherVar } from '@envelope/data';
import { backgroundFeatures, correctSeries, nearestStation } from '@envelope/models';
import { BACKGROUND_CARD, BACKGROUND_MODELS } from '@envelope/models/background-models';

/** Corrections by site, year and data fetch time: a year of hours takes about a second. */
const memo = new Map<string, BackgroundCorrection>();

/**
 * Station-corrected background PM (D-038). Inside the trained area (within trainedAreaKm of a
 * training station) both series are corrected; outside it, or without weather and air data, the
 * status says why and the app keeps raw CAMS.
 */
export function correctBackground(
  lat: number,
  lon: number,
  weather: HourlySeries<WeatherVar> | null,
  air: HourlySeries<AirVar> | null,
  key: string,
): BackgroundCorrection {
  const card = BACKGROUND_CARD;
  const model = { id: card.id, region: card.region, trainedAreaKm: card.trainedAreaKm, period: card.period };
  const { stations: _stations, ...summary } = card;
  const near = nearestStation(card, lat, lon);
  const nearest = { name: near.name, km: Math.round(near.km * 10) / 10 };
  if (near.km > card.trainedAreaKm)
    return { status: 'outside', model, card: summary, nearestStation: nearest };
  if (!weather || !air || weather.time.length !== air.time.length)
    return { status: 'unavailable', model, card: summary, nearestStation: nearest };
  const cached = memo.get(key);
  if (cached) return cached;
  const cols = backgroundFeatures({ time: air.time, air: air.values, weather: weather.values });
  const out: BackgroundCorrection = {
    status: 'corrected',
    model,
    card: summary,
    nearestStation: nearest,
    pm10: correctSeries(BACKGROUND_MODELS.pm10, cols).map((v) => Math.round(v * 10) / 10),
    pm2_5: correctSeries(BACKGROUND_MODELS.pm25, cols).map((v) => Math.round(v * 10) / 10),
  };
  memo.set(key, out);
  return out;
}
