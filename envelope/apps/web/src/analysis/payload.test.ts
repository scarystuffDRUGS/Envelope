import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SiteData } from '@envelope/data';
import type { BuildingSpec } from '@envelope/models';
import { Engine, NO_MITIGATIONS, defaultAssumptions } from '@envelope/models';
import { TABLE_ORDER, templateNarrative, validateNarrative } from '@envelope/report';
import { describe, expect, it } from 'vitest';
import { delta } from './kpis';
import { buildPayload } from './payload';

const fx = (f: string) =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../../fixtures/demo', f), 'utf8'));
const spec = fx('building.json') as BuildingSpec;
const weather = fx('weather.json').data.series;
const air = fx('airQuality.json').data;
const engine = new Engine({ spec, weatherYear: 2025, weather: weather.values, air: air.values, osm: null });
const mitigations = {
  ...NO_MITIGATIONS,
  sprinkling: true,
  windBarriers: true,
  coverStockpiles: true,
  greenNetting: true,
  wheelWashing: true,
};
const input = {
  assumptions: defaultAssumptions(),
  programmeOverride: null,
  constructionMonth: 7,
  dayOfMonth: 15,
  hour: 14,
};
const results = {
  baseline: engine.run({ ...input, mitigations: NO_MITIGATIONS }),
  mitigated: engine.run({ ...input, mitigations }),
};
const siteData = { weatherYear: 2025, weather, airQuality: air, provenance: {} } as unknown as SiteData;
const payload = buildPayload({
  results,
  mitigations,
  assumptions: {},
  siteData,
  projectName: 'Test',
  title: 'Test',
  company: 'Test',
  preparedBy: 'Test',
});
const table = (id: string) => payload.tables.find((t) => t.id === id)!;

describe('report payload on the 2025 demo snapshot', () => {
  it('numbers tables in the order they appear in the report', () => {
    expect(payload.tables.map((t) => t.id)).toEqual(TABLE_ORDER);
  });

  it('splits site diesel into plant, DG sets and site vehicles that add up to Scope 1', () => {
    const rows = table('ghg').rows;
    const v = (label: string) => Number(rows.find((r) => r[0] === label)![1]!.replace(/,/g, ''));
    // 48,000 L plant + 50,400 L DG + 44 L haul at 2.68 kgCO2/L: 128.6 + 135.1 + 0.1 = 263.8 t
    expect(v('A5 diesel, construction plant')).toBe(129);
    expect(v('A5 diesel, DG sets for site power')).toBe(135);
    expect(v('A5 diesel, haul vehicles on site')).toBe(0);
    expect(table('ghg').note).toContain('50,400 L of diesel in Scope 1, so Scope 2 is 0');
  });

  it('states the selected hour and the working-hour denominator of heat-stress hours', () => {
    const note = table('kpi').note!;
    expect(note).toContain('15 Jul 2025, 14:00 IST');
    expect(note).toContain(
      `of ${new Intl.NumberFormat('en-IN').format(results.baseline.heat.workingHours)} h`,
    );
  });

  it('reports PM10 by source, summing to the total', () => {
    const rows = table('dustSources').rows;
    const sum = rows.slice(0, -1).reduce((s, r) => s + Number(r[1]), 0);
    expect(sum).toBeCloseTo(results.baseline.dust.totalPm10T, 1);
  });

  it('states every exceedance against its limit: NAAQS 2% allowance, WHO, heat wave, LETI, CAQM', () => {
    const row = (start: string) => payload.compliance.find((c) => c.regulation.startsWith(start))!;
    const months = results.mitigated.programme.effective;
    const n = months.excavation + months.structure + months.finishing;
    expect(row('NAAQS 2009 (CPCB)').requirement).toContain(`${(0.02 * n * (365 / 12)).toFixed(1)} days`);
    expect(row('NAAQS 2009 and WHO').status).toMatch(/WHO guideline/);
    expect(row('NAAQS 2009 at schools').status).toMatch(/^(None mapped|Not assessed|\d)/);
    expect(row('IMD heat-wave').status).toMatch(/days at or above 40 °C/);
    expect(row('LETI').requirement).toContain('600 kgCO2e/m²');
    // Demo plot (Gurugram) is in NCR; the anti-smog gun count follows its area.
    expect(row('CAQM').status).toMatch(/anti-smog guns required: \d/);
    const climate = table('climate');
    expect(climate.head).toEqual(['Parameter', 'Value', 'Limit or threshold']);
    expect(climate.rows.find((r) => r[0] === 'Maximum air temperature')![2]).toContain('40 °C');
  });

  it('keeps every sentence of the template narrative through the number validator', () => {
    const { dropped } = validateNarrative(templateNarrative(payload), payload);
    expect(dropped).toEqual([]);
  });

  it('states raw CAMS and an unavailable correction when the site data has none', () => {
    expect(payload.background?.corrected).toBe(false);
    expect(table('backgroundModel').rows[0]![1]).toContain('raw CAMS');
    expect(table('climate').rows.map((r) => r[0])).toContain('Mean background PM10 used for dust (CAMS)');
  });
});

describe('report payload with the station-corrected background', () => {
  const card = JSON.parse(
    readFileSync(resolve(__dirname, '../../../../packages/models/src/data/background-card.json'), 'utf8'),
  );
  const { stations: _s, ...summary } = card;
  const pm10 = air.values.pm10.map((v: number) => v / 2);
  const pm2_5 = air.values.pm2_5.map((v: number) => v / 2);
  const background = {
    status: 'corrected' as const,
    model: { id: card.id, region: card.region, trainedAreaKm: card.trainedAreaKm, period: card.period },
    card: summary,
    nearestStation: { name: 'Sector-51, Gurugram - HSPCB', km: 2.6 },
    pm10,
    pm2_5,
  };
  const p = buildPayload({
    results,
    mitigations,
    assumptions: {},
    siteData: { ...siteData, background },
    projectName: 'Test',
    title: 'Test',
    company: 'Test',
    preparedBy: 'Test',
  });
  const t = (id: string) => p.tables.find((x) => x.id === id)!;

  it('gives raw CAMS and corrected means side by side and a model card with held-out metrics', () => {
    const rows = Object.fromEntries(t('climate').rows.map((r) => [r[0], r[1]]));
    expect(rows['Mean background PM10, reference year: raw CAMS / station-corrected']).toMatch(
      /^[\d,]+ \/ [\d,]+ µg\/m³$/,
    );
    const card = t('backgroundModel').rows.map((r) => r.join(': '));
    expect(card[0]).toBe('Status for this site: Applied: station-corrected CAMS');
    expect(card.some((r) => r.startsWith('PM10 hourly RMSE, held-out stations'))).toBe(true);
    expect(p.background).toEqual({ corrected: true, note: expect.stringContaining('station model') });
  });

  it('keeps every template sentence, including the model-card numbers, through the validator', () => {
    expect(validateNarrative(templateNarrative(p), p).dropped).toEqual([]);
  });
});

describe('delta', () => {
  it('shows no percentage when both values round to zero', () => {
    expect(delta(0.02, 0.01, 1)).toEqual({ abs: '0', pct: '–' });
    expect(delta(104.6, 51.7, 1).pct).toBe('−51%');
  });
});
