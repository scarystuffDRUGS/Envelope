/** Which background PM the models use, and the wording the UI and report show for it (D-038). */
import type { SiteData } from '@envelope/data';

/**
 * CAMS series for the engine: inside the trained area the station-corrected PM10 and PM2.5 replace
 * CAMS as the dust background; dust and AOD stay CAMS. Raw CAMS stays in siteData for display.
 */
export function backgroundAir(sd: SiteData | null): Record<string, number[]> | null {
  const air = sd?.airQuality?.values ?? null;
  const bg = sd?.background;
  if (!air || bg?.status !== 'corrected' || !bg.pm10 || !bg.pm2_5) return air;
  return { ...air, pm10: bg.pm10, pm2_5: bg.pm2_5 };
}

export interface BackgroundNote {
  corrected: boolean;
  /** Status line label. */
  short: string;
  /** Tooltip, Data sheet caption and report sentence. */
  long: string;
}

export function backgroundNote(sd: SiteData | null): BackgroundNote {
  const bg = sd?.background;
  if (!bg)
    return {
      corrected: false,
      short: 'Background PM: raw CAMS',
      long: 'Background PM is raw CAMS: the station correction was not available for this data.',
    };
  const near = bg.nearestStation ? `${bg.nearestStation.name}, ${bg.nearestStation.km} km` : 'none';
  if (bg.status === 'corrected')
    return {
      corrected: true,
      short: 'Background PM: corrected',
      long: `Background PM is CAMS corrected with the ${bg.model.region} station model (ground monitoring stations, ${bg.model.period.from} to ${bg.model.period.to}); nearest training station ${near}.`,
    };
  if (bg.status === 'outside')
    return {
      corrected: false,
      short: 'Background PM: raw CAMS',
      long: `Background PM is raw CAMS: the site is outside the ${bg.model.region} station model's trained area (within ${bg.model.trainedAreaKm} km of a training station; nearest ${near}). CAMS has not been checked against ground stations here.`,
    };
  return {
    corrected: false,
    short: 'Background PM: raw CAMS',
    long: 'Background PM is raw CAMS: weather or air-quality data needed for the station correction is missing.',
  };
}
