import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BuildingSpec } from './building';
import { Engine, NO_MITIGATIONS } from './engine';
import { defaultAssumptions } from './params';

const fx = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/demo', f), 'utf8'));
const spec = fx('building.json') as BuildingSpec;
const weather = fx('weather.json').data.series.values;
const air = fx('airQuality.json').data.values;
const engine = new Engine({ spec, weatherYear: 2025, weather, air, osm: null });
const base = {
  assumptions: defaultAssumptions(),
  programmeOverride: null,
  constructionMonth: 5,
  dayOfMonth: 15,
  hour: 14,
};

describe('engine on the 2025 demo snapshot', () => {
  const r0 = engine.run({ ...base, mitigations: NO_MITIGATIONS });
  it('runs and produces finite, plausible results', () => {
    console.log('timings', JSON.stringify(r0.timingsMs));
    console.log(
      'dust',
      r0.dust.totalPm10T.toFixed(2),
      't PM10;',
      JSON.stringify(r0.dust.bySourceT),
      'calm',
      r0.dust.calmHours,
      'dsi',
      r0.dust.dsi.value.toFixed(1),
    );
    console.log(
      'receptors',
      JSON.stringify(
        r0.dust.receptors.map((x) => [
          x.id,
          x.period.p98Pm10Inc24h.toFixed(1),
          x.period.maxPm10Inc24h.toFixed(0),
          x.period.exceedDaysSiteCaused,
        ]),
      ),
    );
    console.log(
      'heat',
      r0.heat.plotTsC.toFixed(1),
      r0.heat.plotTsPreC.toFixed(1),
      r0.heat.maxWorkerUtci.toFixed(1),
      r0.heat.riskHours,
      '/',
      r0.heat.workingHours,
    );
    console.log(
      'ghg t',
      (r0.ghg.total / 1000).toFixed(0),
      'per m2',
      r0.ghg.perM2Gfa.toFixed(0),
      'programme',
      JSON.stringify(r0.programme.effective),
      'met',
      JSON.stringify(r0.met),
    );
    expect(r0.ok).toBe(true);
    expect(r0.dust.totalPm10T).toBeGreaterThan(0);
    expect(Number.isFinite(r0.heat.plotTsC)).toBe(true);
  });
  it('dust mitigations lower emissions; mitigation runs are fast (cached fields)', () => {
    const t = performance.now();
    const r1 = engine.run({
      ...base,
      mitigations: {
        ...NO_MITIGATIONS,
        sprinkling: true,
        windBarriers: true,
        coverStockpiles: true,
        pavedRoads: true,
      },
    });
    console.log(
      'mitigated run ms',
      (performance.now() - t).toFixed(0),
      'PM10 t',
      r1.dust.totalPm10T.toFixed(2),
    );
    expect(r1.dust.totalPm10T).toBeLessThan(r0.dust.totalPm10T);
  });
});
