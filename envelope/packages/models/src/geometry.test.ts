import { describe, expect, it } from 'vitest';
import {
  bufferConvex,
  centroid,
  compassToOpenMeteoAzimuth,
  facadeEdges,
  fromLocalEN,
  orientationOf,
  signedArea,
  toLocalEN,
} from './geometry';

const origin = { lat: 28.406, lon: 77.085 };

describe('local ENU conversion', () => {
  it('maps the origin to (0, 0)', () => {
    const p = toLocalEN(origin, origin);
    expect(p.e).toBeCloseTo(0, 6);
    expect(p.n).toBeCloseTo(0, 6);
  });

  it('matches hand-checked metres per degree at 28.406° N', () => {
    // Hand check (WGS84 series): m/deg lat = 111132.92 − 559.82·cos 2φ + 1.175·cos 4φ = 110,825.95 m
    // m/deg lon = 111412.84·cos φ − 93.5·cos 3φ + 0.118·cos 5φ = 97,991.5 m
    expect(toLocalEN({ lat: origin.lat + 0.001, lon: origin.lon }, origin).n).toBeCloseTo(110.826, 1);
    expect(toLocalEN({ lat: origin.lat, lon: origin.lon + 0.001 }, origin).e).toBeCloseTo(97.9915, 1);
  });

  it('round-trips through fromLocalEN to < 1 mm', () => {
    const en = { e: 412.3, n: -287.9 };
    const back = toLocalEN(fromLocalEN(en, origin), origin);
    expect(Math.abs(back.e - en.e)).toBeLessThan(0.001);
    expect(Math.abs(back.n - en.n)).toBeLessThan(0.001);
  });
});

describe('polygon measures', () => {
  // 45 m (E–W) × 30 m (N–S) rectangle, counter-clockwise, centred on the origin.
  const rect = [
    { e: -22.5, n: -15 },
    { e: 22.5, n: -15 },
    { e: 22.5, n: 15 },
    { e: -22.5, n: 15 },
  ];

  it('area = 45 × 30 = 1,350 m², positive for CCW', () => {
    expect(signedArea(rect)).toBeCloseTo(1350, 9);
    expect(signedArea([...rect].reverse())).toBeCloseTo(-1350, 9);
  });

  it('centroid is the centre', () => {
    const c = centroid(rect);
    expect(c.e).toBeCloseTo(0, 9);
    expect(c.n).toBeCloseTo(0, 9);
  });

  it('outward normals: south, east, north, west', () => {
    const edges = facadeEdges(rect);
    expect(edges.map((e) => Math.round(e.normalAzimuthDeg))).toEqual([180, 90, 0, 270]);
    expect(edges.map((e) => e.lengthM)).toEqual([45, 30, 45, 30]);
    // Clockwise input gives the same outward directions.
    const cw = facadeEdges([...rect].reverse()).map((e) => Math.round(e.normalAzimuthDeg));
    expect(cw.sort()).toEqual([0, 180, 270, 90].sort());
  });

  it('buffers a convex ring: 45 × 30 + 15 m each side → 75 × 60 = 4,500 m²', () => {
    const plot = bufferConvex(rect, 15);
    expect(signedArea(plot)).toBeCloseTo(4500, 6);
    expect(plot[0]!.e).toBeCloseTo(-37.5, 9);
    expect(plot[0]!.n).toBeCloseTo(-30, 9);
  });

  it('classifies orientation in 45° sectors', () => {
    expect(orientationOf(0)).toBe('N');
    expect(orientationOf(44.9)).toBe('N');
    expect(orientationOf(45)).toBe('E');
    expect(orientationOf(180)).toBe('S');
    expect(orientationOf(315)).toBe('N');
    expect(orientationOf(-90)).toBe('W');
  });
});

describe('Open-Meteo azimuth convention (0 = south, −90 = east, 90 = west, ±180 = north)', () => {
  it('converts compass azimuths', () => {
    expect(compassToOpenMeteoAzimuth(0)).toBe(180); // north-facing facade
    expect(compassToOpenMeteoAzimuth(90)).toBe(-90); // east
    expect(compassToOpenMeteoAzimuth(180)).toBe(0); // south
    expect(compassToOpenMeteoAzimuth(270)).toBe(90); // west
    expect(compassToOpenMeteoAzimuth(360)).toBe(180);
  });
});
