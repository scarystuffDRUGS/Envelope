import { describe, expect, it } from 'vitest';
import { getSiteData, isDemoSite } from './siteData';

describe('site data and the demo snapshot', () => {
  it('treats only points within 1 km of the demo plot as the demo site', () => {
    expect(isDemoSite(28.406, 77.085)).toBe(true);
    expect(isDemoSite(28.412, 77.085)).toBe(true); // ~670 m north
    expect(isDemoSite(28.451, 77.085)).toBe(false); // ~5 km north
    expect(isDemoSite(13.08, 80.27)).toBe(false); // Chennai
  });

  it('offline, another city gets "unavailable" instead of the Gurugram snapshot', async () => {
    const d = await getSiteData(13.08, 80.27, 2025, { offline: true });
    expect(d.weather).toBeNull();
    expect(d.provenance.weather.status).toBe('unavailable');
    expect(d.provenance.osm.status).toBe('unavailable');
    expect(d.provenance.receptors?.status).toBe('unavailable');
    expect(d.osm).toBeNull();
  });

  it('offline, the demo site still runs from cache or the committed snapshot', async () => {
    const d = await getSiteData(28.406, 77.085, 2025, { offline: true });
    expect(d.weather?.values.temperature_2m).toHaveLength(8760);
    expect(['cached', 'snapshot']).toContain(d.provenance.weather.status);
  });
});

describe('station-corrected background PM (D-038)', () => {
  it('corrects the demo site, inside the NCR trained area, and keeps raw CAMS beside it', async () => {
    const d = await getSiteData(28.406, 77.085, 2025, { offline: true });
    const bg = d.background!;
    expect(bg.status).toBe('corrected');
    expect(bg.nearestStation!.km).toBeLessThan(bg.model.trainedAreaKm);
    expect(bg.pm10).toHaveLength(d.airQuality!.values.pm10.length);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    // CAMS overestimates NCR background PM10 (ml/out/metrics.json); the correction lowers it.
    expect(mean(bg.pm10!)).toBeLessThan(mean(d.airQuality!.values.pm10));
    expect(bg.pm10!.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
  }, 30_000);

  it('leaves sites outside the trained area on raw CAMS and says why', async () => {
    const d = await getSiteData(13.08, 80.27, 2025, { offline: true });
    expect(d.background).toMatchObject({ status: 'outside' });
    expect(d.background!.pm10).toBeUndefined();
    expect(d.background!.nearestStation!.km).toBeGreaterThan(1000);
  });
});
