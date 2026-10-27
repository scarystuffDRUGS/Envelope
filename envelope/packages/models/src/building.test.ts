import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BuildingSpec } from './building';
import { buildingStateForMonth, takeoff } from './building';

const spec = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/demo/building.json'), 'utf8'),
) as BuildingSpec;

describe('takeoff of the demo building (45 × 30 m, 12 floors × 3.6 m, WWR 40%)', () => {
  const t = takeoff(spec);

  it('footprint area ≈ 1,350 m² from lon/lat corners', () => {
    expect(t.footprintAreaM2).toBeCloseTo(1350, 0);
  });

  it('height = 12 × 3.6 = 43.2 m; GFA = 1,350 × 12 = 16,200 m²', () => {
    expect(t.heightM).toBeCloseTo(43.2, 9);
    expect(t.gfaM2).toBeCloseTo(16200, -1);
  });

  it('facades: perimeter 150 m, area 150 × 43.2 = 6,480 m², windows 40% = 2,592 m²', () => {
    expect(t.perimeterM).toBeCloseTo(150, 1);
    expect(t.facadeAreaM2).toBeCloseTo(6480, 0);
    expect(t.windowAreaM2).toBeCloseTo(2592, 0);
    expect(t.facades.map((f) => f.orientation)).toEqual(['S', 'E', 'N', 'W']);
  });

  it('volume = 1,350 × 43.2 = 58,320 m³', () => {
    expect(t.volumeM3).toBeCloseTo(58320, -1);
  });
});

describe('building state by construction month (3 + 12 + 9 months)', () => {
  it('excavation: no floors, digging progresses', () => {
    expect(buildingStateForMonth(1, 12)).toMatchObject({ phase: 'excavation', floorsBuilt: 0 });
    expect(buildingStateForMonth(3, 12).excavationProgress).toBe(1);
  });

  it('structure: ceil(12 × m / 12) floors', () => {
    expect(buildingStateForMonth(4, 12).floorsBuilt).toBe(1);
    expect(buildingStateForMonth(9, 12).floorsBuilt).toBe(6);
    expect(buildingStateForMonth(15, 12).floorsBuilt).toBe(12);
  });

  it('structure: frame height in the 3D view is continuous, 2 floors over 3 months', () => {
    // Programme 1 + 3 + 2: month 3 is structure month 2 of 3 → 2 × 2/3 = 1.33 floors
    const schedule = [
      { id: 'excavation', label: 'Excavation', months: 1 },
      { id: 'structure', label: 'Structure', months: 3 },
      { id: 'finishing', label: 'Finishing', months: 2 },
    ] as const;
    const st = buildingStateForMonth(3, 2, schedule);
    expect(st.frameFloors).toBeCloseTo(4 / 3, 9);
    expect(st.floorsBuilt).toBe(2);
    expect(st).toMatchObject({ monthInPhase: 2, phaseMonths: 3 });
  });

  it('finishing: full height, envelope installed linearly', () => {
    expect(buildingStateForMonth(16, 12)).toMatchObject({ phase: 'finishing', floorsBuilt: 12 });
    expect(buildingStateForMonth(16, 12).envelopeProgress).toBeCloseTo(1 / 9, 9);
    expect(buildingStateForMonth(24, 12).envelopeProgress).toBe(1);
  });
});
