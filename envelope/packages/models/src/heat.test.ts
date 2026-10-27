import { describe, expect, it } from 'vitest';
import { SURFACES, longwaveDown, surfaceTemperature, utci, utciCategory } from './heat';
import { solarPosition } from './solar';

describe('solar position (NOAA)', () => {
  it('June solstice solar noon at 28.406° N: altitude = 90 − (28.406 − 23.44) ≈ 85.0°, sun due south', () => {
    let best = { alt: -90, az: 0 };
    for (let m = 0; m < 24 * 60; m++) {
      const p = solarPosition(new Date(Date.UTC(2025, 5, 21, 0, m)), 28.406, 77.085);
      if (p.altitudeDeg > best.alt) best = { alt: p.altitudeDeg, az: p.azimuthDeg };
    }
    expect(best.alt).toBeCloseTo(85.0, 0);
    expect(Math.abs(best.az - 180)).toBeLessThan(3);
  });

  it('sun is below the horizon at local midnight and in the east in the morning', () => {
    expect(solarPosition(new Date('2025-06-21T18:30:00Z'), 28.406, 77.085).altitudeDeg).toBeLessThan(0); // 00:00 IST
    const am = solarPosition(new Date('2025-06-21T03:30:00Z'), 28.406, 77.085); // 09:00 IST
    expect(am.azimuthDeg).toBeGreaterThan(60);
    expect(am.azimuthDeg).toBeLessThan(110);
  });
});

describe('heat module', () => {
  it('UTCI(Ta 25, Tmrt 25, v 1.0, RH 50) ≈ 24.6 °C (pythermalcomfort documentation example)', () => {
    expect(utci(25, 25, 1.0, 50)).toBeCloseTo(24.6, 1);
    expect(utciCategory(24.6)).toBe('no thermal stress');
    expect(utciCategory(33)).toBe('strong heat stress');
  });

  it('surface energy balance: no radiation and L↓ = σTa⁴ gives Ts ≈ Ta', () => {
    const ts = surfaceTemperature({
      directH: 0,
      diffuse: 0,
      shade: 0,
      svf: 1,
      taC: 30,
      lDown: 5.670374419e-8 * 303.15 ** 4,
      uLocal: 1,
      surface: { albedo: 0.2, emissivity: 1, ef: 0, cG: 0 },
    });
    expect(ts).toBeCloseTo(30, 3);
  });

  it('sunlit bare soil runs hotter than grass, and shade cools it', () => {
    const base = {
      directH: 700,
      diffuse: 150,
      shade: 0,
      svf: 1,
      taC: 38,
      lDown: longwaveDown(38, 15, 0.1, 1),
      uLocal: 1.5,
    };
    const soil = surfaceTemperature({ ...base, surface: SURFACES.soil });
    const grass = surfaceTemperature({ ...base, surface: SURFACES.grass });
    const shaded = surfaceTemperature({ ...base, shade: 1, surface: SURFACES.soil });
    expect(soil).toBeGreaterThan(grass + 5);
    expect(shaded).toBeLessThan(soil - 10);
  });
});
