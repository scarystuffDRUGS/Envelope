import { describe, expect, it } from 'vitest';
import {
  ap42DropKgPerMg,
  ap42UnpavedGPerVkt,
  briggsUrban,
  erosionEventPm10G,
  erosionPotential,
  flatFrictionVelocity,
  plume,
  stabilityClass,
  unitConcentration,
} from './dust';

describe('dust reference values (TEST_PLAN, hand-checked)', () => {
  it('Gaussian plume, Briggs urban D, Q 1 g/s, u 1 m/s, x 100 m, ground source and receptor on centreline', () => {
    const { sy, sz } = briggsUrban('D', 100);
    // σy = 0.16·100·1.04^−0.5 = 15.69 m; σz = 0.14·100·1.03^−0.5 = 13.79 m
    expect(sy).toBeCloseTo(15.69, 2);
    expect(sz).toBeCloseTo(13.79, 2);
    // C = Q/(π u σy σz) = 1/(π·15.69·13.79) g/m³ = 1,471 µg/m³
    expect(plume(1, 1, sy, sz, 0, 0, 0, 1e9) * 1e6).toBeCloseTo(1471, -1);
  });

  it('unitConcentration reproduces the plume for one source 100 m upwind (wind from the west)', () => {
    const src = [{ e: 0, n: 0, share: 1, sy0: 0, sz0: 0, H: 0 }];
    expect(unitConcentration(src, 100, 0, 0, 270, 1, 'D', 1e9)).toBeCloseTo(1471, -1);
    expect(unitConcentration(src, -100, 0, 0, 270, 1, 'D', 1e9)).toBe(0); // upwind receptor
  });

  it('AP-42 13.2.4: U 3 m/s, M 2% → 0.35 × 0.0016 × (3/2.2)^1.3 = 8.38e-4 kg/Mg', () => {
    expect(ap42DropKgPerMg(0.35, 3, 2)).toBeCloseTo(8.38e-4, 6);
  });

  it('AP-42 13.2.2: s 8.5%, W 20 t → 1.5 × (8.5/12)^0.9 × (20/3)^0.45 lb/VMT × 281.9', () => {
    // (0.70833)^0.9 = 0.73316; (6.6667)^0.45 = 2.34831; × 1.5 = 2.5825 lb/VMT; × 281.9 = 728.0 g/VKT
    expect(ap42UnpavedGPerVkt('PM10', 8.5, 20)).toBeCloseTo(728.0, 0);
  });

  it('AP-42 13.2.5 Example 2: flat area, fastest mile 14.6 m/s, u*t 0.54 → P 8.82 g/m², 670 m² → 3.0 kg PM10', () => {
    expect(flatFrictionVelocity(14.6)).toBeCloseTo(0.77, 2); // 0.053 × 14.6
    expect(erosionPotential(0.77, 0.54)).toBeCloseTo(8.82, 2); // 58 × 0.23² + 25 × 0.23
    expect(0.5 * erosionPotential(0.77, 0.54) * 670).toBeCloseTo(2954.1, 1); // AP-42: "= 3.0 kg"
  });

  it('AP-42 13.2.5 Example 1 (Table 13.2.5-5): u*t 1.12, u* 1.23 / 1.27 / 1.31 → P 3.45 / 5.06 / 6.84 g/m²', () => {
    expect(erosionPotential(1.23, 1.12)).toBeCloseTo(3.45, 2);
    expect(erosionPotential(1.27, 1.12)).toBeCloseTo(5.055, 3); // printed as 5.06
    expect(erosionPotential(1.31, 1.12)).toBeCloseTo(6.84, 2);
    expect(erosionPotential(1.12, 1.12)).toBe(0);
  });

  it('erosion event, demo defaults: u⁺10 11.52 m/s, u*t 1.02 → flat soil 0; only the pile 0.9 regime erodes (7.855 g)', () => {
    // Flat: 0.053 × 11.52 = 0.61 < 1.02. Pile us/ur 0.9: u* = 0.1 × 0.9 × 11.52 = 1.0368;
    // P = 58 × 0.0168² + 25 × 0.0168 = 0.43637 g/m²; × 12% × 300 m² × k 0.5 = 7.855 g.
    expect(erosionEventPm10G(11.52, 1.02, 3150, 0, 1, 1)).toBe(0);
    expect(erosionEventPm10G(11.52, 1.02, 3150, 300, 1, 1)).toBeCloseTo(7.855, 3);
    expect(erosionEventPm10G(11.52, 1.02, 3150, 300, 1, 0.05)).toBeCloseTo(7.855 * 0.05, 4);
  });

  it('Pasquill–Turner table cases', () => {
    expect(stabilityClass(1.5, 700, 10)).toBe('A');
    expect(stabilityClass(2.5, 0, 20)).toBe('F');
    expect(stabilityClass(4, 0, 60)).toBe('D');
    expect(stabilityClass(7, 400, 20)).toBe('D');
    expect(stabilityClass(3, 400, 95)).toBe('D');
  });
});
