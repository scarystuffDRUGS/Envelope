import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BuildingSpec } from './building';
import { takeoff } from './building';
import { quantities } from './construction/quantities';
import { vehicleFlows } from './construction/vehicles';
import { NO_GHG_CONTROLS, ghgResult } from './ghg';
import { defaultAssumptions } from './params';

const spec = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/demo/building.json'), 'utf8'),
) as BuildingSpec;
const a = defaultAssumptions();
const t = {
  ...takeoff(spec),
  footprintAreaM2: 1350,
  facadeAreaM2: 6480,
  windowAreaM2: 2592,
  roofAreaM2: 1350,
};
const q = quantities(t, 12, a);
const prog = { excavation: 1, structure: 11, finishing: 9 };
const flows = vehicleFlows(q, prog, a, 30);

describe('GHG A1–A5', () => {
  const r = ghgResult(t, q, flows, prog, a, NO_GHG_CONTROLS);

  it('concrete A1–A3 = 7,290 m³ × 2,400 kg/m³ × 0.13 = 2,274,480 kgCO2e', () => {
    expect(r.a1a3.concrete).toBeCloseTo(7290 * 2400 * 0.13, 0);
  });

  it('rebar A1–A3 = 729,000 kg × 1.99 = 1,450,710 kgCO2e', () => {
    expect(r.a1a3.rebar).toBeCloseTo(729000 * 1.99, 0);
  });

  it('baseline site power from DG: 8,000 kWh × 21 months × 0.30 L/kWh × 2.68 = 135,072 kgCO2', () => {
    const plant = (6000 * 1 + 3000 * 11 + 1000 * 9) * 2.68;
    const haul = flows.reduce((s, f) => s + f.totalVkt * 0.35, 0) * 2.68;
    expect(r.a5Diesel).toBeCloseTo(8000 * 21 * 0.3 * 2.68 + plant + haul, 3);
    expect(r.scope2).toBe(0);
  });

  it('diesel by use: plant 6,000 × 1 + 3,000 × 11 + 1,000 × 9 = 48,000 L; DG 8,000 × 21 × 0.30 = 50,400 L', () => {
    expect(r.a5DieselLitresBy.plant).toBeCloseTo(48000, 6);
    expect(r.a5DieselLitresBy.dg).toBeCloseTo(50400, 6);
    expect(r.a5DieselLitresBy.plant + r.a5DieselLitresBy.dg + r.a5DieselLitresBy.haul).toBeCloseTo(
      r.a5DieselLitres,
      6,
    );
    expect(r.siteKwh).toBeCloseTo(168000, 6);
  });

  it('monthly profile sums to the total and has one entry per month', () => {
    expect(r.monthly).toHaveLength(21);
    expect(r.monthly.reduce((s, v) => s + v, 0)).toBeCloseTo(r.total / 1000, 3);
  });

  it('mitigations lower the total: low-carbon concrete −30% of concrete; grid power moves DG to Scope 2', () => {
    const m = ghgResult(t, q, flows, prog, a, {
      ...NO_GHG_CONTROLS,
      lowCarbonConcrete: true,
      gridPower: true,
    });
    expect(m.a1a3.concrete).toBeCloseTo(r.a1a3.concrete * 0.7, 0);
    expect(m.scope2).toBeCloseTo(8000 * 21 * 0.71, 3);
    expect(m.total).toBeLessThan(r.total);
  });
});
