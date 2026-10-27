import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BuildingSpec } from '../building';
import { takeoff } from '../building';
import { defaultAssumptions } from '../params';
import { autoProgramme, checkProgramme, programmeTotal, scaleProgramme } from './programme';
import { quantities } from './quantities';
import { vehicleFlows } from './vehicles';

const spec = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../fixtures/demo/building.json'), 'utf8'),
) as BuildingSpec;
const a = defaultAssumptions();
// Exact hand-check geometry (45 × 30 m); geometry tests cover the lon/lat takeoff separately.
const t = { ...takeoff(spec), footprintAreaM2: 1350, facadeAreaM2: 6480, windowAreaM2: 2592 };
const q = quantities(t, spec.floors, a);
const HAUL = 30; // m, gate to centroid for the demo plot (15 m buffer + 15 m half-depth)

describe('quantities for the default building (45 × 30 m, 12 floors)', () => {
  it('GFA = 1,350 × 12 = 16,200 m²; concrete = 0.45 × 16,200 = 7,290 m³; rebar = 45 × 16,200 = 729 t', () => {
    expect(q.gfaM2).toBeCloseTo(16200, -1);
    expect(q.concreteM3).toBeCloseTo(7290, -1);
    expect(q.rebarKg / 1000).toBeCloseTo(729, 0);
  });

  it('excavation = 1,350 × 1 × 3.6 = 4,860 m³ bank; × 1.25 bulking = 6,075 m³ loose', () => {
    expect(q.excavationBankM3).toBeCloseTo(4860, -1);
    expect(q.excavationLooseM3).toBeCloseTo(6075, -1);
  });
});

describe('auto programme', () => {
  it('excavation ceil(4,860 / 400 / 26) = 1; structure ceil(13 × 21 / 26) = 11; finishing ceil(11 × 0.75) = 9', () => {
    expect(autoProgramme(q, spec.floors, a)).toEqual({ excavation: 1, structure: 11, finishing: 9 });
  });

  it('doubling the floors lengthens the auto programme', () => {
    const q2 = quantities(t, 24, a);
    const p2 = autoProgramme(q2, 24, a);
    expect(p2.structure).toBe(Math.ceil((25 * 21) / 26)); // 21
    expect(programmeTotal(p2)).toBeGreaterThan(programmeTotal(autoProgramme(q, 12, a)));
  });

  it('scales phases proportionally when only the total changes', () => {
    const p = scaleProgramme({ excavation: 3, structure: 12, finishing: 9 }, 12);
    expect(programmeTotal(p)).toBe(12);
    // 3 × 12/24 = 1.5 → 2; 9 × 12/24 = 4.5 → 5; structure takes the remainder 12 − 2 − 5 = 5.
    expect(p).toEqual({ excavation: 2, structure: 5, finishing: 5 });
  });

  it('rejects zero and warns below half the auto value', () => {
    const auto = { excavation: 1, structure: 11, finishing: 9 };
    expect(checkProgramme({ excavation: 0, structure: 11, finishing: 9 }, auto).errors).toHaveLength(1);
    expect(checkProgramme({ excavation: 1, structure: 5, finishing: 9 }, auto).warnings).toHaveLength(1);
    expect(checkProgramme(auto, auto)).toEqual({ errors: [], warnings: [] });
  });
});

describe('vehicle movement', () => {
  const prog = { excavation: 1, structure: 11, finishing: 9 };
  const flows = vehicleFlows(q, prog, a, HAUL);
  const by = (m: string) => flows.find((f) => f.material === m)!;

  it('mixer loads = ceil(7,290 ÷ 6) = 1,215; trips with returns = 2,430; per day = 2,430 ÷ (11 × 26) = 8.50', () => {
    expect(by('concrete').loads).toBe(1215);
    expect(by('concrete').trips).toBe(2430);
    expect(by('concrete').tripsPerDay).toBeCloseTo(2430 / 286, 6);
  });

  it('spoil loads = ceil(6,075 ÷ 10) = 608 tipper loads in the excavation phase', () => {
    expect(by('spoil').loads).toBe(608);
    expect(by('spoil').tripsPerDay).toBeCloseTo(1216 / 26, 6);
  });

  it('VKT/day = trips/day × 30 m route', () => {
    expect(by('concrete').vktPerDay).toBeCloseTo(((2430 / 286) * 30) / 1000, 9);
  });

  it('doubling the floors roughly doubles structure-phase total trips', () => {
    const q2 = quantities(t, 24, a);
    const f2 = vehicleFlows(q2, prog, a, HAUL);
    const total = (fs: typeof flows) =>
      fs.filter((f) => f.phase === 'structure').reduce((s, f) => s + f.trips, 0);
    expect(total(f2) / total(flows)).toBeCloseTo(2, 1);
  });

  it('halving a user-set structure phase keeps total trips and doubles trips/day', () => {
    const half = vehicleFlows(q, { ...prog, structure: 5.5 }, a, HAUL);
    const c = half.find((f) => f.material === 'concrete')!;
    expect(c.trips).toBe(by('concrete').trips);
    expect(c.tripsPerDay).toBeCloseTo(2 * by('concrete').tripsPerDay, 9);
  });

  it('a larger footprint changes excavation trips', () => {
    const bigger = { ...t, footprintAreaM2: t.footprintAreaM2 * 2 };
    const fb = vehicleFlows(quantities(bigger, 12, a), prog, a, HAUL);
    expect(fb.find((f) => f.material === 'spoil')!.loads).toBe(Math.ceil((2 * 6075) / 10));
  });
});
